import { describe, it, expect } from 'vitest';
import { runBattle } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
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

describe('runBattle', () => {
  it('produces a winner', () => {
    const units: UnitState[] = [
      makeUnit('p1', 'sword', 'player', { x: 2, y: 5 }),
      makeUnit('e1', 'sword', 'enemy', { x: 2, y: 1 }),
    ];
    const terrain = emptyTerrain(5, 7);
    const report = runBattle(units, terrain, UNIT_DEFS);
    expect(report.winner).toBeDefined();
    expect(['player', 'enemy']).toContain(report.winner);
    expect(report.events.length).toBeGreaterThan(0);
    expect(report.events[report.events.length - 1]!.type).toBe('end');
  });

  it('player wins with advantage', () => {
    const units: UnitState[] = [
      makeUnit('p1', 'sword', 'player', { x: 0, y: 4 }),
      makeUnit('p2', 'sword', 'player', { x: 1, y: 4 }),
      makeUnit('p3', 'bow', 'player', { x: 2, y: 4 }),
      makeUnit('e1', 'sword', 'enemy', { x: 2, y: 0 }),
    ];
    const terrain = emptyTerrain(5, 5);
    const report = runBattle(units, terrain, UNIT_DEFS);
    expect(report.winner).toBe('player');
  });

  it('respects AI difficulty parameter', () => {
    const units: UnitState[] = [
      makeUnit('p1', 'shield', 'player', { x: 0, y: 2 }),
      makeUnit('e1', 'bow', 'enemy', { x: 2, y: 0 }),
    ];
    const terrain = emptyTerrain(4, 4);
    const reportEasy = runBattle(units, terrain, UNIT_DEFS, 'easy');
    expect(reportEasy.winner).toBeDefined();
    const reportHard = runBattle(units, terrain, UNIT_DEFS, 'hard');
    expect(reportHard.winner).toBeDefined();
  });

  it('handles terrain DOT damage', () => {
    const terrain = [
      ['swamp', 'swamp'],
      ['plain', 'plain'],
    ] as any;
    const units: UnitState[] = [
      makeUnit('p1', 'sword', 'player', { x: 0, y: 1 }),
      makeUnit('e1', 'sword', 'enemy', { x: 0, y: 0 }),
    ];
    const report = runBattle(units, terrain, UNIT_DEFS);
    expect(report.events.some((e) => e.type === 'round')).toBe(true);
    expect(report.winner).toBeDefined();
  });

  it('ends within MAX_BATTLE_ROUNDS', () => {
    const units: UnitState[] = [
      makeUnit('p1', 'shield', 'player', { x: 0, y: 9 }),
      makeUnit('e1', 'shield', 'enemy', { x: 4, y: 0 }),
    ];
    const terrain = emptyTerrain(5, 10);
    const report = runBattle(units, terrain, UNIT_DEFS);
    expect(report.rounds).toBeLessThanOrEqual(200);
    expect(report.winner).toBeDefined();
  });
});
