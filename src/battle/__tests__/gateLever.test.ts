import { describe, it, expect } from 'vitest';
import { createTerrainRuntime } from '../terrainDynamics';
import { createBattleSim, type BattleSim } from '../engine';
import { emptyTerrain, getTerrainAt, type TerrainGrid } from '../grid';
import { hasLineOfSight } from '../sight';
import { isPassable } from '@/data/terrainSpec';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { BattleEvent, TerrainId, UnitState, Vec2 } from '../types';

/**
 * 机关与闸门（第三章）。
 *
 * 这里最要紧的一条不是「机关能开门」，而是**踩机关不能配合撤销移动白嫖**
 * ——见本文件最后一个 describe。开门判定之所以放在轮首而不是踏入的那一刻，
 * 唯一目的就是让它不可能被撤销白嫖。
 */

function withCells(base: TerrainGrid, cells: { x: number; y: number; t: TerrainId }[]): TerrainGrid {
  const g = base.map((row) => [...row]);
  for (const c of cells) g[c.y]![c.x] = c.t;
  return g;
}

function gateCells(evs: BattleEvent[]): Extract<BattleEvent, { type: 'terrain' }>[] {
  return evs.filter(
    (e): e is Extract<BattleEvent, { type: 'terrain' }> => e.type === 'terrain' && e.reason === 'gate',
  );
}

describe('地形运行时：开闸门', () => {
  it('全场闸门一起变成开启态，并发出地形事件', () => {
    const rt = createTerrainRuntime(withCells(emptyTerrain(5, 5), [
      { x: 2, y: 2, t: 'gate_closed' },
      { x: 3, y: 2, t: 'gate_closed' },
    ]));

    const evs = gateCells(rt.openGates());

    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ from: 'gate_closed', to: 'gate_open', reason: 'gate' });
    expect(getTerrainAt(rt.grid, { x: 2, y: 2 })).toBe('gate_open');
    expect(getTerrainAt(rt.grid, { x: 3, y: 2 })).toBe('gate_open');
  });

  it('开启是终态：再开一次什么都不发生', () => {
    const rt = createTerrainRuntime(withCells(emptyTerrain(4, 4), [{ x: 1, y: 1, t: 'gate_closed' }]));
    rt.openGates();

    expect(rt.openGates()).toHaveLength(0);
    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('gate_open');
  });

  it('城墙不是闸门，开闸开不掉它', () => {
    const rt = createTerrainRuntime(withCells(emptyTerrain(4, 4), [{ x: 1, y: 1, t: 'wall' }]));

    expect(rt.openGates()).toHaveLength(0);
    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('wall');
  });

  /** 闸门关着要同时挡路和挡视线，否则隔着门对射就把这一章的题目消掉了 */
  it('关着的闸门挡路又挡视线，开了之后两者都放行', () => {
    expect(isPassable('gate_closed')).toBe(false);
    expect(isPassable('gate_open')).toBe(true);

    const closed = withCells(emptyTerrain(5, 5), [{ x: 2, y: 2, t: 'gate_closed' }]);
    expect(hasLineOfSight(closed, { x: 2, y: 0 }, { x: 2, y: 4 })).toBe(false);

    const rt = createTerrainRuntime(closed);
    rt.openGates();
    expect(hasLineOfSight(rt.grid, { x: 2, y: 0 }, { x: 2, y: 4 })).toBe(true);
  });
});

/**
 * 机关格在 (1,1)，闸门在 (3,1)。
 *
 * 一律用 `manual` 模式：自动模式下 AI 会把玩家单位从机关上挪走去打人，
 * 而这些用例要验的恰恰是「站着不动会怎样」。
 */
function simWithLever(playerPositions: Vec2[], enemyPos: Vec2): BattleSim {
  const terrain = withCells(emptyTerrain(6, 6), [
    { x: 1, y: 1, t: 'lever' },
    { x: 3, y: 1, t: 'gate_closed' },
  ]);
  const units: UnitState[] = playerPositions.map((pos, i) => ({
    uid: `p${i + 1}`, defId: 'sword' as const, faction: 'player' as const, hp: 100,
    pos: { ...pos }, skillCd: 0, movedInTurn: false,
  }));
  units.push({
    uid: 'e1', defId: 'sword', faction: 'enemy', hp: 100,
    pos: { ...enemyPos }, skillCd: 0, movedInTurn: false,
  });
  return createBattleSim(units, terrain, UNIT_DEFS, { mode: 'manual' });
}

function gateAt(sim: BattleSim): TerrainId {
  return getTerrainAt(sim.getTerrain(), { x: 3, y: 1 });
}

/**
 * 推进到下一个轮首为止，返回这期间的事件。
 *
 * `startRound` 不在 `BattleSim` 上（轮首由 `stepTurn` 内部驱动），所以只能这样推。
 * 玩家单位一律待机——用例要的是「人留在机关上」，替它下别的指令会把前提改掉。
 */
function advanceToNextRound(sim: BattleSim, maxSteps = 60): BattleEvent[] {
  const out: BattleEvent[] = [];
  for (let i = 0; i < maxSteps && !sim.isDone(); i += 1) {
    const p = sim.pending();
    const evs = p ? sim.commandWait(p.uid).events : sim.stepTurn().events;
    out.push(...evs);
    if (evs.some((e) => e.type === 'round')) return out;
  }
  return out;
}

describe('引擎：机关触发', () => {
  it('我方单位站在机关上，轮首开启闸门', () => {
    const sim = simWithLever([{ x: 1, y: 1 }], { x: 5, y: 5 });
    expect(gateAt(sim)).toBe('gate_closed');

    const evs = gateCells(advanceToNextRound(sim));

    expect(evs.length).toBeGreaterThan(0);
    expect(gateAt(sim)).toBe('gate_open');
  });

  /**
   * 守军没有理由开自家城门。这条不只是主题——敌人会踩机关的话，
   * AI 在门口进出就能反复改写战场，玩家读不出闸门为什么开了。
   */
  it('敌人站在机关上不触发', () => {
    const sim = simWithLever([{ x: 5, y: 5 }], { x: 1, y: 1 });

    advanceToNextRound(sim);

    expect(gateAt(sim)).toBe('gate_closed');
  });

  it('没人站机关时闸门一直关着', () => {
    const sim = simWithLever([{ x: 5, y: 5 }], { x: 4, y: 4 });

    advanceToNextRound(sim);

    expect(gateAt(sim)).toBe('gate_closed');
  });

  /**
   * 开了不会再关（`gate_open` 是终态）。会关回去的门有个恶性后果：
   * 把玩家自己的人锁在门里，那是困惑而不是难度。
   */
  it('开启后人离开机关，闸门仍然是开的', () => {
    const sim = simWithLever([{ x: 1, y: 1 }], { x: 5, y: 5 });
    advanceToNextRound(sim);
    expect(gateAt(sim)).toBe('gate_open');

    sim.getUnit('p1')!.pos = { x: 5, y: 0 };
    advanceToNextRound(sim);
    advanceToNextRound(sim);

    expect(gateAt(sim)).toBe('gate_open');
  });

  /**
   * 死人不算占领。用两个玩家单位是必须的：只留一个再把它打死，
   * 战斗会直接判负收尾，轮首根本不会到来，这条断言就测不到东西了。
   */
  it('死在机关上的单位不算占领', () => {
    const sim = simWithLever([{ x: 1, y: 1 }, { x: 5, y: 4 }], { x: 5, y: 5 });
    sim.getUnit('p1')!.hp = 0;

    advanceToNextRound(sim);

    expect(gateAt(sim)).toBe('gate_closed');
  });
});

/**
 * 这一组是把开门判定放在轮首的**理由**。
 *
 * 引擎有一条写下来的不变量：移动只改 `pos` 和 `movedInTurn`，所以撤销移动是精确回滚
 * （见 `MutablePending.startPos` 的注释）。如果踩上机关的那一刻就开门，
 * 玩家就能踩一下开门、再撤销移动——门开着，人也回来了，代价一分没付。
 */
describe('引擎：踩机关不能配合撤销白嫖', () => {
  it('走上机关的那一刻还没开门，撤销回去后闸门依然关着', () => {
    const sim = simWithLever([{ x: 1, y: 3 }], { x: 5, y: 5 });
    // 推进到玩家等指令
    for (let i = 0; i < 20 && !sim.pending(); i += 1) sim.stepTurn();
    expect(sim.pending()?.uid).toBe('p1');

    const lever = { x: 1, y: 1 };
    expect(sim.legalMoveCells('p1')).toEqual(
      expect.arrayContaining([expect.objectContaining(lever)]),
    );

    sim.commandMove('p1', lever);
    // 关键：踏入不开门
    expect(gateAt(sim)).toBe('gate_closed');
    expect(sim.pending()?.canUndoMove).toBe(true);

    sim.commandUndoMove('p1');
    expect(sim.getUnit('p1')!.pos).toEqual({ x: 1, y: 3 });
    expect(gateAt(sim)).toBe('gate_closed');
  });

  it('踩住不撤销，撑到下一个轮首才开门', () => {
    const sim = simWithLever([{ x: 1, y: 3 }], { x: 5, y: 5 });
    for (let i = 0; i < 20 && !sim.pending(); i += 1) sim.stepTurn();

    sim.commandMove('p1', { x: 1, y: 1 });
    sim.commandWait('p1');
    expect(gateAt(sim)).toBe('gate_closed');

    advanceToNextRound(sim);

    expect(gateAt(sim)).toBe('gate_open');
  });
});
