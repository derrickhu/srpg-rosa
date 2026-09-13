import { describe, expect, it } from 'vitest';
import { applyBoardDepth, boardDepthZ } from '@/view/boardDepth';

describe('棋盘前后', () => {
  it('屏幕靠下的压住靠上的', () => {
    expect(boardDepthZ(100, 200)).toBeGreaterThan(boardDepthZ(100, 120));
  });

  it('同一排偏右的压住偏左的，避免对调闪', () => {
    expect(boardDepthZ(180, 200)).toBeGreaterThan(boardDepthZ(80, 200));
  });

  it('写进 zIndex', () => {
    const node = { x: 12, y: 40, zIndex: 0 };
    applyBoardDepth(node);
    expect(node.zIndex).toBe(boardDepthZ(12, 40));
  });
});
