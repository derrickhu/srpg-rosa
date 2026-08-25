import { describe, expect, it } from 'vitest';
import {
  measureStackedBottom,
  nativeTouchApi,
  readNativeTouchPoint,
  rectContains,
  scrollOverflow,
} from '@/ui/ScrollList';

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

describe('原生触摸坐标', () => {
  it('没有 wx 时不绑原生监听', () => {
    expect(nativeTouchApi()).toBeNull();
  });

  it('优先读 clientX/Y，缺了再读 x/y', () => {
    expect(readNativeTouchPoint({ touches: [{ clientX: 10, clientY: 40 }] })).toEqual({
      x: 10,
      y: 40,
    });
    expect(readNativeTouchPoint({ changedTouches: [{ x: 8, y: 22 }] })).toEqual({
      x: 8,
      y: 22,
    });
    expect(readNativeTouchPoint({ touches: [] })).toBeNull();
  });

  it('Y 比窗口高一截时按 dpr 折回逻辑像素', () => {
    expect(
      readNativeTouchPoint(
        { touches: [{ clientX: 750, clientY: 1600 }] },
        { windowHeight: 800, pixelRatio: 2 },
      ),
    ).toEqual({ x: 375, y: 800 });
  });

  it('点在矩形内才算命中列表', () => {
    const r = { x: 0, y: 80, width: 375, height: 500 };
    expect(rectContains(r, 10, 90)).toBe(true);
    expect(rectContains(r, 10, 20)).toBe(false);
  });
});
