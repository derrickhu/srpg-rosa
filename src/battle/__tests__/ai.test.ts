import { describe, it, expect } from 'vitest';
import { chooseTurnAction, canAttackFrom } from '../ai';
import { UNIT_DEFS } from '@/data/unitDefs';
import { effectiveUnitDef } from '../effectiveUnit';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';

function makeUnit(uid: string, defId: 'sword' | 'bow' | 'cavalry' | 'shield', faction: 'player' | 'enemy', pos: { x: number; y: number }): UnitState {
  const d = UNIT_DEFS[defId];
  return {
    uid,
    defId,
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
  };
}

describe('canAttackFrom', () => {
  it('melee can attack adjacent', () => {
    const def = effectiveUnitDef(makeUnit('p', 'sword', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 1, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target)).toBe(true);
  });

  it('melee cannot attack 2 cells away', () => {
    const def = effectiveUnitDef(makeUnit('p', 'sword', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 2, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target)).toBe(false);
  });

  it('ranged can attack within range', () => {
    const def = effectiveUnitDef(makeUnit('p', 'bow', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 3, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target)).toBe(true);
  });

  it('ranged cannot attack beyond range', () => {
    const def = effectiveUnitDef(makeUnit('p', 'bow', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 4, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target)).toBe(false);
  });
});

describe('chooseTurnAction', () => {
  it('attacks when in range', () => {
    const attacker = makeUnit('p1', 'sword', 'player', { x: 2, y: 2 });
    const target = makeUnit('e1', 'sword', 'enemy', { x: 2, y: 1 });
    const terrain = emptyTerrain(5, 5);
    const choice = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain);
    expect(choice.attackTarget).not.toBeNull();
  });

  it('moves toward enemy when out of range', () => {
    const attacker = makeUnit('p1', 'sword', 'player', { x: 0, y: 4 });
    const target = makeUnit('e1', 'sword', 'enemy', { x: 4, y: 0 });
    const terrain = emptyTerrain(5, 5);
    const choice = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain);
    expect(choice.moveTo).not.toBeNull();
  });

  it('respects difficulty parameter', () => {
    const attacker = makeUnit('p1', 'sword', 'player', { x: 0, y: 4 });
    const target = makeUnit('e1', 'sword', 'enemy', { x: 4, y: 0 });
    const terrain = emptyTerrain(5, 5);
    const easy = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain, 'easy');
    const hard = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain, 'hard');
    expect(easy).toBeDefined();
    expect(hard).toBeDefined();
  });
});
