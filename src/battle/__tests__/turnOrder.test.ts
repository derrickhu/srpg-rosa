import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import { effectiveUnitDef } from '../effectiveUnit';
import type { UnitState } from '../types';

function unit(partial: Partial<UnitState> & Pick<UnitState, 'uid' | 'defId' | 'faction' | 'pos'>): UnitState {
  const d = UNIT_DEFS[partial.defId];
  return {
    hp: d.base.maxHp,
    skillCd: 0,
    movedInTurn: false,
    ...partial,
  };
}

function toPending(sim: ReturnType<typeof createBattleSim>): void {
  for (let i = 0; i < 20 && !sim.isDone() && !sim.pending(); i++) sim.stepTurn();
}

describe('速度变化立刻改出手顺序', () => {
  it('震击降速后，还没出手的敌人在本回合队列里后移', () => {
    const p1 = unit({
      uid: 'p1',
      defId: 'shield',
      faction: 'player',
      pos: { x: 1, y: 2 },
      mercSpd: 10,
      battleSkill: skillDefForId('bash') ?? undefined,
    });
    const eFast = unit({
      uid: 'e_fast',
      defId: 'sword',
      faction: 'enemy',
      pos: { x: 1, y: 1 },
      mercSpd: 6,
    });
    const eSlow = unit({
      uid: 'e_slow',
      defId: 'sword',
      faction: 'enemy',
      pos: { x: 0, y: 0 },
      mercSpd: 5,
    });
    const sim = createBattleSim([p1, eFast, eSlow], emptyTerrain(4, 4), UNIT_DEFS, { mode: 'manual' });
    toPending(sim);
    expect(sim.pending()?.uid).toBe('p1');
    expect(sim.roundOrder()).toEqual(['e_fast', 'e_slow']);

    const step = sim.commandSkill('p1', 'e_fast');
    expect(step.events.some((e) => e.type === 'statusNote' && e.text === '速-2')).toBe(true);
    expect(effectiveUnitDef(sim.getUnit('e_fast')!, UNIT_DEFS).spd).toBe(4);
    expect(sim.roundOrder()).toEqual(['e_slow', 'e_fast']);
    expect(sim.upcomingOrder(3, 'p1').slice(0, 3)).toEqual(['p1', 'e_slow', 'e_fast']);
  });

  it('减速药剂让还没出手的敌人落到更快的友军后面', () => {
    const p1 = unit({
      uid: 'p1',
      defId: 'sword',
      faction: 'player',
      pos: { x: 0, y: 2 },
      mercSpd: 10,
    });
    const p2 = unit({
      uid: 'p2',
      defId: 'bow',
      faction: 'player',
      pos: { x: 2, y: 2 },
      mercSpd: 7,
    });
    const eFast = unit({
      uid: 'e_fast',
      defId: 'cavalry',
      faction: 'enemy',
      pos: { x: 1, y: 0 },
      mercSpd: 8,
    });
    const sim = createBattleSim([p1, p2, eFast], emptyTerrain(4, 4), UNIT_DEFS, { mode: 'manual' });
    toPending(sim);
    expect(sim.pending()?.uid).toBe('p1');
    expect(sim.roundOrder()).toEqual(['e_fast', 'p2']);

    sim.usePotion('slow');
    expect(effectiveUnitDef(sim.getUnit('e_fast')!, UNIT_DEFS).spd).toBe(6);
    expect(sim.roundOrder()).toEqual(['p2', 'e_fast']);
  });
});
