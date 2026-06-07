import type { TerrainGrid } from './grid';
import { getTerrainAt, neighbors4 } from './grid';
import type { Vec2 } from './types';
import { getTerrainSpec } from '@/data/terrainSpec';

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

/**
 * BFS with per-cell movement cost from TerrainSpec.
 * Impassable terrain (moveCost === Infinity) is never entered.
 */
export function reachableCells(
  start: Vec2,
  moveBudget: number,
  blocked: Set<string>,
  terrain: TerrainGrid,
): Map<string, number> {
  const dist = new Map<string, number>();
  const q: Vec2[] = [start];
  dist.set(key(start), 0);
  let qi = 0;
  while (qi < q.length) {
    const p = q[qi++]!;
    const d = dist.get(key(p))!;
    for (const n of neighbors4(p, terrain)) {
      const nk = key(n);
      if (nk === key(start)) continue;
      if (blocked.has(nk)) continue;
      const tSpec = getTerrainSpec(getTerrainAt(terrain, n));
      if (tSpec.moveCost >= Infinity) continue;
      const nd = d + tSpec.moveCost;
      if (nd > moveBudget) continue;
      if (!dist.has(nk) || nd < dist.get(nk)!) {
        dist.set(nk, nd);
        q.push(n);
      }
    }
  }
  return dist;
}

/** All reachable cells (from BFS dist map) as Vec2[]. */
export function cellsFromDist(_unusedStart: Vec2, dist: Map<string, number>): Vec2[] {
  const out: Vec2[] = [];
  for (const [k] of dist) {
    const [xs, ys] = k.split(',');
    out.push({ x: Number(xs), y: Number(ys) });
  }
  return out;
}

/** Shortest path (4-dir) respecting terrain movement cost. */
export function shortestPath4(
  from: Vec2,
  to: Vec2,
  blocked: Set<string>,
  terrain: TerrainGrid,
): Vec2[] | null {
  const fk = key(from);
  const tk = key(to);
  if (fk === tk) return [from];
  if (blocked.has(tk)) return null;
  const tDest = getTerrainSpec(getTerrainAt(terrain, to));
  if (tDest.moveCost >= Infinity) return null;

  const dist = new Map<string, number>();
  const parent = new Map<string, string>();
  const q: Vec2[] = [from];
  dist.set(fk, 0);
  parent.set(fk, '');
  let qi = 0;
  while (qi < q.length) {
    const p = q[qi++]!;
    const pk = key(p);
    if (pk === tk) {
      const out: Vec2[] = [];
      let cur: string | undefined = tk;
      while (cur && cur !== fk) {
        const [xa, ya] = cur.split(',');
        out.push({ x: Number(xa), y: Number(ya) });
        cur = parent.get(cur);
      }
      out.push({ ...from });
      out.reverse();
      return out;
    }
    const d = dist.get(pk)!;
    for (const n of neighbors4(p, terrain)) {
      const nk = key(n);
      if (blocked.has(nk)) continue;
      const tSpec = getTerrainSpec(getTerrainAt(terrain, n));
      if (tSpec.moveCost >= Infinity) continue;
      const nd = d + tSpec.moveCost;
      if (!dist.has(nk) || nd < dist.get(nk)!) {
        dist.set(nk, nd);
        parent.set(nk, pk);
        q.push(n);
      }
    }
  }
  return null;
}
