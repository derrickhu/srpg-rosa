import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { getTerrainAt, emptyTerrain, type TerrainGrid } from '../grid';
import { UNIT_DEFS } from '@/data/unitDefs';
import { resolveEnemyBattleSkill } from '@/data/enemySkillCatalog';
import type { BattleEvent, TerrainId, UnitState } from '../types';

function withCells(
  base: TerrainGrid,
  cells: { x: number; y: number; t: TerrainId }[],
): TerrainGrid {
  const g = base.map((row) => [...row]);
  for (const c of cells) g[c.y]![c.x] = c.t;
  return g;
}

/** 第二章 Boss（血牙萨满）+ 一个贴着他的玩家单位，全自动跑 */
function makeSim(terrain: TerrainGrid, playerPos: { x: number; y: number }) {
  const boss: UnitState = {
    uid: 'boss',
    defId: 'sword',
    faction: 'enemy',
    hp: 300,
    pos: { x: 2, y: 2 },
    skillCd: 0,
    movedInTurn: false,
    displayName: '血牙萨满',
    boss: true,
    battleSkill: resolveEnemyBattleSkill({ skillSkin: 'bloodfang_wildfire' }),
    mercMaxHp: 300,
    mercAtk: 22,
    // 先手，免得玩家先把他打死或挪走站位
    mercSpd: 20,
    mercMove: 0,
  };
  const p: UnitState = {
    uid: 'p1',
    defId: 'shield',
    faction: 'player',
    // 血厚到打不死，免得战局提前结束
    hp: 9999,
    pos: { ...playerPos },
    skillCd: 99,
    movedInTurn: false,
    mercMaxHp: 9999,
    mercAtk: 1,
    mercSpd: 1,
    mercMove: 0,
  };
  return createBattleSim([boss, p], terrain, UNIT_DEFS, { mode: 'auto' });
}

function terrainEvents(evs: BattleEvent[]): Extract<BattleEvent, { type: 'terrain' }>[] {
  return evs.filter((e): e is Extract<BattleEvent, { type: 'terrain' }> => e.type === 'terrain');
}

/**
 * 推进到 Boss 放出咒火的那一步，返回那一步的事件。
 *
 * 第一次 `stepTurn()` 只发轮首的 `round` 事件，出手要到下一步——直接断言首步
 * 会得到「什么都没发生」，而那和「点燃坏了」长得一模一样。
 */
function stepUntilCast(sim: ReturnType<typeof makeSim>): BattleEvent[] {
  for (let i = 0; i < 8 && !sim.isDone(); i++) {
    const step = sim.stepTurn();
    if (step.events.some((e) => e.type === 'skillCast')) return step.events;
  }
  throw new Error('Boss 一直没放出咒火');
}

/**
 * 第二章 Boss 的「燎原咒火」（底层 `wild_burn`）。
 *
 * 这一招是全游戏第一个**由 AI 施放**的改地形技能，而改地形的链路此前只被玩家侧的
 * 「松脂火把」验证过（`torchIgnite.test.ts` 走的是 `commandSkill` 手动路径）。
 * AI 和手动是两条不同的施放入口（`trySkillBeforeMove` / `commitCast`），
 * 地形运行时漏传给其中一条，表现就是「Boss 放了招、火没点着」——
 * 飘字和伤害都正常，只有地形没变，几乎不可能在试玩中被认成 bug。
 */
describe('燎原咒火（第二章 Boss）', () => {
  it('AI 施放时会点燃邻格森林', () => {
    const terrain = withCells(emptyTerrain(6, 6), [
      { x: 2, y: 1, t: 'forest' },
      { x: 1, y: 2, t: 'forest' },
      { x: 2, y: 3, t: 'forest' },
    ]);
    // 玩家贴在 (3,2)：范围里有敌人，AI 才会放这一招
    const sim = makeSim(terrain, { x: 3, y: 2 });

    stepUntilCast(sim);

    const g = sim.getTerrain();
    for (const p of [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }]) {
      expect(getTerrainAt(g, p), `(${p.x},${p.y}) 应被咒火点燃`).toBe('burning');
    }
  });

  it('不点燃自己脚下——邻格环形不含施法者那一格', () => {
    const terrain = withCells(emptyTerrain(6, 6), [
      { x: 2, y: 2, t: 'forest' },
      { x: 2, y: 1, t: 'forest' },
    ]);
    const sim = makeSim(terrain, { x: 3, y: 2 });

    stepUntilCast(sim);

    const g = sim.getTerrain();
    expect(getTerrainAt(g, { x: 2, y: 2 }), 'Boss 不该把自己架在火上').toBe('forest');
    expect(getTerrainAt(g, { x: 2, y: 1 })).toBe('burning');
  });

  /**
   * 这一招的设计意图：把玩家用来贴近的掩体变成火场，逼人离开林子。
   * 所以「玩家站的那格林子会烧起来」必须成立——否则它只是一个伤害略低的战吼。
   */
  it('玩家躲在林子里时，脚下会被点着', () => {
    const terrain = withCells(emptyTerrain(6, 6), [{ x: 3, y: 2, t: 'forest' }]);
    const sim = makeSim(terrain, { x: 3, y: 2 });

    const events = stepUntilCast(sim);

    expect(terrainEvents(events).map((e) => ({ x: e.x, y: e.y, to: e.to })))
      .toContainEqual({ x: 3, y: 2, to: 'burning' });
    expect(getTerrainAt(sim.getTerrain(), { x: 3, y: 2 })).toBe('burning');
  });

  it('打的是邻格 AoE 伤害，不是纯改地形', () => {
    const sim = makeSim(emptyTerrain(6, 6), { x: 3, y: 2 });

    const events = stepUntilCast(sim);

    const cast = events.find(
      (e): e is Extract<BattleEvent, { type: 'skillCast' }> => e.type === 'skillCast',
    )!;
    expect(cast.skillId, '结算 id 是底层实现，不是皮肤 id').toBe('wild_burn');
    expect(cast.hits.length, '咒火要能打到人').toBeGreaterThan(0);
    expect(cast.hits[0]!.damage).toBeGreaterThan(0);
  });
});
