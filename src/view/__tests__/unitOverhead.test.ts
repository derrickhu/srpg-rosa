import { describe, expect, it } from 'vitest';
import { formatHpLabel, tokenOverheadLocalY } from '@/view/unitOverhead';
import { unitHeadLocalY } from '@/view/AnimatedUnit';

describe('头顶血量', () => {
  it('只写当前血量，不写最大、不写名字', () => {
    expect(formatHpLabel(25, 40)).toBe('25');
    expect(formatHpLabel(100, 100)).toBe('100');
  });

  it('下限 0、上限不超过最大、最大至少是 1', () => {
    expect(formatHpLabel(-3, 10)).toBe('0');
    expect(formatHpLabel(99, 10)).toBe('10');
    expect(formatHpLabel(0, 0)).toBe('0');
  });

  it('布阵 token 的血条比动画单位头顶公式更贴人', () => {
    const cell = 48;
    expect(tokenOverheadLocalY(cell)).toBeGreaterThan(unitHeadLocalY('sword', cell) - 4);
    expect(tokenOverheadLocalY(cell, 1.3)).toBeLessThan(tokenOverheadLocalY(cell));
  });
});
