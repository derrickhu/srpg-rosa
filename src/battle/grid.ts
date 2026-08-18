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

/**
 * 逐行深拷贝一份地形，给**会写地形的调用方**用（见 `createBattleSim`）。
 *
 * `STAGES_MVP` 里每关的 `terrain` 是模块加载时算一次的共享对象。地形在战斗中变成
 * 可写之后，不拷贝就会把「这一局烧掉的森林」留在关卡数据里：第二次打同一关开局
 * 就是焦土，而 1000 局的数值模拟会把地形改动一路累积下去。这个 bug 不会报错，
 * 只会让数值悄悄失真，所以拷贝要放在引擎入口这种绕不过去的地方。
 */
export function cloneTerrain(g: TerrainGrid): TerrainGrid {
  return g.map((row) => [...row]);
}

/** 写一格地形；越界静默忽略（与 `getTerrainAt` 的宽容读取对称） */
export function setTerrainAt(g: TerrainGrid, p: Vec2, id: TerrainId): void {
  if (!inBounds(p, g)) return;
  g[p.y]![p.x] = id;
}

/** 将玩家布阵阶段放置的地形叠到关卡底图上（浅拷贝行） */
export function mergeTerrainOverlay(base: TerrainGrid, overlay: { x: number; y: number; terrain: TerrainId }[]): TerrainGrid {
  const g = base.map((row) => [...row]);
  for (const c of overlay) {
    if (g[c.y]?.[c.x] !== undefined) g[c.y]![c.x] = c.terrain;
  }
  return g;
}
