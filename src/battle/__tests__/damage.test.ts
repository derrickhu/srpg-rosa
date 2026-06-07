import { describe, it, expect } from 'vitest';
import { counterMultiplier, computeDamage, terrainAttackMul, terrainDefenseMul } from '../damage';
import type { UnitDef } from '../types';

function makeDef(id: string, atk: number, overrides?: Partial<UnitDef>): UnitDef {
  return {
    id: id as any,
    name: id,
    maxHp: 100,
    atk,
    spd: 5,
    move: 3,
    range: 1,
    isRanged: false,
    taunt: false,
    ...overrides,
  };
}

describe('counterMultiplier', () => {
  it('cavalry beats sword (strong)', () => {
    expect(counterMultiplier('cavalry', 'sword')).toBe(1.25);
  });
  it('sword beats bow (strong)', () => {
    expect(counterMultiplier('sword', 'bow')).toBe(1.25);
  });
  it('bow beats cavalry (strong)', () => {
    expect(counterMultiplier('bow', 'cavalry')).toBe(1.25);
  });
  it('sword vs cavalry (weak)', () => {
    expect(counterMultiplier('sword', 'cavalry')).toBe(0.85);
  });
  it('shield is always neutral', () => {
    expect(counterMultiplier('shield', 'sword')).toBe(1);
    expect(counterMultiplier('bow', 'shield')).toBe(1);
  });
  it('same type is neutral', () => {
    expect(counterMultiplier('sword', 'sword')).toBe(1);
  });
});

describe('terrainAttackMul', () => {
  it('high ground gives 1.25x', () => {
    const grid = [['high' as const]];
    expect(terrainAttackMul(grid, { x: 0, y: 0 })).toBe(1.25);
  });
  it('plain gives 1x', () => {
    const grid = [['plain' as const]];
    expect(terrainAttackMul(grid, { x: 0, y: 0 })).toBe(1);
  });
});

describe('terrainDefenseMul', () => {
  it('wall gives 0.5x damage received', () => {
    const grid = [['wall' as const]];
    expect(terrainDefenseMul(grid, { x: 0, y: 0 })).toBe(0.5);
  });
  it('plain gives 1x', () => {
    const grid = [['plain' as const]];
    expect(terrainDefenseMul(grid, { x: 0, y: 0 })).toBe(1);
  });
});

describe('computeDamage', () => {
  it('basic damage is atk * counter * terrain', () => {
    const atk = makeDef('sword', 20);
    const def = makeDef('bow', 10);
    const grid = [['plain' as const, 'plain' as const]];
    const dmg = computeDamage(atk, def, grid, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(dmg).toBe(Math.floor(20 * 1.25));
  });
  it('minimum damage is 1', () => {
    const atk = makeDef('sword', 0);
    const def = makeDef('sword', 100);
    const grid = [['plain' as const]];
    const dmg = computeDamage(atk, def, grid, { x: 0, y: 0 });
    expect(dmg).toBe(1);
  });
  it('applies defense terrain multiplier', () => {
    const atk = makeDef('sword', 20);
    const def = makeDef('sword', 10);
    const grid = [['plain' as const, 'wall' as const]];
    const dmg = computeDamage(atk, def, grid, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(dmg).toBe(Math.floor(20 * 1 * 1 * 0.5));
  });
});
