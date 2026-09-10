import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { emptyTerrain, type TerrainGrid } from '../grid';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { UnitState } from '../types';

function unit(
  uid: string,
  defId: 'sword' | 'bow',
  faction: 'player' | 'enemy',
  pos: { x: number; y: number },
  hp?: number,
): UnitState {
  const d = UNIT_DEFS[defId];
  return {
    uid,
    defId,
    faction,
    hp: hp ?? d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
  };
}

function withBlood(base: TerrainGrid, x: number, y: number): TerrainGrid {
  const g = base.map((row) => [...row]);
  g[y]![x] = 'blood';
  return g;
}

describe('血池回血', () => {
  it('轮首给站在血池上的残血单位回 6 点，并发 heal 事件', () => {
    const terrain = withBlood(emptyTerrain(5, 5), 1, 3);
    const wounded = UNIT_DEFS.sword.base.maxHp - 20;
    const sim = createBattleSim(
      [
        unit('p1', 'sword', 'player', { x: 1, y: 3 }, wounded),
        unit('e1', 'bow', 'enemy', { x: 4, y: 0 }),
      ],
      terrain,
      UNIT_DEFS,
      { mode: 'manual' },
    );

    const evs = sim.stepTurn().events;
    const heal = evs.find((e) => e.type === 'heal');
    expect(heal).toEqual({ type: 'heal', target: 'p1', amount: 6, hpLeft: wounded + 6 });
    expect(sim.getUnit('p1')!.hp).toBe(wounded + 6);
  });

  it('满血不发回血事件', () => {
    const terrain = withBlood(emptyTerrain(5, 5), 1, 3);
    const sim = createBattleSim(
      [
        unit('p1', 'sword', 'player', { x: 1, y: 3 }),
        unit('e1', 'bow', 'enemy', { x: 4, y: 0 }),
      ],
      terrain,
      UNIT_DEFS,
      { mode: 'manual' },
    );

    const evs = sim.stepTurn().events;
    expect(evs.some((e) => e.type === 'heal' && e.target === 'p1')).toBe(false);
    expect(sim.getUnit('p1')!.hp).toBe(UNIT_DEFS.sword.base.maxHp);
  });
});
