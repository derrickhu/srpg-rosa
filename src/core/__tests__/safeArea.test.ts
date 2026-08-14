import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSafeAreaInsets, resetSafeAreaCache } from '@/core/safeArea';

/**
 * 安全区兜底。
 *
 * 单测环境没有 `wx`，走的正是**非微信分支**——这条路径不只是给浏览器调试用的，
 * 真机上 `getMenuButtonBoundingClientRect` 在启动早期也会返回全 0，
 * 那时同样要靠这里给出一个「宁可多让一点」的值。算出 0 的话顶栏会直接钻到胶囊底下。
 */
describe('安全区兜底', () => {
  afterEach(() => {
    resetSafeAreaCache();
    vi.unstubAllGlobals();
  });

  it('没有 wx 时给出非零的顶部留白', () => {
    const inset = getSafeAreaInsets();
    expect(inset.top).toBeGreaterThan(0);
    // 顶部可用线必须在胶囊下沿之下，否则标题会被压掉尾字
    expect(inset.top).toBeGreaterThanOrEqual(inset.menuRect.y + inset.menuRect.height);
  });

  it('胶囊矩形靠右且有实际尺寸', () => {
    const inset = getSafeAreaInsets();
    expect(inset.menuRect.width).toBeGreaterThan(0);
    expect(inset.menuRect.height).toBeGreaterThan(0);
    // 375 宽的兜底屏：胶囊在右半边
    expect(inset.menuRect.x).toBeGreaterThan(180);
  });

  it('bottom 不为负（会把 tab 栏拉出屏幕）', () => {
    expect(getSafeAreaInsets().bottom).toBeGreaterThanOrEqual(0);
  });

  it('拿不到真实胶囊位置时不缓存，留着下次再问', () => {
    // 真机启动早期就是这个样子：API 在，但还没准备好，返回全 0
    vi.stubGlobal('wx', {
      getSystemInfoSync: () => ({
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 3,
        statusBarHeight: 47,
        safeArea: { bottom: 810 },
      }),
      getMenuButtonBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    });
    resetSafeAreaCache();

    const first = getSafeAreaInsets();
    expect(first.menuRect.height).toBeGreaterThan(0);

    // 之后 API 好了，必须能读到真值——上一次要是把兜底缓存下来，这里就永远是旧的
    vi.stubGlobal('wx', {
      getSystemInfoSync: () => ({
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 3,
        statusBarHeight: 47,
        safeArea: { bottom: 810 },
      }),
      getMenuButtonBoundingClientRect: () => ({ top: 55, left: 296, width: 87, height: 32 }),
    });
    const second = getSafeAreaInsets();
    expect(second.menuRect.y).toBe(55);
    expect(second.top).toBe(87);
  });
});
