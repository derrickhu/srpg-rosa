import {
  CHARACTER_DEFS,
  getCharacterDef,
} from '@/data/characterCatalog';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { POTION_DEFS } from '@/data/potionCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { allSkillMods, modRollWeight, modStacks } from '@/data/skillModCatalog';
import { describePotion } from '@/data/itemText';
import { battleSkillIdsForCharacter } from './DeployManager';
import { instantiateCharacter } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import {
  createRunState,
  deployedCharacters,
  currentDungeon,
  currentNode,
  currentStage,
  requireRun,
  resetPid,
  type EndlessCarry,
  type LootOption,
  type MetaState,
  type MvpGameState,
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
 * 重复通关整章的魂晶。首通拿的是 `dungeon.metaReward`（大额，一次性）。
 *
 * 保留一个可重复的量，是因为玩家总要有个地方刷；把它挂在**整章通关**上，
 * 刷的成本就是完整打一遍，而不是进副本赢两场就跑。
 */
export const DUNGEON_REPEAT_SOUL = 3;

/** 进入副本：建立 run，定位首节点 */
export function startRun(state: MvpGameState, dungeonId: string, partyRosterIds: string[]): void {
  resetPid();
  state.run = createRunState(dungeonId, partyRosterIds);
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

/** 记下「这个副本至少打通到第几个节点」，写进 meta 供扫荡解锁判定 */
function markNodeCleared(meta: MetaState, dungeonId: string, nodeIndex: number): void {
  const prev = meta.clearedNodesByDungeonId[dungeonId] ?? 0;
  meta.clearedNodesByDungeonId[dungeonId] = Math.max(prev, nodeIndex + 1);
}

// ---------------- 扫荡：打赢过的关直接拿结果 ----------------

/**
 * 每天每个副本能扫荡几**轮**（一轮 = 该副本的全部战斗节点）。
 *
 * 配额按轮而不是按固定次数给，是因为副本长度不一样（草原 7 场，之后每章 5 场）。
 * 定一个固定数字必然在某一章不够用，而不够用的表现特别难受：扫到第 5 关时次数耗尽，
 * 玩家被迫手动打完剩下两关——他刚才选扫荡就是因为不想打，这时候等于被半路扣下。
 * 按轮给保证了「要么完整扫一遍，要么完整打一遍」，不会卡在中间。
 */
export const SWEEP_ROUNDS_PER_DAY = 1;

/** 一个副本里的战斗节点数（商店不算，它不消耗扫荡次数） */
function battleNodeCount(dungeonId: string): number {
  const d = DUNGEON_DEFS.find((x) => x.id === dungeonId);
  if (!d) return 0;
  return d.nodes.filter((n) => n.kind !== 'shop').length;
}

/** 这个副本每天的扫荡次数上限 */
export function sweepQuota(dungeonId: string): number {
  return battleNodeCount(dungeonId) * SWEEP_ROUNDS_PER_DAY;
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
 * 当前节点能不能扫荡：**以前通过过** + 今天还有配额。
 *
 * 「打赢过才能扫荡」是硬条件，因为扫荡直接判胜、不做模拟。没打过就能扫等于白送通关。
 * 而配额是给刷取设的天花板：扫荡发的是全额奖励（含整章重复通关的魂晶），
 * 不限次的话最优策略就变成一直点扫荡，那关卡本身就没人玩了。
 */
export function canSweep(state: MvpGameState): boolean {
  const run = state.run;
  if (!run) return false;
  // 无尽每波敌人落点都是现抽的，不存在「这关我赢过了」可以兑现
  if (isEndlessDungeon(run.dungeonId) || isSandboxDungeon(run.dungeonId)) return false;
  return nodeClearedBefore(state) && sweepLeftToday(state.meta, run.dungeonId) > 0;
}

/**
 * 当前节点以前通过过没有——即「够不够格扫荡」，不看今天还剩几次。
 *
 * 和 `canSweep` 分开导出是给界面用的：次数用完时按钮仍要画出来并说明原因，
 * 直接藏掉的话玩家会以为扫荡是随机出现的。
 */
export function nodeClearedBefore(state: MvpGameState): boolean {
  const run = state.run;
  if (!run) return false;
  if (isEndlessDungeon(run.dungeonId) || isSandboxDungeon(run.dungeonId)) return false;
  if (currentNode(state).kind === 'shop') return false;
  return run.nodeIndex < (state.meta.clearedNodesByDungeonId[run.dungeonId] ?? 0);
}

/** 扣一次当前副本的扫荡配额。调用方须先过 `canSweep` */
export function consumeSweep(state: MvpGameState): void {
  const run = requireRun(state);
  const today = todayKey();
  const rec = state.meta.sweepUsageByDungeonId[run.dungeonId];
  const used = rec && rec.date === today ? rec.used : 0;
  state.meta.sweepUsageByDungeonId[run.dungeonId] = { date: today, used: used + 1 };
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
}

/**
 * 整章通关：首通给 `metaReward`（大额，一次性），之后每次重复通关给 `DUNGEON_REPEAT_SOUL`。
 * 返回本次入账的魂晶和刚入队的角色，供结算界面展示。
 */
export function finishRunVictory(state: MvpGameState): FinishRunResult {
  if (state.run && isSandboxDungeon(state.run.dungeonId)) {
    state.run = null;
    state.phase = 'hub';
    return { soul: 0, unlockedRosterIds: [] };
  }
  const d = currentDungeon(state);
  // 判首通要在 `applyDungeonClearUnlocks` 之前——它会把 id 写进 clearedDungeonIds
  const firstClear = !state.meta.clearedDungeonIds.includes(d.id);
  const unlockedRosterIds = applyDungeonClearUnlocks(state.meta, d.id);
  const soul = firstClear ? d.metaReward : DUNGEON_REPEAT_SOUL;
  state.meta.metaCurrency += soul;
  state.run = null;
  state.phase = 'hub';
  return { soul, unlockedRosterIds };
}

/** 本局通关能拿多少魂晶（供结算/大厅提前告知，不产生副作用） */
export function dungeonClearSoul(state: MvpGameState, dungeonId: string): number {
  const d = DUNGEON_DEFS.find((x) => x.id === dungeonId);
  if (!d) return 0;
  return state.meta.clearedDungeonIds.includes(d.id) ? DUNGEON_REPEAT_SOUL : d.metaReward;
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
