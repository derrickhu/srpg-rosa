import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '@/data/unitDefs';
import { createBattleSim } from '../engine';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';

function unit(uid: string, faction: 'player' | 'enemy', pos: { x: number; y: number }): UnitState {
  const d = UNIT_DEFS.sword;
  return {
    uid,
    defId: 'sword',
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    displayName: uid,
  };
}

describe('看广告复活', () => {
  it('半血站回原格，全灭后可以把战局重新打开', () => {
    const p = unit('p1', 'player', { x: 0, y: 3 });
    const e = unit('e1', 'enemy', { x: 0, y: 0 });
    const sim = createBattleSim([p, e], emptyTerrain(4, 4), UNIT_DEFS, { mode: 'manual' });
    const live = sim.getUnit('p1')!;
    live.hp = 0;
    expect(sim.reviveUnit('e1')).toEqual([]);
    const evs = sim.reviveUnit('p1');
    expect(evs).toHaveLength(1);
    expect(evs[0]!.type).toBe('spawn');
    const back = sim.getUnit('p1')!;
    expect(back.hp).toBe(Math.floor(UNIT_DEFS.sword.base.maxHp * 0.5));
    expect(back.pos).toEqual({ x: 0, y: 3 });
    expect(sim.isDone()).toBe(false);
  });

  it('判负之后复活会撤掉胜负', () => {
    const p = unit('p1', 'player', { x: 1, y: 1 });
    const e = unit('e1', 'enemy', { x: 1, y: 0 });
    const sim = createBattleSim([p, e], emptyTerrain(3, 3), UNIT_DEFS, { mode: 'auto' });
    sim.getUnit('p1')!.hp = 0;
    const step = sim.stepTurn();
    expect(step.done).toBe(true);
    expect(step.winner).toBe('enemy');
    expect(sim.reviveUnit('p1').length).toBeGreaterThan(0);
    expect(sim.isDone()).toBe(false);
    expect(sim.getUnit('p1')!.hp).toBeGreaterThan(0);
  });
});
