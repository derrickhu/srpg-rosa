import { createBattleSim } from '@/battle/engine';
import { effectiveUnitDef } from '@/battle/effectiveUnit';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import type { UnitState } from '@/battle/types';
import { UNIT_DEFS } from '@/data/unitDefs';
import { STAGES_MVP, type StageDefMvp } from '@/data/stagesMvp';
import { CHARACTER_DEFS, characterStatsAtLevel } from '@/data/characterCatalog';
import { defaultSkillId, skillDefForId } from '@/data/skillCatalog';
import { resolveEnemyBattleSkill } from '@/data/enemySkillCatalog';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { getTerrainSpec } from '@/data/terrainSpec';

/**
 * 关卡难度模拟器：用真实引擎自动跑一关若干局，回报胜率。
 *
 * 从 `chapter1Sim.test.ts` 抽出来的，因为 8 章都要用同一套口径。各章的
 * **设计假设**（打到这一章时玩家几级、带谁、攒了多少精华）留在各章自己的测试里写，
 * 不塞进这里——那些数字是要被讨论和调整的内容，藏进公共助手会让每次调参都变成
 * 「改一个数字，八章一起动」，而各章的难度目标本来就不一样。
 */

export interface SimCfg {
  stageIdx: number;
  deployIds: string[];
  level: number;
  /** 每个上场单位平摊到的精华攻击加成 */
  bonusAtkEach: number;
  enemyScale: number;
  /** 携带的治疗药剂数（有人低于 45% 血时使用，模拟 HUD 手动喝药） */
  healPotions?: number;
  /**
   * 直接给一份关卡数据，绕过 `STAGES_MVP[stageIdx]`。
   *
   * 给 GM 地图编辑器用：它要在**存盘之前**就能看到这版布局的胜率，否则每调一格
   * 都得先落盘再重算，而落盘会污染 git 工作区——那样「先试一下」的成本比手算还高。
   * 各章的回归测试仍走 `stageIdx`，口径不变。
   */
  stage?: StageDefMvp;
}

export interface SimResult {
  winRate: number;
  avgRounds: number;
  skillCasts: Record<string, number>;
}

function buildPlayers(stage: StageDefMvp, cfg: SimCfg): UnitState[] {
  const { w, h } = gridSize(stage.terrain);
  const [r0, r1] = playerDeployRowRange(h);
  const cx = Math.floor(w / 2);
  // 从中间往两边排，跳过不可通行格；近战放前排 r0，远程放后排 r1（模拟玩家常识布阵）。
  // 每次随机扰动横向次序：normal AI 是确定性的，靠布阵采样引入方差
  const orderX: number[] = [];
  for (let d = 0; d < w; d++) {
    if (cx - d >= 0) orderX.push(cx - d);
    if (d > 0 && cx + d < w) orderX.push(cx + d);
  }
  for (let i = orderX.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [orderX[i], orderX[j]] = [orderX[j]!, orderX[i]!];
  }
  const rowCells = (y: number): { x: number; y: number }[] =>
    orderX
      .filter((x) => getTerrainSpec(stage.terrain[y]![x]!).moveCost !== Infinity)
      .map((x) => ({ x, y }));
  const front = rowCells(r0);
  const back = rowCells(r1);
  let fi = 0;
  let bi = 0;
  return cfg.deployIds.map((id, i) => {
    const def = CHARACTER_DEFS.find((c) => c.id === id)!;
    const st = characterStatsAtLevel(def, cfg.level);
    const sk = skillDefForId(defaultSkillId(def.profession))!;
    const isRanged = def.strike?.isRanged ?? UNIT_DEFS[def.profession].strike.isRanged;
    const pos = isRanged ? (back[bi++] ?? front[fi++]!) : (front[fi++] ?? back[bi++]!);
    return {
      uid: `p_${i + 1}`,
      defId: def.profession,
      faction: 'player',
      hp: st.maxHp,
      pos: { x: pos.x, y: pos.y },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: { id: sk.id, name: sk.name, cooldown: sk.cooldown, kind: sk.kind },
      bonusAtk: cfg.bonusAtkEach,
      mercMaxHp: st.maxHp,
      mercAtk: st.atk,
      mercSpd: st.spd,
      mercMove: st.move,
      mercRange: def.strike?.range ?? UNIT_DEFS[def.profession].strike.range,
      mercIsRanged: isRanged,
      mercTaunt: def.strike?.taunt ?? UNIT_DEFS[def.profession].strike.taunt,
    } satisfies UnitState;
  });
}

function buildEnemies(stage: StageDefMvp, scale: number): UnitState[] {
  return stage.enemies.map((e) => {
    const base = UNIT_DEFS[e.defId].base;
    const b = {
      maxHp: e.stats?.maxHp ?? base.maxHp,
      atk: e.stats?.atk ?? base.atk,
      spd: e.stats?.spd ?? base.spd,
      move: e.stats?.move ?? base.move,
    };
    const maxHp = Math.round(b.maxHp * scale);
    // 与 DeployManager.enemySpawnToUnitState 同口径：只认显式 skillSkin/skillId
    const battleSkill = resolveEnemyBattleSkill({
      skillSkin: e.skillSkin,
      skillId: e.skillId,
    });
    return {
      uid: e.uid,
      defId: e.defId,
      faction: 'enemy',
      hp: maxHp,
      pos: { x: e.x, y: e.y },
      skillCd: 0,
      movedInTurn: false,
      battleSkill,
      displayName: e.name,
      boss: e.boss,
      mercMaxHp: maxHp,
      mercAtk: Math.round(b.atk * scale),
      mercSpd: b.spd,
      mercMove: b.move,
    } satisfies UnitState;
  });
}

export function simulateStage(cfg: SimCfg, n: number): SimResult {
  const stage = cfg.stage ?? STAGES_MVP[cfg.stageIdx]!;
  let wins = 0;
  let rounds = 0;
  const skillCasts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const units = [...buildEnemies(stage, cfg.enemyScale), ...buildPlayers(stage, cfg)];
    const sim = createBattleSim(units, stage.terrain, UNIT_DEFS, {
      aiDifficulty: stage.aiDifficulty ?? 'normal',
    });
    let potions = cfg.healPotions ?? 0;
    while (!sim.isDone()) {
      sim.stepTurn();
      if (potions > 0 && !sim.isDone()) {
        const players = sim.getUnits().filter((u) => u.faction === 'player' && u.hp > 0);
        const low = players.some((u) => u.hp < effectiveUnitDef(u, UNIT_DEFS).maxHp * 0.45);
        if (low) {
          sim.usePotion('heal');
          potions -= 1;
        }
      }
    }
    const rep = sim.runToEnd();
    for (const ev of rep.events) {
      if (ev.type === 'skillCast') skillCasts[ev.skillId] = (skillCasts[ev.skillId] ?? 0) + 1;
    }
    if (rep.winner === 'player') wins += 1;
    rounds += rep.rounds;
  }
  return { winRate: wins / n, avgRounds: rounds / n, skillCasts };
}

/** 一章的战斗关 stageIndex（按节点顺序，不含商店），免得各章测试硬写下标 */
export function battleStageIndices(dungeonId: string): number[] {
  const d = getDungeonDef(dungeonId);
  if (!d) throw new Error(`副本不存在：${dungeonId}`);
  return d.nodes
    .filter((n) => n.kind !== 'shop' && n.stageIndex !== undefined)
    .map((n) => n.stageIndex!);
}

/** 该章 Boss 节点的敌人缩放（副本基础 × 节点 1.1），各章测试直接取用 */
export function stageScale(dungeonId: string, stageIdx: number): number {
  const d = getDungeonDef(dungeonId);
  if (!d) throw new Error(`副本不存在：${dungeonId}`);
  const node = d.nodes.find((n) => n.stageIndex === stageIdx);
  return (d.enemyScaleBase ?? 1) * (node?.enemyScale ?? 1);
}

export const SWORD = 'hero_sword_ray';
export const BOW = 'hero_bow_hill';
export const SHIELD = 'hero_shield_gron';
export const CAVALRY = 'hero_cav_lance';
export const TRIO = [SWORD, BOW, SHIELD];

/**
 * 每个配置模拟局数。
 *
 * 300 时二项分布标准差约 2.8pp，而 Boss 带药那条的余量只有 5pp 左右——断言会偶发翻红，
 * 然后所有人学会重跑一次当没事，这个测试就废了。1000 把标准差压到 1.5pp，
 * 整套测试仍在几秒内跑完，很划算。
 *
 * 实测过一次：关 6 重复 10 轮，标准差 1.75pp、极差 5.2pp（略高于二项估算，因为方差还有
 * 布阵扰动这一层）。所以**各章的阈值区间至少要留 4pp 余量**，写得比这更紧的断言
 * 不是在守难度曲线，是在赌骰子。反过来，小于 ~4pp 的真实回归这套测试是看不出来的，
 * 需要那个精度时应当另写定点用例，而不是把这里的区间收紧。
 */
export const N = 1000;

/**
 * 把胜率打出来，不只在断言失败时才看得到。
 *
 * 这些阈值是区间而不是等式，"通过"可能意味着 86% 也可能意味着 99%，而 86% 离下界只有一步。
 * 调伤害/地形/技能时需要看到的是**余量**：光知道没红不足以判断这次改动是不是把曲线推到了悬崖边。
 */
export function report(label: string, r: SimResult, bound: string): void {
  // 回合数一并打出来：它是单场时长预算（目标 30–60 秒）的唯一客观依据，
  // 也是评估「纯人工操作要点多少次」时唯一能拿来算的数（回合数 × 上场人数）。
  console.log(
    `  [胜率] ${label}\t${(r.winRate * 100).toFixed(1)}%\t要求 ${bound}`
    + `\t平均 ${r.avgRounds.toFixed(1)} 回合`,
  );
}
