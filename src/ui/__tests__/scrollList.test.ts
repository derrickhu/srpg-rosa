import { describe, expect, it } from 'vitest';
import { measureStackedBottom, scrollOverflow } from '@/ui/ScrollList';

describe('列表滚动距离', () => {
  it('内容比窗口矮时不能滚，避免把列表拽出视口', () => {
    expect(scrollOverflow(400, 200)).toBe(0);
    expect(scrollOverflow(400, 400)).toBe(0);
  });

  it('内容超出时溢出是负的窗口差', () => {
    expect(scrollOverflow(400, 640)).toBe(-240);
  });

  it('按子节点 y+高取底边，不读父节点带 mask 的包围盒', () => {
    expect(
      measureStackedBottom([
        { y: 0, height: 20 },
        { y: 30, height: 132 },
        { y: 172, height: 132 },
      ]),
    ).toBe(304);
  });

  it('有 hitArea 时用它，避免卡面 mask 把 height 算成 0', () => {
    expect(
      measureStackedBottom([
        { y: 10, height: 0, hitArea: { x: 0, y: 0, width: 100, height: 132 } },
      ]),
    ).toBe(142);
  });
});
