import { describe, it, expect } from 'vitest';
import { createTerrainRuntime } from '../terrainDynamics';
import { emptyTerrain, getTerrainAt, type TerrainGrid } from '../grid';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { BattleEvent, TerrainId, UnitState } from '../types';

function withCell(base: TerrainGrid, x: number, y: number, t: TerrainId): TerrainGrid {
  const g = base.map((row) => [...row]);
  g[y]![x] = t;
  return g;
}

function terrainEvents(evs: BattleEvent[]): Extract<BattleEvent, { type: 'terrain' }>[] {
  return evs.filter((e): e is Extract<BattleEvent, { type: 'terrain' }> => e.type === 'terrain');
}

describe('地形运行时：点燃', () => {
  it('点燃森林变成燃烧，并发出地形事件', () => {
    const rt = createTerrainRuntime(withCell(emptyTerrain(4, 4), 1, 1, 'forest'));
    const evs = terrainEvents(rt.ignite([{ x: 1, y: 1 }]));

    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('burning');
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ x: 1, y: 1, from: 'forest', to: 'burning', reason: 'ignite' });
  });

  it('不可燃的地形不受影响', () => {
    const base = withCell(withCell(emptyTerrain(4, 4), 1, 1, 'high'), 2, 2, 'wall');
    const rt = createTerrainRuntime(base);
    const evs = rt.ignite([
      { x: 0, y: 0 }, // plain
      { x: 1, y: 1 }, // high
      { x: 2, y: 2 }, // wall
    ]);

    expect(evs).toHaveLength(0);
    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('high');
    expect(getTerrainAt(rt.grid, { x: 2, y: 2 })).toBe('wall');
  });

  it('一次点燃里重复的格子只烧一次', () => {
    const rt = createTerrainRuntime(withCell(emptyTerrain(4, 4), 1, 1, 'forest'));
    const evs = rt.ignite([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }]);
    expect(evs).toHaveLength(1);
  });

  it('越界的格子被忽略，不抛错', () => {
    const rt = createTerrainRuntime(emptyTerrain(3, 3));
    expect(() => rt.ignite([{ x: 9, y: 9 }, { x: -1, y: 0 }])).not.toThrow();
  });
});

describe('地形运行时：燃尽', () => {
  it('燃烧撑过两个轮首后变成焦土', () => {
    const rt = createTerrainRuntime(withCell(emptyTerrain(4, 4), 1, 1, 'forest'));
    rt.ignite([{ x: 1, y: 1 }]);

    // 第一个轮首：还在烧（这一轮仍要对站在上面的人造成伤害）
    expect(terrainEvents(rt.tick())).toHaveLength(0);
    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('burning');

    // 第二个轮首：烧尽
    const evs = terrainEvents(rt.tick());
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ from: 'burning', to: 'scorched', reason: 'burnout' });
    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('scorched');
  });

  it('焦土是终态，之后不再变化也不可再点燃', () => {
    const rt = createTerrainRuntime(withCell(emptyTerrain(4, 4), 1, 1, 'forest'));
    rt.ignite([{ x: 1, y: 1 }]);
    rt.tick();
    rt.tick();

    expect(rt.tick()).toHaveLength(0);
    expect(rt.ignite([{ x: 1, y: 1 }])).toHaveLength(0);
    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('scorched');
  });

  /**
   * 补刀续烧会让「站在火里」变成一个不需要走位的必杀技：
   * 每回合往同一格补一发，敌人就永远出不来。
   */
  it('往正在燃烧的格子再补一发火，不会续上燃烧时间', () => {
    const rt = createTerrainRuntime(withCell(emptyTerrain(4, 4), 1, 1, 'forest'));
    rt.ignite([{ x: 1, y: 1 }]);
    rt.tick();
    rt.ignite([{ x: 1, y: 1 }]); // 补一发

    // 仍按最初的 2 回合到期
    expect(terrainEvents(rt.tick())).toHaveLength(1);
    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('scorched');
  });
});

describe('地形运行时：与传入底图隔离', () => {
  it('运行时改地形不会写回传入的底图', () => {
    const base = withCell(emptyTerrain(4, 4), 1, 1, 'forest');
    const rt = createTerrainRuntime(base);
    rt.ignite([{ x: 1, y: 1 }]);

    expect(getTerrainAt(rt.grid, { x: 1, y: 1 })).toBe('burning');
    expect(getTerrainAt(base, { x: 1, y: 1 })).toBe('forest');
  });
});

describe('createBattleSim 的地形隔离', () => {
  function twoUnits(): UnitState[] {
    return [
      {
        uid: 'p1', defId: 'sword', faction: 'player', hp: 100,
        pos: { x: 0, y: 3 }, skillCd: 0, movedInTurn: false,
      },
      {
        uid: 'e1', defId: 'sword', faction: 'enemy', hp: 100,
        pos: { x: 3, y: 0 }, skillCd: 0, movedInTurn: false,
      },
    ];
  }

  /**
   * 关卡的 `terrain` 是模块级共享对象。地形一旦可写，不拷贝就会把上一局烧掉的森林
   * 留在关卡数据里——第二次打同一关开局就是焦土，而 1000 局的数值模拟会一路累积。
   * 这个 bug 不报错、只让数值悄悄失真，所以钉一条测试在引擎入口上。
   */
  it('引擎持有的是地形副本，不是传入那份的引用', () => {
    const base = withCell(emptyTerrain(5, 5), 2, 2, 'forest');
    const sim = createBattleSim(twoUnits(), base, UNIT_DEFS, { mode: 'auto' });

    expect(sim.getTerrain()).not.toBe(base);
    expect(sim.getTerrain()[2]).not.toBe(base[2]);
    expect(sim.getTerrain()[2]![2]).toBe('forest');
  });

  it('两场战斗各自拿到干净的底图', () => {
    const base = withCell(emptyTerrain(5, 5), 2, 2, 'forest');
    const a = createBattleSim(twoUnits(), base, UNIT_DEFS, { mode: 'auto' });
    a.getTerrain()[2]![2] = 'scorched';

    const b = createBattleSim(twoUnits(), base, UNIT_DEFS, { mode: 'auto' });
    expect(b.getTerrain()[2]![2]).toBe('forest');
  });
});
