import type { TerrainId, Vec2 } from './types';

export type TerrainGrid = TerrainId[][];

export function gridSize(g: TerrainGrid): { w: number; h: number } {
  const h = g.length;
  const w = h > 0 ? (g[0]?.length ?? 0) : 0;
  return { w, h };
}

export function inBounds(p: Vec2, g: TerrainGrid): boolean {
  const { w, h } = gridSize(g);
  if (w <= 0 || h <= 0) return false;
  return p.x >= 0 && p.x < w && p.y >= 0 && p.y < h;
}

export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function getTerrainAt(grid: TerrainGrid, p: Vec2): TerrainId {
  if (!inBounds(p, grid)) return 'plain';
  return grid[p.y]![p.x] ?? 'plain';
}

/** 4 邻格（受当前关卡地形图尺寸约束） */
export function neighbors4(p: Vec2, g: TerrainGrid): Vec2[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter((n) => inBounds(n, g));
}

/** 生成 `width × height` 全平原地形（每关棋盘尺寸由 `terrain` 矩阵决定） */
export function emptyTerrain(width: number, height: number): TerrainGrid {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): TerrainId => 'plain'),
  );
}

/** 将玩家布阵阶段放置的地形叠到关卡底图上（浅拷贝行） */
export function mergeTerrainOverlay(base: TerrainGrid, overlay: { x: number; y: number; terrain: TerrainId }[]): TerrainGrid {
  const g = base.map((row) => [...row]);
  for (const c of overlay) {
    if (g[c.y]?.[c.x] !== undefined) g[c.y]![c.x] = c.terrain;
  }
  return g;
}
