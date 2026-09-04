import {
  CHARACTER_DEFS,
  getCharacterDef,
} from '@/data/characterCatalog';
import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import {
  LEGACY_CLEARED_STAR_MASK,
  emptyRunStarStats,
  evaluateChapterStars,
  isStarBit,
  starBitMask,
  starCondLabel,
  type ChapterStarDef,
  type RunStarStats,
} from '@/data/chapterStars';
import { POTION_DEFS } from '@/data/potionCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { allSkillMods, modRollWeight, modStacks } from '@/data/skillModCatalog';
import { describePotion } from '@/data/itemText';
import { battleSkillIdsForCharacter } from './DeployManager';
import { instantiateCharacter } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import {
  adventureRunOf,
  createRunState,
  deployedCharacters,
  currentDungeon,
  currentNode,
  currentStage,
  prepareLaneForStart,
  requireRun,
  resetPid,
  type EndlessCarry,
  type LootOption,
  type MetaState,
  type MvpGameState,
  type RunState,
} from './GameState';
import {
  ENDLESS_CLEAR_BONUS,
  ENDLESS_MAX_WAVES,
  ENDLESS_WAVE_SOUL,
  isEndlessDungeon,
} from '@/data/endlessCatalog';
import { isSandboxDungeon } from '@/data/sandboxLab';
import type { UnitState } from '@/battle/types';

/**
 * 魂晶的三个来源，合起来要同时满足两件事：**不能无风险刷**，而且**失败也有长进**。
 *
 * 之前的做法是每场胜利累进 `run.pendingSoul`、通关才兑现、放弃结算一半。它堵住了刷，
 * 但代价是玩家得随身记着一个「暂存」概念——战后弹窗只能写「+2 暂存（累计 6，通关兑现）」，
 * 三个数字讲一件还没发生的事，而这一屏本该是给正反馈的。
 *
 * 换成按**首通**发放就不需要那个概念了：重复打同一个节点拿不到魂晶，刷自然不成立，
 * 所以可以当场入账、当场显示「+2」。
 *
 * 节点级首通（而不是只在 Boss 给）是必须的，否则会锁死：新手打不过 Boss → 拿不到魂晶
 * → 升不了级 → 更打不过 Boss。有了节点首通，推进本身就换得到永久成长。
 */
export const NODE_FIRST_CLEAR_SOUL = 2;
export const BOSS_FIRST_CLEAR_SOUL = 5;

/**
 * 重复通关整章的魂晶（本关奖励）。通关奖励改成按星第一次点亮发，
 * 三星之和仍是 `dungeon.metaReward`。
 *
 * 保留一个可重复的量，是因为玩家总要有个地方刷；把它挂在**整章通关**上，
 * 刷的成本就是完整打一遍，而不是进副本赢两场就跑。
 */
export const DUNGEON_REPEAT_SOUL = 3;

export function recordRunBattleStats(
  run: RunState,
  input: { rounds: number; allyDeaths: number },
): void {
  const stats = run.starStats ?? emptyRunStarStats();
  stats.battleRounds += Math.max(0, Math.floor(input.rounds));
  stats.allyDeaths += Math.max(0, Math.floor(input.allyDeaths));
  run.starStats = stats;
}

export function recordRunPotionUse(run: RunState): void {
  const stats = run.starStats ?? emptyRunStarStats();
  stats.potionsUsed += 1;
  run.starStats = stats;
}

export function recordRunShopBuy(run: RunState): void {
  const stats = run.starStats ?? emptyRunStarStats();
  stats.shopBuys += 1;
  run.starStats = stats;
}

export function chapterStarMask(meta: MetaState, dungeonId: string): number {
  const stored = meta.chapterStarsByDungeonId?.[dungeonId];
  if (stored !== undefined) return stored;
  return meta.clearedDungeonIds.includes(dungeonId) ? LEGACY_CLEARED_STAR_MASK : 0;
}

/**
 * 老档已通关、还没有星字段：三星都算领过。已经写过的章不覆盖。
 */
export function hydrateChapterStars(meta: MetaState): Record<string, number> {
  const stars = { ...(meta.chapterStarsByDungeonId ?? {}) };
  for (const id of meta.clearedDungeonIds) {
    if (stars[id] === undefined) stars[id] = LEGACY_CLEARED_STAR_MASK;
  }
  meta.chapterStarsByDungeonId = stars;
  return stars;
}

export interface ChapterClearPreview {
  soul: number;
  firstClear: boolean;
  newStars: number[];
  labels: string[];
  starMask: number;
}

function previewFrom(
  stars: readonly ChapterStarDef[] | undefined,
  stats: RunStarStats,
  claimedMask: number,
  firstClear: boolean,
): ChapterClearPreview {
  if (!stars || stars.length === 0) {
    return {
      soul: firstClear ? 0 : DUNGEON_REPEAT_SOUL,
      firstClear,
      newStars: [],
      labels: [],
      starMask: claimedMask,
    };
  }
  const achieved = evaluateChapterStars(stars, stats);
  const fresh = starBitMask(achieved);
  const next = claimedMask | fresh;
  const newStars: number[] = [];
  const labels: string[] = [];
  let soul = 0;
  stars.forEach((s, i) => {
    if (isStarBit(fresh, i) && !isStarBit(claimedMask, i)) {
      soul += s.soul;
      newStars.push(i + 1);
      labels.push(starCondLabel(s.cond));
    }
  });
  if (!firstClear) soul += DUNGEON_REPEAT_SOUL;
  return { soul, firstClear, newStars, labels, starMask: next };
}

export function previewChapterClear(state: MvpGameState, dungeonId: string): ChapterClearPreview {
  const d = getDungeonDef(dungeonId);
  const firstClear = !state.meta.clearedDungeonIds.includes(dungeonId);
  const claimed = chapterStarMask(state.meta, dungeonId);
  const stats = state.run?.starStats ?? emptyRunStarStats();
  if (!d?.stars) {
    return previewFrom(undefined, stats, claimed, firstClear);
  }
  return previewFrom(d.stars, stats, claimed, firstClear);
}

/** 进入副本：建立 run，定位首节点 */
export function startRun(state: MvpGameState, dungeonId: string, partyRosterIds: string[]): void {
  resetPid();
  const next = createRunState(dungeonId, partyRosterIds);
  prepareLaneForStart(state, next);
  state.run = next;
  state.phase = currentNode(state).kind === 'shop' ? 'shop' : 'deploy';
}

/**
 * 战斗胜利结算：局内金币 + 首通魂晶（直接入账），并掷出三选一战利品（终局不掷）。
 *
 * 两类奖励刻意分开发、分开显示：金币是**局内**的（下一个补给点花掉），
 * 魂晶是**局外**的（回大厅升级）。以前它们挤在同一行字里，玩家分不清哪个带得走。
 */
/**
 * 把本关金币拆到每次击杀上，总额仍等于 `goldReward`。
 * 敌人比金币多时，前面的击杀掉 1，后面的掉 0。
 */
export function splitStageGold(total: number, killCount: number): number[] {
  const n = Math.max(0, killCount);
  const shares = Array.from({ length: n }, () => 0);
  const pot = Math.max(0, Math.floor(total));
  for (let i = 0; i < pot && n > 0; i++) shares[i % n] += 1;
  return shares;
}

export function applyVictory(state: MvpGameState): void {
  const run = requireRun(state);
  if (isSandboxDungeon(run.dungeonId)) return;
  const node = currentNode(state);
  if (node.kind === 'shop') return;

  const gold = currentStage(state).goldReward;
  run.gold += gold;

  // 顺序要紧：`markNodeCleared` 会把这个节点记成已通过，判首通必须在它之前
  const firstClear = isNodeFirstClear(state.meta, run.dungeonId, run.nodeIndex);
  const soul = firstClear
    ? (node.kind === 'boss' ? BOSS_FIRST_CLEAR_SOUL : NODE_FIRST_CLEAR_SOUL)
    : 0;
  state.meta.metaCurrency += soul;

  run.lastVictory = { gold, soul, firstClear };
  run.pendingLoot = isRunComplete(state) ? null : rollLoot(state);
  markNodeCleared(state.meta, run.dungeonId, run.nodeIndex);
}

/** 这个节点以前通过过没有（`clearedNodesByDungeonId` 记的是「已通过到第几个」） */
function isNodeFirstClear(meta: MetaState, dungeonId: string, nodeIndex: number): boolean {
  return nodeIndex >= (meta.clearedNodesByDungeonId[dungeonId] ?? 0);
}

/** 记下「这个副本至少打通到第几个节点」，用来判节点首通魂晶 */
function markNodeCleared(meta: MetaState, dungeonId: string, nodeIndex: number): void {
  const prev = meta.clearedNodesByDungeonId[dungeonId] ?? 0;
  meta.clearedNodesByDungeonId[dungeonId] = Math.max(prev, nodeIndex + 1);
}

// ---------------- 扫荡：打赢过的关直接拿结果 ----------------

/**
 * 每天每个副本能扫荡几**整章**。
 *
 * 扫荡入口在冒险页，点一次就是整章结算，不再按节点点。按「轮」给配额，
 * 是因为玩家要的是「今天把这章刷完」，不是「今天扫 7 个节点」。
 */
export const SWEEP_ROUNDS_PER_DAY = 1;

/** 这个副本每天的扫荡次数上限（整章一次算 1 次） */
export function sweepQuota(_dungeonId: string): number {
  return SWEEP_ROUNDS_PER_DAY;
}

/**
 * 「今天」的口径：**本地**日期。
 *
 * 用本地时间而不是 UTC，因为配额的说明文字写的是「今天还剩 N 次」，玩家理解的
 * 「今天」就是他手机上显示的那个日期。UTC 会让国内玩家在早上 8 点前看到昨天的额度。
 *
 * 代价是改系统时间能刷额度。不做防御是权衡后的结果：存档就在本地，真想刷的人
 * 直接改存档比改时钟省事得多，多一道校验挡不住他；而按「存的日期不等于今天就归零」
 * 处理，时钟回拨也只是白送额度，不会把正常玩家（跨时区、夏令时）锁在零次上。
 */
function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 今天在这个副本上已经用掉的扫荡次数（跨天自动归零） */
export function sweepUsedToday(meta: MetaState, dungeonId: string): number {
  const rec = meta.sweepUsageByDungeonId[dungeonId];
  if (!rec || rec.date !== todayKey()) return 0;
  return rec.used;
}

/** 今天在这个副本上还能扫荡几次 */
export function sweepLeftToday(meta: MetaState, dungeonId: string): number {
  return Math.max(0, sweepQuota(dungeonId) - sweepUsedToday(meta, dungeonId));
}

/**
 * 这一章能不能扫荡：整章通关过 + 今天还有配额 + 当前没有进行中的冒险。
 *
 * 没通关不能扫，否则等于白送通关。进行中的冒险先结束——扫荡不再进副本，
 * 和「继续冒险」抢入口会让玩家搞不清自己还在哪一节。
 * 无尽 / 活动那条线不挡扫荡，两条线互不影响。
 */
export function canSweepChapter(state: MvpGameState, dungeonId: string): boolean {
  if (isEndlessDungeon(dungeonId) || isSandboxDungeon(dungeonId)) return false;
  if (adventureRunOf(state)) return false;
  if (!state.meta.clearedDungeonIds.includes(dungeonId)) return false;
  return sweepLeftToday(state.meta, dungeonId) > 0;
}

/** 这一章是否已经整章通关（扫荡按钮出现的条件，不看今日配额） */
export function chapterClearedForSweep(meta: { clearedDungeonIds: string[] }, dungeonId: string): boolean {
  return meta.clearedDungeonIds.includes(dungeonId);
}

/**
 * 当前节点以前通过过没有。节点首通魂晶还用这个口径；扫荡已经改成整章入口。
 */
export function nodeClearedBefore(state: MvpGameState): boolean {
  const run = state.run;
  if (!run) return false;
  if (isEndlessDungeon(run.dungeonId) || isSandboxDungeon(run.dungeonId)) return false;
  if (currentNode(state).kind === 'shop') return false;
  return run.nodeIndex < (state.meta.clearedNodesByDungeonId[run.dungeonId] ?? 0);
}

/** 扣一次该副本的整章扫荡配额。调用方须先过 `canSweepChapter` */
export function consumeSweep(state: MvpGameState, dungeonId: string): void {
  const today = todayKey();
  const rec = state.meta.sweepUsageByDungeonId[dungeonId];
  const used = rec && rec.date === today ? rec.used : 0;
  state.meta.sweepUsageByDungeonId[dungeonId] = { date: today, used: used + 1 };
}

/**
 * 冒险页整章扫荡：不建 run、不进战斗，直接发重复通关魂晶。
 *
 * 金币和三选一只在局内有意义；大厅扫荡要的是「今天把这章刷完」，
 * 奖励口径和手打重复通关同一笔 `DUNGEON_REPEAT_SOUL`。
 */
export function applyChapterSweep(state: MvpGameState, dungeonId: string): { soul: number } {
  if (!canSweepChapter(state, dungeonId)) return { soul: 0 };
  consumeSweep(state, dungeonId);
  state.meta.metaCurrency += DUNGEON_REPEAT_SOUL;
  return { soul: DUNGEON_REPEAT_SOUL };
}

/**
 * 战后三选一：3 张**指名道姓**的强化卡。
 *
 * 每张卡都是「某个角色的某条词条」。三个维度缺一不可：
 * - **给谁**：词条按 rosterId 记，所以这是结算主键，也是卡面上的头像。
 * - **哪一招**：只从他**当前会带上场**的技能出词条。给一招没人带的技能发词条
 *   比不发还糟——那张牌摆在那儿只能弃掉，三选一变二选一。
 * - **加什么**：词条本身。
 *
 * 池子只含**本场上场**的人（`deployedCharacters`）。替补没打仗，
 * 给他发词条等于白嫖一轮强化，也让三选一的「给谁」失去取舍。
 *
 * 尽量凑**三个不同的人**：三张卡都是同一个角色时，玩家的选择退化成
 * 「给雷恩挑哪条词条」，队伍层面的取舍就没了。凑不齐才允许重复。
 */
type SkillModLoot = Extract<LootOption, { kind: 'skillMod' }>;

/** 一张候选卡 + 它这一次的抽取权重 */
interface WeightedLoot {
  opt: SkillModLoot;
  weight: number;
}

function lootCandidatesFor(state: MvpGameState, m: Character, depth: number): WeightedLoot[] {
  const run = state.run;
  if (!run) return [];
  const owned = run.skillMods[m.rosterId] ?? [];
  // 只看主槽：词条只强化主技能（见 `unitSkillSpec`），所以临时技能不该出候选。
  // 这样卡面画的那一招**就是**唯一被改的那一招，不需要额外解释作用范围。
  const skillId = battleSkillIdsForCharacter(state, m).main;
  if (!skillId) return [];
  const spec = getSkillSpec(skillId);
  if (!spec) return [];

  const out: WeightedLoot[] = [];
  for (const mod of allSkillMods()) {
    if (!mod.canApply(spec)) continue;
    // 等级闸门只挡专属。通用按技能类型进池，1 级也有锋锐 / 淬毒；
    // 升级打开的是这一招自己的招牌强化（见 `SkillModDef.minLevel`）。
    if (m.level < mod.minLevel) continue;
    const next = modStacks(owned, mod.id) + 1;
    if (next > mod.maxStacks) continue;
    out.push({
      weight: modRollWeight(mod, depth),
      opt: {
        kind: 'skillMod',
        modId: mod.id,
        rosterId: m.rosterId,
        skillId,
        name: `${m.name} · ${mod.name}`,
        desc: mod.describe(next),
      },
    });
  }
  return out;
}

/** 掷点来源。默认 `Math.random`，测试传固定序列来验证权重与去重 */
export type LootRng = () => number;

function shuffleWith<T>(arr: readonly T[], rng: LootRng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 从一个人的候选里按权重抽一张并**从池子里移除**（同一张卡不会在一屏里出现两次）。
 *
 * `avoid` 是这一屏已经出过的词条 id。撞上了就先在剩下的里挑——三张卡都是「锋锐」
 * 时玩家其实只有一个选项。只剩重复项时才允许重复，那也比退化成药剂好。
 */
function drawFrom(pool: WeightedLoot[], avoid: ReadonlySet<string>, rng: LootRng): SkillModLoot | undefined {
  if (pool.length === 0) return undefined;
  const fresh = pool.filter((c) => !avoid.has(c.opt.modId));
  const from = fresh.length ? fresh : pool;
  const total = from.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return undefined;

  let roll = rng() * total;
  let hit = from[from.length - 1]!;
  for (const c of from) {
    roll -= c.weight;
    if (roll < 0) {
      hit = c;
      break;
    }
  }
  pool.splice(pool.indexOf(hit), 1);
  return hit.opt;
}

export function rollLoot(state: MvpGameState, rng: LootRng = Math.random): LootOption[] {
  // 节点越深，稀有/史诗越常见。前几场就狂出史诗的话，后面的三选一只会越来越平淡。
  const depth = state.run?.endless?.wave ?? state.run?.nodeIndex ?? 0;
  const byChar = shuffleWith(deployedCharacters(state), rng).map((m) =>
    lootCandidatesFor(state, m, depth),
  );

  // 先每人抽一张（轮转），抽完一圈还不够 3 张再回头拿第二张。
  const picks: LootOption[] = [];
  const used = new Set<string>();
  for (let round = 0; picks.length < 3 && round < 4; round += 1) {
    const before = picks.length;
    for (const pool of byChar) {
      if (picks.length >= 3) break;
      const opt = drawFrom(pool, used, rng);
      if (!opt) continue;
      picks.push(opt);
      used.add(opt.modId);
    }
    if (picks.length === before) break;
  }

  // 药剂垫底：后期整队词条都点满时，池子会真的抽干。
  while (picks.length < 3) {
    const ids = Object.keys(POTION_DEFS);
    const pid = ids[Math.floor(rng() * ids.length)]!;
    const pd = POTION_DEFS[pid]!;
    picks.push({ kind: 'potion', potionId: pid, name: pd.name, desc: describePotion(pid) });
    if (picks.length >= 3) break;
  }
  return picks;
}

/** 领取一件三选一战利品并清空待选 */
export function claimLoot(state: MvpGameState, opt: LootOption): boolean {
  const run = requireRun(state);
  if (!run.pendingLoot || !run.pendingLoot.includes(opt)) return false;
  switch (opt.kind) {
    case 'skillMod':
      run.skillMods[opt.rosterId] = [...(run.skillMods[opt.rosterId] ?? []), opt.modId];
      break;
    case 'potion':
      run.potions[opt.potionId] = (run.potions[opt.potionId] ?? 0) + 1;
      break;
  }
  run.pendingLoot = null;
  return true;
}

export function skipLoot(state: MvpGameState): void {
  const run = requireRun(state);
  run.pendingLoot = null;
}

/** 是否已通关（节点走完） */
export function isRunComplete(state: MvpGameState): boolean {
  const run = requireRun(state);
  if (isEndlessDungeon(run.dungeonId)) {
    return (run.endless?.clearedCurrent ?? false) && (run.endless?.wave ?? 0) >= ENDLESS_MAX_WAVES;
  }
  const d = currentDungeon(state);
  return run.nodeIndex >= d.nodes.length - 1;
}

export function isEndlessRun(state: MvpGameState): boolean {
  return !!state.run && isEndlessDungeon(state.run.dungeonId);
}

/** 这一局已经打赢的波数（当前波还没赢就不算） */
export function endlessWavesCleared(state: MvpGameState): number {
  const e = state.run?.endless;
  if (!e) return 0;
  return e.clearedCurrent ? e.wave : Math.max(0, e.wave - 1);
}

/**
 * 无尽一波胜利：当场给魂晶，非最后一波掷三选一。
 *
 * 不走 `applyVictory`：那条路径按节点首通发魂晶、按 `isRunComplete`（单节点恒真）
 * 跳过三选一，第一波就会被当成整章通关。
 */
export function applyEndlessWaveVictory(state: MvpGameState): void {
  const run = requireRun(state);
  if (!run.endless) return;
  run.endless.clearedCurrent = true;
  const soul = ENDLESS_WAVE_SOUL;
  state.meta.metaCurrency += soul;
  run.lastVictory = { gold: 0, soul, firstClear: false };
  run.pendingLoot = isRunComplete(state) ? null : rollLoot(state);
}

/** 把还活着的我方记下来，供下一波原地接着打 */
export function snapshotEndlessCarry(units: readonly UnitState[]): EndlessCarry[] {
  return units
    .filter((u) => u.faction === 'player' && u.hp > 0 && u.rosterId)
    .map((u) => ({
      rosterId: u.rosterId!,
      uid: u.uid,
      hp: u.hp,
      pos: { ...u.pos },
      skillCd: u.skillCd,
      tempSkillCd: u.tempSkillCd,
      timedBattleEffects: u.timedBattleEffects?.map((e) => ({ ...e })),
    }));
}

/** 进入下一波：波数 +1，位置沿用上一波结束时的站位 */
export function continueEndlessWave(state: MvpGameState, lastUnits: readonly UnitState[]): void {
  const run = requireRun(state);
  if (!run.endless) return;
  const carry = lastUnits.length > 0
    ? snapshotEndlessCarry(lastUnits)
    : (run.endless.carry ?? []);
  run.endless.carry = carry;
  run.endless.wave += 1;
  run.endless.clearedCurrent = false;
  run.pendingLoot = null;
  run.lastReportWinner = null;
  // 部署格跟着人走，断线重进时 buildBattleUnits 才找得到这些人
  for (const c of carry) {
    const p = run.placements.find((x) => x.rosterId === c.rosterId);
    if (p) {
      p.pos = { ...c.pos };
      p.uid = c.uid;
    }
  }
  state.phase = 'battle';
}

/**
 * 无尽结束（打完 / 全灭 / 放弃）：记下最高波，打完十波再给一笔通关奖。
 * 返回本次额外入账的魂晶（放弃和中途失败是 0，波次奖已经当场发过了）。
 */
export function finishEndlessRun(state: MvpGameState): number {
  const waves = endlessWavesCleared(state);
  const prev = state.meta.endlessBestFloor ?? 0;
  if (waves > prev) state.meta.endlessBestFloor = waves;
  let bonus = 0;
  if (waves >= ENDLESS_MAX_WAVES) {
    bonus = ENDLESS_CLEAR_BONUS;
    state.meta.metaCurrency += bonus;
  }
  state.run = null;
  state.phase = 'hub';
  return bonus;
}

/** 推进到下一节点：清空本节点部署/地形，按节点类型切换阶段 */
export function advanceNode(state: MvpGameState): void {
  const run = requireRun(state);
  run.placements = [];
  run.terrainOverlay = [];
  run.adExtraSlot = 0;
  run.pendingLoot = null;
  run.lastReportWinner = null;
  run.nodeIndex += 1;
  state.phase = currentNode(state).kind === 'shop' ? 'shop' : 'deploy';
}

export interface FinishRunResult {
  soul: number;
  unlockedRosterIds: string[];
  newStars: number[];
  starMask: number;
}

/**
 * 整章通关：新点亮的星发魂晶；已经通关过再打，另加本关重复奖。
 */
export function finishRunVictory(state: MvpGameState): FinishRunResult {
  if (state.run && isSandboxDungeon(state.run.dungeonId)) {
    state.run = null;
    state.phase = 'hub';
    return { soul: 0, unlockedRosterIds: [], newStars: [], starMask: 0 };
  }
  const d = currentDungeon(state);
  hydrateChapterStars(state.meta);
  const preview = previewChapterClear(state, d.id);
  const unlockedRosterIds = applyDungeonClearUnlocks(state.meta, d.id);
  const map = state.meta.chapterStarsByDungeonId ?? {};
  map[d.id] = preview.starMask;
  state.meta.chapterStarsByDungeonId = map;
  state.meta.metaCurrency += preview.soul;
  state.run = null;
  state.phase = 'hub';
  return {
    soul: preview.soul,
    unlockedRosterIds,
    newStars: preview.newStars,
    starMask: preview.starMask,
  };
}

/** 本局通关能拿多少魂晶（供结算弹层提前告知，不产生副作用） */
export function dungeonClearSoul(state: MvpGameState, dungeonId: string): number {
  return previewChapterClear(state, dungeonId).soul;
}

/**
 * 放弃 / 全灭：直接丢弃 run 回大厅，不再有结算。
 *
 * 不给补偿不等于白打——沿途每个**首次**通过的节点已经当场发过魂晶了。
 * 这比原来的「累计一半」既好懂又更抗刷：重复打老节点本来就拿不到东西，
 * 所以没有「赢两场就跑」这条路可走。
 */
export function abandonRun(state: MvpGameState): void {
  state.run = null;
  state.phase = 'hub';
}

/** 通关某副本后解锁的副本与角色。返回本次新入队的角色 id。 */
export function applyDungeonClearUnlocks(meta: MetaState, dungeonId: string): string[] {
  if (!meta.clearedDungeonIds.includes(dungeonId)) {
    meta.clearedDungeonIds.push(dungeonId);
  }
  for (const dd of DUNGEON_DEFS) {
    if (
      dd.unlock.kind === 'clearDungeon' &&
      dd.unlock.dungeonId === dungeonId &&
      !meta.unlockedDungeonIds.includes(dd.id)
    ) {
      meta.unlockedDungeonIds.push(dd.id);
    }
  }
  const unlocked: string[] = [];
  for (const cd of CHARACTER_DEFS) {
    if (
      cd.unlock.kind === 'clearDungeon' &&
      cd.unlock.dungeonId === dungeonId &&
      !meta.roster.some((m) => m.rosterId === cd.id)
    ) {
      const def = getCharacterDef(cd.id);
      if (def) {
        meta.roster.push(instantiateCharacter(def));
        unlocked.push(cd.id);
      }
    }
  }
  return unlocked;
}
