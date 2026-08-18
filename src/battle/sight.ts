import type { TerrainId, Vec2 } from './types';
import { getTerrainAt, inBounds, type TerrainGrid } from './grid';
import { getTerrainSpec } from '@/data/terrainSpec';

/** 这一格会不会挡住穿过它的远程攻击 */
export function blocksSightAt(grid: TerrainGrid, p: Vec2): boolean {
  return getTerrainSpec(getTerrainAt(grid, p)).blocksSight === true;
}

/**
 * 从 `a` 到 `b` 的连线上有没有挡视线的格子（两端自己不算）。
 *
 * ## 为什么用 Bresenham 直线，而不是「只判同行同列」
 *
 * 「只有正对着时才被挡」这条规则更简单也更好解释，但它在最重要的那个画面下是错的：
 * 一道横贯战场的城墙，两军隔墙对射时全都是斜角，于是没有一发被挡住——
 * 城墙看起来完全没起作用。而「一道墙把战场隔开」恰恰是要塞章节的核心读法，
 * 所以必须按真实连线判。
 *
 * ## 为什么要规范化端点顺序
 *
 * Bresenham 在斜率相同、方向相反时可能走出不同的格子序列（误差项的取整方向不同）。
 * 那会导致「我打不到他，但他打得到我」——这种不对称在战棋里是致命的，
 * 玩家会认为伤害判定是随机的。先按坐标定序，两个方向就必然算出同一条线。
 *
 * 注意 Bresenham 会「抄」斜角：两块城墙对角相邻时，连线可能从它们中间的缝隙穿过。
 * 在 7×9 的棋盘、射程 2–4 的量级下这种构型很少见，而彻底避免它需要 supercover
 * （把连线擦到的所有格子都算上），代价是城墙会挡得比玩家看图预期的更多——
 * 挡多了比漏挡更难解释，所以选了现在这条。
 */
export function hasLineOfSight(grid: TerrainGrid, a: Vec2, b: Vec2): boolean {
  const [p, q] = a.y < b.y || (a.y === b.y && a.x <= b.x) ? [a, b] : [b, a];
  for (const c of lineCells(p, q)) {
    if ((c.x === a.x && c.y === a.y) || (c.x === b.x && c.y === b.y)) continue;
    if (!inBounds(c, grid)) continue;
    if (blocksSightAt(grid, c)) return false;
  }
  return true;
}

/** 整数 Bresenham：返回含两端点的格子序列 */
function lineCells(a: Vec2, b: Vec2): Vec2[] {
  const out: Vec2[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - x);
  const dy = Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/**
 * 沿 `dir` 直线推进，在**撞上挡视线的格子前**停下，返回经过的格子。
 *
 * 射线技能的命中判定和高亮范围都用它，两边共用一个终点是关键：
 * 分开算的话会出现「高亮画到墙后面，但打不到那里的人」，
 * 而玩家只会得出「这个技能的范围提示是骗人的」这个结论。
 */
export function rayCellsUntilBlocked(from: Vec2, dir: Vec2, grid: TerrainGrid): Vec2[] {
  const cells: Vec2[] = [];
  let p = { x: from.x + dir.x, y: from.y + dir.y };
  while (inBounds(p, grid)) {
    if (blocksSightAt(grid, p)) break;
    cells.push({ ...p });
    p = { x: p.x + dir.x, y: p.y + dir.y };
  }
  return cells;
}

/** 供关卡校验/文案使用：这种地形挡不挡视线 */
export function terrainBlocksSight(id: TerrainId): boolean {
  return getTerrainSpec(id).blocksSight === true;
}
