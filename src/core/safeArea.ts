/**
 * 屏幕安全区：状态栏、右上角胶囊按钮、底部 home indicator。
 *
 * 这三块是**系统占用**的像素，画上去的东西会被盖住或点不到，而它们的尺寸随机型变化，
 * 不能写死。之前全项目没做避让，顶栏标题被胶囊压掉了尾字（背包页那行横幅
 * 「…结束即清空」只剩前半句），底部 tab 的图标压在 home indicator 上。
 *
 * 返回的都是**逻辑像素**，和 `getWxCanvasLogicalSize()`、Pixi 的 stage 坐标同一套，
 * 可以直接当 y 用，不需要再乘 dpr。
 */
import { getWxCanvasLogicalSize } from '@/boot/createPixiApp';

declare const wx: any;

export interface SafeAreaInsets {
  /** 顶部第一个可用 y：状态栏和胶囊都在这条线之上 */
  top: number;
  /** 底部被 home indicator 占掉的高度，贴底的元素要垫起这么多 */
  bottom: number;
  /**
   * 右上角胶囊占用的矩形。
   *
   * 单给一个 `top` 不够用：胶囊只占右边一小段，它下面那条通栏是可用的。
   * 顶栏想在同一行放标题和货币时，需要知道**右边到哪儿为止**，
   * 而不是把整行让出来——那会白丢一行高度。
   */
  menuRect: { x: number; y: number; width: number; height: number };
}

/**
 * 非微信环境（浏览器调试）和 API 失效时的兜底。
 *
 * 数值取微信官方胶囊的常见实测值：宽 87、高 32、距右边缘 7。
 * 兜底宁可偏大：多留几个像素只是空一点，留少了就是文字被吃掉。
 */
const FALLBACK = {
  statusBar: 20,
  menuWidth: 87,
  menuHeight: 32,
  menuMarginRight: 7,
  /** 胶囊与状态栏之间的间隙 */
  menuGapTop: 4,
  bottom: 0,
};

let cached: SafeAreaInsets | null = null;

/** 拿到的矩形是不是可用（启动早期 API 可能返回全 0） */
function isUsableRect(r: unknown): r is { top: number; left: number; width: number; height: number } {
  const rect = r as { top?: number; left?: number; width?: number; height?: number } | null;
  return !!rect && (rect.width ?? 0) > 0 && (rect.height ?? 0) > 0;
}

function compute(): SafeAreaInsets {
  const { w: screenW, h: screenH } = getWxCanvasLogicalSize();

  if (typeof wx === 'undefined') {
    const y = FALLBACK.statusBar + FALLBACK.menuGapTop;
    return {
      top: y + FALLBACK.menuHeight,
      bottom: FALLBACK.bottom,
      menuRect: {
        x: screenW - FALLBACK.menuMarginRight - FALLBACK.menuWidth,
        y,
        width: FALLBACK.menuWidth,
        height: FALLBACK.menuHeight,
      },
    };
  }

  let statusBar = FALLBACK.statusBar;
  let bottom = FALLBACK.bottom;
  try {
    const si = wx.getSystemInfoSync();
    statusBar = typeof si.statusBarHeight === 'number' ? si.statusBarHeight : statusBar;
    // safeArea.bottom 是安全区**下边界的 y**，不是高度；离屏幕底还差多少才是要垫的量
    if (si.safeArea && typeof si.safeArea.bottom === 'number') {
      bottom = Math.max(0, Math.round(screenH - si.safeArea.bottom));
    }
  } catch (e) {
    console.warn('[safeArea] getSystemInfoSync 失败，用兜底值:', e);
  }

  let rect: { x: number; y: number; width: number; height: number };
  let raw: unknown = null;
  try {
    raw = wx.getMenuButtonBoundingClientRect?.();
  } catch (e) {
    console.warn('[safeArea] getMenuButtonBoundingClientRect 失败，用兜底值:', e);
  }
  if (isUsableRect(raw)) {
    rect = { x: raw.left, y: raw.top, width: raw.width, height: raw.height };
  } else {
    rect = {
      x: screenW - FALLBACK.menuMarginRight - FALLBACK.menuWidth,
      y: statusBar + FALLBACK.menuGapTop,
      width: FALLBACK.menuWidth,
      height: FALLBACK.menuHeight,
    };
  }

  return {
    // 顶部可用线取「胶囊下沿」和「状态栏下沿」的较大值：竖屏上一定是胶囊更低，
    // 但真机上偶有胶囊贴顶的情况，取 max 才不会算出一条压在状态栏里的线。
    top: Math.max(rect.y + rect.height, statusBar),
    bottom,
    menuRect: rect,
  };
}

/**
 * 取安全区（结果缓存）。
 *
 * 只缓存**算得出胶囊真实位置**的结果：启动早期 `getMenuButtonBoundingClientRect`
 * 可能返回全 0，那时如果把兜底值缓存下来，之后整局都用不上真实值了。
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  if (cached) return cached;
  const v = compute();
  if (typeof wx === 'undefined') {
    // 浏览器调试环境不会再变，缓存掉省得每帧重算
    cached = v;
  } else if (isUsableRect(wx.getMenuButtonBoundingClientRect?.())) {
    cached = v;
  }
  return v;
}

/** 仅供测试：清掉缓存 */
export function resetSafeAreaCache(): void {
  cached = null;
}
