import { describe, expect, it } from 'vitest';
import { forceWritableCanvasStyle, isAndroidLikeSystem } from '@/boot/createPixiApp';

describe('isAndroidLikeSystem', () => {
  it('认华为 / 鸿蒙 / 安卓', () => {
    expect(isAndroidLikeSystem({ platform: 'android', brand: 'HUAWEI' })).toBe(true);
    expect(isAndroidLikeSystem({ platform: 'ohos', brand: 'HUAWEI' })).toBe(true);
    expect(isAndroidLikeSystem({ platform: 'harmonyos', brand: 'HONOR' })).toBe(true);
    expect(isAndroidLikeSystem({ platform: 'devtools', brand: 'huawei' })).toBe(true);
  });

  it('iOS 和开发者工具不当成安卓', () => {
    expect(isAndroidLikeSystem({ platform: 'ios', brand: 'iPhone' })).toBe(false);
    expect(isAndroidLikeSystem({ platform: 'devtools', brand: 'devtools' })).toBe(false);
  });

  it('只读 style 换成可写袋，EventSystem 写 touchAction 不再抛', () => {
    const native: { touchAction?: string } = {};
    Object.defineProperty(native, 'touchAction', {
      get: () => 'auto',
      set: () => {
        throw new TypeError('Attempted to assign to readonly property.');
      },
    });
    const el: { style?: { touchAction?: string } } = {};
    Object.defineProperty(el, 'style', {
      configurable: true,
      get: () => native,
    });
    expect(() => { el.style!.touchAction = 'none'; }).toThrow(/readonly/);
    expect(forceWritableCanvasStyle(el)).toBe(true);
    expect(() => { el.style!.touchAction = 'none'; }).not.toThrow();
  });

  it('小米 / OPPO 也按安卓封顶，不只有华为', () => {
    expect(isAndroidLikeSystem({ platform: 'android', brand: 'xiaomi' })).toBe(true);
    expect(isAndroidLikeSystem({ platform: 'android', brand: 'OPPO' })).toBe(true);
  });
});
