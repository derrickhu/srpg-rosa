import { describe, expect, it } from 'vitest';
import { createBattleSim } from '@/battle/engine';
import { effectiveUnitDef } from '@/battle/effectiveUnit';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import type { UnitState } from '@/battle/types';
import { UNIT_DEFS } from '@/data/unitDefs';
import { STAGES_MVP, type StageDefMvp } from '@/data/stagesMvp';
import { CHARACTER_DEFS, characterStatsAtLevel } from '@/data/characterCatalog';
import { defaultSkillId, skillDefForId } from '@/data/skillCatalog';
import { getTerrainSpec } from '@/data/terrainSpec';

/**
 * 第一章平衡回归：用真实引擎自动跑各关，模拟首通阵容
 * （1 级三初始角色 + 逐关累积精华 + Boss 战喝药），守住难度曲线：
 * 前期引导关高胜率 → 精英关有压力 → Boss 裸打惩罚、备药后可过。
 * 真实玩家还有集火/地形券/蛮力药剂等手段，实际体验优于此模拟。
 */

interface SimCfg {
  stageIdx: number;
  deployIds: string[];
  level: number;
  /** 每个上场单位平摊到的精华攻击加成 */
  bonusAtkEach: number;
  enemyScale: number;
  /** 携带的治疗药剂数（有人低于 45% 血时使用，模拟 HUD 手动喝药） */
  healPotions?: number;
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
    const sk = e.skillId ? skillDefForId(e.skillId) : undefined;
    return {
      uid: e.uid,
      defId: e.defId,
      faction: 'enemy',
      hp: maxHp,
      pos: { x: e.x, y: e.y },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: sk ? { id: sk.id, name: sk.name, cooldown: sk.cooldown, kind: sk.kind } : undefined,
      displayName: e.name,
      boss: e.boss,
      mercMaxHp: maxHp,
      mercAtk: Math.round(b.atk * scale),
      mercSpd: b.spd,
      mercMove: b.move,
    } satisfies UnitState;
  });
}

function simulate(
  cfg: SimCfg,
  n: number,
): { winRate: number; avgRounds: number; skillCasts: Record<string, number> } {
  const stage = STAGES_MVP[cfg.stageIdx]!;
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

const SWORD = 'hero_sword_ray';
const BOW = 'hero_bow_hill';
const SHIELD = 'hero_shield_gron';
const TRIO = [SWORD, BOW, SHIELD];

/**
 * 每个配置模拟局数。
 *
 * 300 时二项分布标准差约 2.8pp，而 Boss 带药那条的余量只有 5pp 左右——断言会偶发翻红，
 * 然后所有人学会重跑一次当没事，这个测试就废了。1000 把标准差压到 1.5pp，
 * 整套测试仍在几秒内跑完，很划算。
 */
const N = 1000;

/**
 * 把胜率打出来，不只在断言失败时才看得到。
 *
 * 这些阈值是区间而不是等式，"通过"可能意味着 86% 也可能意味着 99%，而 86% 离下界只有一步。
 * 调伤害/地形/技能时需要看到的是**余量**：光知道没红不足以判断这次改动是不是把曲线推到了悬崖边。
 */
function report(label: string, r: { winRate: number; avgRounds: number }, bound: string): void {
  // 回合数一并打出来：它是单场时长预算（目标 30–60 秒）的唯一客观依据，
  // 也是评估「纯人工操作要点多少次」时唯一能拿来算的数（回合数 × 上场人数）。
  console.log(
    `  [胜率] ${label}\t${(r.winRate * 100).toFixed(1)}%\t要求 ${bound}`
    + `\t平均 ${r.avgRounds.toFixed(1)} 回合`,
  );
}

describe('第一章难度曲线回归', () => {
  it('关 1-5：首通引导关应有高胜率', () => {
    const cfgs: (SimCfg & { label: string })[] = [
      { label: '关1', stageIdx: 0, deployIds: [SWORD, BOW], level: 1, bonusAtkEach: 0, enemyScale: 1 },
      { label: '关2', stageIdx: 1, deployIds: TRIO, level: 1, bonusAtkEach: 0, enemyScale: 1 },
      { label: '关3', stageIdx: 2, deployIds: TRIO, level: 1, bonusAtkEach: 1, enemyScale: 1 },
      { label: '关4', stageIdx: 3, deployIds: TRIO, level: 1, bonusAtkEach: 1, enemyScale: 1 },
      { label: '关5', stageIdx: 4, deployIds: TRIO, level: 1, bonusAtkEach: 2, enemyScale: 1 },
    ];
    for (const c of cfgs) {
      const r = simulate(c, N);
      report(c.label, r, '>=85%');
      expect(r.winRate, `${c.label} 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.85);
    }
  }, 60_000);

  it('关 6 精英战：有压力但可过', () => {
    const r = simulate(
      { stageIdx: 5, deployIds: TRIO, level: 1, bonusAtkEach: 2, enemyScale: 1 },
      N,
    );
    report('关6 精英', r, '50%~95%');
    expect(r.winRate, `关6 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.5);
    expect(r.winRate, `关6 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.95);
  }, 60_000);

  it('关 7 Boss：裸打惩罚、备药后可过，且 Boss 会放狂暴战吼', () => {
    const naked = simulate(
      { stageIdx: 6, deployIds: TRIO, level: 1, bonusAtkEach: 3, enemyScale: 1.1 },
      N,
    );
    report('关7 Boss 裸打', naked, '<=50%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.5);
    expect(naked.skillCasts['savage_roar'] ?? 0, 'Boss 应释放狂暴战吼').toBeGreaterThan(0);

    const prepared = simulate(
      { stageIdx: 6, deployIds: TRIO, level: 1, bonusAtkEach: 3, enemyScale: 1.1, healPotions: 2 },
      N,
    );
    report('关7 Boss 带 2 药', prepared, '>=55%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.55);
  }, 60_000);
});
