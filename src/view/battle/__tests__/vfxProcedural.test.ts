import { describe, expect, it } from 'vitest';
import { buildJaggedPath } from '@/view/battle/vfxProcedural';

describe('程序特效几何', () => {
  it('折线闪电两端贴路径，中间点数固定，相同种子可复现', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const a = buildJaggedPath(from, to, 6, 12, 7);
    const b = buildJaggedPath(from, to, 6, 12, 7);
    expect(a).toHaveLength(7);
    expect(a[0]).toEqual(from);
    expect(a[a.length - 1]).toEqual(to);
    expect(b).toEqual(a);
    const mid = a[3]!;
    expect(Math.abs(mid.y)).toBeGreaterThan(0);
  });
});
