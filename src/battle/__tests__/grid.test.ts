import { describe, it, expect } from 'vitest';
import { gridSize, inBounds, manhattan, getTerrainAt, neighbors4, emptyTerrain, mergeTerrainOverlay } from '../grid';

describe('gridSize', () => {
  it('returns correct dimensions', () => {
    const g = emptyTerrain(5, 3);
    expect(gridSize(g)).toEqual({ w: 5, h: 3 });
  });

  it('handles empty grid', () => {
    expect(gridSize([])).toEqual({ w: 0, h: 0 });
  });
});

describe('inBounds', () => {
  it('returns true for valid coordinates', () => {
    const g = emptyTerrain(5, 5);
    expect(inBounds({ x: 0, y: 0 }, g)).toBe(true);
    expect(inBounds({ x: 4, y: 4 }, g)).toBe(true);
  });

  it('returns false for out-of-bounds', () => {
    const g = emptyTerrain(5, 5);
    expect(inBounds({ x: -1, y: 0 }, g)).toBe(false);
    expect(inBounds({ x: 5, y: 0 }, g)).toBe(false);
    expect(inBounds({ x: 0, y: 5 }, g)).toBe(false);
  });
});

describe('manhattan', () => {
  it('computes correct distance', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    expect(manhattan({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });
});

describe('getTerrainAt', () => {
  it('returns terrain at valid position', () => {
    const g = [['plain' as const, 'high' as const]];
    expect(getTerrainAt(g, { x: 1, y: 0 })).toBe('high');
  });

  it('falls back to plain for out-of-bounds', () => {
    const g = emptyTerrain(2, 2);
    expect(getTerrainAt(g, { x: 5, y: 5 })).toBe('plain');
  });
});

describe('neighbors4', () => {
  it('returns 4 neighbors for center cell', () => {
    const g = emptyTerrain(5, 5);
    const n = neighbors4({ x: 2, y: 2 }, g);
    expect(n.length).toBe(4);
  });

  it('returns 2 neighbors for corner cell', () => {
    const g = emptyTerrain(3, 3);
    const n = neighbors4({ x: 0, y: 0 }, g);
    expect(n.length).toBe(2);
  });
});

describe('mergeTerrainOverlay', () => {
  it('applies overlay on top of base', () => {
    const base = emptyTerrain(3, 3);
    const overlay = [{ x: 1, y: 1, terrain: 'high' as const }];
    const merged = mergeTerrainOverlay(base, overlay);
    expect(merged[1]![1]).toBe('high');
    expect(merged[0]![0]).toBe('plain');
  });

  it('does not mutate original', () => {
    const base = emptyTerrain(3, 3);
    mergeTerrainOverlay(base, [{ x: 0, y: 0, terrain: 'high' as const }]);
    expect(base[0]![0]).toBe('plain');
  });
});
