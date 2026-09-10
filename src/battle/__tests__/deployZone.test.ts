import { describe, expect, it } from 'vitest';
import {
  classifyDeploySlot,
  isPlayerDeployCell,
  playerDeployCells,
  remapDeployPos,
} from '../deployZone';
import { emptyTerrain } from '../grid';

const south = { kind: 'south' as const };
const flanks = { kind: 'flanks' as const, cols: 2 as const };

describe('布阵区', () => {
  it('缺省是南两行', () => {
    const terrain = emptyTerrain(8, 6);
    const cells = playerDeployCells({ terrain });
    expect(cells.every((c) => c.y === 4 || c.y === 5)).toBe(true);
    expect(cells).toHaveLength(16);
  });

  it('侧翼是左右各两列的南半区', () => {
    const terrain = emptyTerrain(10, 11);
    const cells = playerDeployCells({ terrain, deployZone: flanks });
    expect(cells.every((c) => c.y >= 5)).toBe(true);
    expect(cells.every((c) => c.x <= 1 || c.x >= 8)).toBe(true);
    expect(isPlayerDeployCell({ terrain, deployZone: flanks }, { x: 4, y: 5 })).toBe(false);
    expect(isPlayerDeployCell({ terrain, deployZone: flanks }, { x: 1, y: 6 })).toBe(true);
  });

  it('南两行沿用保住绝对 x', () => {
    const mapped = remapDeployPos(
      { zone: south, w: 9, h: 11 },
      { zone: south, w: 10, h: 12 },
      { x: 3, y: 9 },
    );
    expect(mapped.x).toBe(3);
    expect(mapped.y).toBe(10);
  });

  it('南两行进侧翼：左半场前排落到左内侧', () => {
    const mapped = remapDeployPos(
      { zone: south, w: 10, h: 11 },
      { zone: flanks, w: 10, h: 11 },
      { x: 2, y: 9 },
    );
    expect(mapped.x).toBe(1);
    expect(mapped.y).toBeGreaterThanOrEqual(5);
    expect(classifyDeploySlot(flanks, 10, 11, mapped)).toEqual({ side: 'left', rank: 'front' });
  });
});
