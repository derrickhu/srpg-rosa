import { describe, it, expect } from 'vitest';
import { reachableCells, shortestPath4, cellsFromDist } from '../path';
import { emptyTerrain } from '../grid';
import type { TerrainGrid } from '../grid';

describe('reachableCells', () => {
  it('returns cells within movement budget on plain terrain', () => {
    const terrain = emptyTerrain(5, 5);
    const blocked = new Set<string>();
    const dist = reachableCells({ x: 2, y: 2 }, 2, blocked, terrain);
    const cells = cellsFromDist({ x: 2, y: 2 }, dist);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(13);
    expect(cells.some((c) => c.x === 2 && c.y === 0)).toBe(true);
    expect(cells.some((c) => c.x === 0 && c.y === 2)).toBe(true);
  });

  it('blocked cells are not reachable', () => {
    const terrain = emptyTerrain(5, 5);
    const blocked = new Set(['3,2', '1,2', '2,1', '2,3']);
    const dist = reachableCells({ x: 2, y: 2 }, 2, blocked, terrain);
    const cells = cellsFromDist({ x: 2, y: 2 }, dist);
    for (const c of cells) {
      expect(blocked.has(`${c.x},${c.y}`)).toBe(false);
    }
  });

  it('forest terrain costs 2 movement to enter', () => {
    const terrain: TerrainGrid = [
      ['plain', 'forest', 'plain'],
      ['plain', 'plain', 'plain'],
      ['plain', 'plain', 'plain'],
    ];
    const dist2 = reachableCells({ x: 0, y: 0 }, 2, new Set(), terrain);
    expect(dist2.has('1,0')).toBe(true);
    expect(dist2.get('1,0')).toBe(2);

    const dist1 = reachableCells({ x: 0, y: 0 }, 1, new Set(), terrain);
    expect(dist1.has('1,0')).toBe(false);
  });

  it('wall terrain is impassable', () => {
    const terrain: TerrainGrid = [
      ['plain', 'wall', 'plain'],
      ['plain', 'plain', 'plain'],
    ];
    const dist = reachableCells({ x: 0, y: 0 }, 3, new Set(), terrain);
    expect(dist.has('1,0')).toBe(false);
  });
});

describe('shortestPath4', () => {
  it('finds direct path on empty grid', () => {
    const terrain = emptyTerrain(5, 5);
    const path = shortestPath4({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(), terrain);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
    expect(path![0]).toEqual({ x: 0, y: 0 });
    expect(path![2]).toEqual({ x: 2, y: 0 });
  });

  it('returns null when destination is blocked', () => {
    const terrain = emptyTerrain(3, 3);
    const path = shortestPath4({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(['2,0']), terrain);
    expect(path).toBeNull();
  });

  it('routes around walls', () => {
    const terrain: TerrainGrid = [
      ['plain', 'wall', 'plain'],
      ['plain', 'plain', 'plain'],
    ];
    const path = shortestPath4({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(), terrain);
    expect(path).not.toBeNull();
    expect(path!.some((p) => p.x === 1 && p.y === 0)).toBe(false);
  });

  it('same position returns single-element path', () => {
    const terrain = emptyTerrain(3, 3);
    const path = shortestPath4({ x: 1, y: 1 }, { x: 1, y: 1 }, new Set(), terrain);
    expect(path).toEqual([{ x: 1, y: 1 }]);
  });
});
