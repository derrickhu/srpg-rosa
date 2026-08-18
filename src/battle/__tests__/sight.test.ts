import { describe, it, expect } from 'vitest';
import { hasLineOfSight, rayCellsUntilBlocked } from '../sight';
import { emptyTerrain, type TerrainGrid } from '../grid';
import type { Vec2 } from '../types';

function grid(rows: string[]): TerrainGrid {
  // '.' = 平原，'#' = 城墙，'v' = 深渊
  return rows.map((r) =>
    [...r].map((ch) => (ch === '#' ? 'wall' : ch === 'v' ? 'abyss' : 'plain')),
  );
}

describe('hasLineOfSight', () => {
  it('空地上任意两点互相可见', () => {
    const g = emptyTerrain(6, 6);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 5, y: 5 })).toBe(true);
    expect(hasLineOfSight(g, { x: 0, y: 3 }, { x: 4, y: 3 })).toBe(true);
  });

  it('直线上的城墙挡住视线', () => {
    const g = grid([
      '......',
      '.#....',
      '......',
    ]);
    expect(hasLineOfSight(g, { x: 0, y: 1 }, { x: 3, y: 1 })).toBe(false);
  });

  it('深渊不挡视线', () => {
    const g = grid([
      '......',
      '.v....',
      '......',
    ]);
    expect(hasLineOfSight(g, { x: 0, y: 1 }, { x: 3, y: 1 })).toBe(true);
  });

  it('两端点自己不算遮挡', () => {
    // 单位站不到城墙上，但技能瞄准格可能就是墙格；那种情况不该反过来把自己挡掉
    const g = grid([
      '......',
      '.#....',
      '......',
    ]);
    expect(hasLineOfSight(g, { x: 1, y: 1 }, { x: 3, y: 1 })).toBe(true);
    expect(hasLineOfSight(g, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true);
  });

  it('相邻两格永远互相可见', () => {
    const g = grid([
      '####',
      '.#..',
      '####',
    ]);
    expect(hasLineOfSight(g, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true);
  });

  /**
   * 这条是选 Bresenham 而不是「只判同行同列」的**唯一理由**：
   * 一道横贯战场的城墙，隔墙对射全是斜角，简单规则下没有一发被挡，城墙等于没画。
   */
  it('横贯战场的城墙也挡住斜角对射', () => {
    const g = grid([
      '......',
      '......',
      '######',
      '......',
      '......',
    ]);
    const above: Vec2[] = [{ x: 1, y: 1 }, { x: 2, y: 0 }, { x: 4, y: 1 }];
    const below: Vec2[] = [{ x: 2, y: 3 }, { x: 3, y: 4 }, { x: 1, y: 3 }];
    for (const a of above) {
      for (const b of below) {
        expect(hasLineOfSight(g, a, b), `(${a.x},${a.y}) → (${b.x},${b.y}) 不该看得见`).toBe(false);
      }
    }
  });

  /**
   * 「我打不到他，但他打得到我」在战棋里是致命的——玩家会认为命中判定是随机的。
   * Bresenham 的误差项在方向相反时可能走出不同格子，所以 `hasLineOfSight` 先给端点定序；
   * 这条测试把那个保证钉住。
   */
  it('视线是对称的：穷举一张带墙地图上的所有格子对', () => {
    const g = grid([
      '..#...',
      '.#..#.',
      '....#.',
      '.##...',
      '...#..',
      '......',
    ]);
    for (let ay = 0; ay < 6; ay++) {
      for (let ax = 0; ax < 6; ax++) {
        for (let by = 0; by < 6; by++) {
          for (let bx = 0; bx < 6; bx++) {
            const ab = hasLineOfSight(g, { x: ax, y: ay }, { x: bx, y: by });
            const ba = hasLineOfSight(g, { x: bx, y: by }, { x: ax, y: ay });
            expect(ab, `(${ax},${ay}) ↔ (${bx},${by}) 视线不对称`).toBe(ba);
          }
        }
      }
    }
  });
});

describe('rayCellsUntilBlocked', () => {
  it('走到棋盘边缘为止', () => {
    const g = emptyTerrain(5, 3);
    const cells = rayCellsUntilBlocked({ x: 1, y: 1 }, { x: 1, y: 0 }, g);
    expect(cells).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }]);
  });

  it('在城墙前停下，且不含城墙那一格', () => {
    const g = grid([
      '.....',
      '...#.',
      '.....',
    ]);
    const cells = rayCellsUntilBlocked({ x: 0, y: 1 }, { x: 1, y: 0 }, g);
    expect(cells).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  });

  it('深渊不打断射线', () => {
    const g = grid([
      '.....',
      '..v..',
      '.....',
    ]);
    const cells = rayCellsUntilBlocked({ x: 0, y: 1 }, { x: 1, y: 0 }, g);
    expect(cells).toHaveLength(4);
  });

  it('起点就贴着墙时返回空', () => {
    const g = grid([
      '.....',
      '.#...',
      '.....',
    ]);
    expect(rayCellsUntilBlocked({ x: 0, y: 1 }, { x: 1, y: 0 }, g)).toEqual([]);
  });
});
