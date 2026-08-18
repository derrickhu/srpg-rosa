import { describe, expect, it } from 'vitest';
import { createBattleSim, type BattleSim } from '../engine';
import { getTerrainAt, emptyTerrain, type TerrainGrid } from '../grid';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import type { BattleEvent, TerrainId, UnitState } from '../types';

function withCells(
  base: TerrainGrid,
  cells: { x: number; y: number; t: TerrainId }[],
): TerrainGrid {
  const g = base.map((row) => [...row]);
  for (const c of cells) g[c.y]![c.x] = c.t;
  return g;
}

function makeSim(
  terrain: TerrainGrid,
  selfPos: { x: number; y: number },
  foePos: { x: number; y: number },
  mode: 'manual' | 'auto' = 'manual',
): BattleSim {
  const p: UnitState = {
    uid: 'p1',
    defId: 'sword',
    faction: 'player',
    hp: 100,
    pos: { ...selfPos },
    // 主技能压进冷却：一回合只能放一次，旋风斩会抢掉这次施放额度
    skillCd: 99,
    tempSkillCd: 0,
    movedInTurn: false,
    battleSkill: skillDefForId('whirl'),
    tempSkill: skillDefForId('temp_fo_torch'),
    mercMaxHp: 100,
    mercAtk: 20,
    mercSpd: 9, // 先手，免得敌人先动把站位搅了
    mercMove: 3,
  };
  const e: UnitState = {
    uid: 'e1',
    defId: 'shield',
    faction: 'enemy',
    // 血厚到打不死，免得战局提前结束
    hp: 9999,
    pos: { ...foePos },
    skillCd: 0,
    movedInTurn: false,
    mercMaxHp: 9999,
    mercAtk: 1,
    mercSpd: 1,
    mercMove: 1,
  };
  return createBattleSim([p, e], terrain, UNIT_DEFS, { mode });
}

function toPending(sim: BattleSim): void {
  for (let i = 0; i < 20 && !sim.isDone() && !sim.pending(); i++) sim.stepTurn();
}

function terrainEvents(evs: BattleEvent[]): Extract<BattleEvent, { type: 'terrain' }>[] {
  return evs.filter((e): e is Extract<BattleEvent, { type: 'terrain' }> => e.type === 'terrain');
}

/**
 * 「松脂火把」是第二章的招牌，也是第一个真的会改地形的技能。它把点燃机制从
 * 「引擎能做」变成「玩家能用」，所以整条链路（技能表 → 施放 → 地形运行时 → 事件）
 * 都要钉住，而不只测 `TerrainRuntime` 那一层。
 */
describe('松脂火把', () => {
  const flat = emptyTerrain(6, 6);

  it('点燃贴身四格的森林，但不点自己脚下', () => {
    // 施法者和四周都是森林：环形只烧四周，站着那格必须留着
    const terrain = withCells(flat, [
      { x: 2, y: 2, t: 'forest' },
      { x: 2, y: 1, t: 'forest' },
      { x: 1, y: 2, t: 'forest' },
      { x: 3, y: 2, t: 'forest' },
      { x: 2, y: 3, t: 'forest' },
    ]);
    const sim = makeSim(terrain, { x: 2, y: 2 }, { x: 2, y: 1 });
    toPending(sim);

    const step = sim.commandSkill('p1', undefined, 'temp');
    expect(terrainEvents(step.events)).toHaveLength(4);

    const g = sim.getTerrain();
    expect(getTerrainAt(g, { x: 2, y: 2 }), '自己脚下不能被点着').toBe('forest');
    for (const p of [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }]) {
      expect(getTerrainAt(g, p)).toBe('burning');
    }
  });

  /**
   * 这一条是这招的主要用法：提前烧掉隘口的林子断路、拆掉敌人要躲进去的掩体。
   * 要求范围内必须有敌人的话这个用法整个不存在，只剩下「敌人贴上来了才点火」，
   * 而那时候烧不烧都快打完了。
   */
  it('范围里没有敌人也能对着空地放', () => {
    const terrain = withCells(flat, [{ x: 2, y: 1, t: 'forest' }]);
    const sim = makeSim(terrain, { x: 2, y: 2 }, { x: 5, y: 5 });
    toPending(sim);

    expect(sim.skillAiming('p1', 'temp'), '空地也要能进瞄准态').not.toBeNull();
    const step = sim.commandSkill('p1', undefined, 'temp');
    expect(step.events.some((e) => e.type === 'skillCast')).toBe(true);
    expect(getTerrainAt(sim.getTerrain(), { x: 2, y: 1 })).toBe('burning');
  });

  it('非森林地形放了也不会烧起来，但技能仍然算放出去了（进冷却）', () => {
    const terrain = withCells(flat, [{ x: 2, y: 1, t: 'high' }]);
    const sim = makeSim(terrain, { x: 2, y: 2 }, { x: 2, y: 1 });
    toPending(sim);

    const step = sim.commandSkill('p1', undefined, 'temp');
    expect(terrainEvents(step.events)).toHaveLength(0);
    expect(step.events.some((e) => e.type === 'skillCast')).toBe(true);
    expect(getTerrainAt(sim.getTerrain(), { x: 2, y: 1 })).toBe('high');
    expect(sim.getUnit('p1')!.tempSkillCd).toBe(3);
  });

  /**
   * 托管/自动那条路径故意**不**放开「对空地施放」：它的判断是「够得着就放」，
   * 没有「这一格值不值得烧」的概念，放开后自动模式会一到冷却就把脚边点着，
   * 既浪费施放额度又会把自己人架在火上。
   */
  it('自动模式不会对着空地纵火', () => {
    const terrain = withCells(flat, [
      { x: 2, y: 1, t: 'forest' },
      { x: 1, y: 2, t: 'forest' },
    ]);
    // 敌人远到这回合既打不着也走不到
    const sim = makeSim(terrain, { x: 2, y: 2 }, { x: 5, y: 5 }, 'auto');

    sim.stepTurn();
    const g = sim.getTerrain();
    expect(getTerrainAt(g, { x: 2, y: 1 })).toBe('forest');
    expect(getTerrainAt(g, { x: 1, y: 2 })).toBe('forest');
  });

  it('烧起来之后会烧尽变焦土，火不会永远烧着', () => {
    const terrain = withCells(flat, [{ x: 2, y: 1, t: 'forest' }]);
    const sim = makeSim(terrain, { x: 2, y: 2 }, { x: 2, y: 1 });
    toPending(sim);

    sim.commandSkill('p1', undefined, 'temp');
    expect(getTerrainAt(sim.getTerrain(), { x: 2, y: 1 })).toBe('burning');

    const rep = sim.runToEnd();
    const burnout = terrainEvents(rep.events).find((e) => e.reason === 'burnout');
    expect(burnout, '烧完要变焦土，否则火永远不灭').toBeDefined();
    expect(burnout).toMatchObject({ from: 'burning', to: 'scorched' });
    expect(getTerrainAt(sim.getTerrain(), { x: 2, y: 1 })).toBe('scorched');
  });

  it('走不掉的单位站在火里每轮开始掉血', () => {
    // 用城墙把敌人封在 (2,1)，第四面由玩家自己堵着——它无处可去，只能烧着
    const terrain = withCells(flat, [
      { x: 2, y: 1, t: 'forest' },
      { x: 1, y: 1, t: 'wall' },
      { x: 3, y: 1, t: 'wall' },
      { x: 2, y: 0, t: 'wall' },
    ]);
    const sim = makeSim(terrain, { x: 2, y: 2 }, { x: 2, y: 1 });
    toPending(sim);
    sim.commandSkill('p1', undefined, 'temp');

    const rep = sim.runToEnd();
    const burn = rep.events.find(
      (e): e is Extract<BattleEvent, { type: 'dot' }> => e.type === 'dot' && e.source === 'terrain',
    );
    expect(burn, '燃烧格必须真的扣血，否则火只是换了个颜色').toBeDefined();
    expect(burn!.uid).toBe('e1');
  });

});

/**
 * 火把之所以能当「断路」手段，靠的是 AI 不会挑掉血格落脚（`ai.evaluateCell` 的
 * `DOT_AVOID_WEIGHT`），点着的隘口于是暂时封住。那条行为由 `ai.test.ts` 的
 * 「各难度都不挑掉血格站位」和「燃烧格是唯一能打到的落点时仍然踩进去」两条守着，
 * 不在这里重复——这里只负责「火确实点起来了」。
 */
