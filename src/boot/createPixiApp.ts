/**
 * 微信小游戏 Pixi 启动。
 *
 * canvas 使用**物理像素**（逻辑尺寸 × pixelRatio），renderer 设 resolution = dpr。
 * PixiJS 内部坐标系仍然是逻辑像素（app.screen.width === windowWidth），
 * 但实际渲染使用全部物理像素，让精灵和文字在高分屏上清晰锐利。
 *
 * 鸿蒙对齐花花：走 WebGL1 + stencil，不要 forceCanvas。
 * 华为假 WebGL2 / Canvas2D 路径都会卡在微信开屏。
 */
import * as PIXI from 'pixi.js';
import { Rectangle } from '@pixi/math';

declare const wx: any;

export interface PixiHost {
  stage: PIXI.Container;
  screen: { width: number; height: number };
  renderer: PIXI.IRenderer;
  ticker: PIXI.Ticker;
}

/** 华为 / 鸿蒙 / 安卓：DPR 封顶，避免 3x 物理分辨率把上下文撑爆。 */
export function isAndroidLikeSystem(si: { platform?: unknown; brand?: unknown } | null | undefined): boolean {
  const p = String(si?.platform ?? '').toLowerCase();
  const b = String(si?.brand ?? '').toLowerCase();
  return p === 'android' || p === 'ohos' || p === 'harmony' || p === 'harmonyos'
    || b.includes('huawei') || b.includes('honor');
}

function readWxSystemInfo(): Record<string, unknown> {
  try {
    if (typeof wx.getWindowInfo === 'function' && typeof wx.getDeviceInfo === 'function') {
      return { ...(wx.getDeviceInfo() || {}), ...(wx.getWindowInfo() || {}) };
    }
  } catch { /* 旧基础库 */ }
  try {
    return wx.getSystemInfoSync?.() || {};
  } catch {
    return {};
  }
}

function getWxInfo(): { w: number; h: number; dpr: number; androidLike: boolean } {
  if (typeof wx === 'undefined') {
    return { w: 375, h: 667, dpr: 2, androidLike: false };
  }
  try {
    const si = readWxSystemInfo();
    const w = Math.max(2, Number(si.windowWidth || si.screenWidth) || 375);
    const h = Math.max(2, Number(si.windowHeight || si.screenHeight) || 667);
    const androidLike = isAndroidLikeSystem(si);
    const dpr = Math.max(1, Math.min(Number(si.pixelRatio) || 2, androidLike ? 2 : 3));
    return { w, h, dpr, androidLike };
  } catch (e) {
    console.warn('[getWxInfo]', e);
    return { w: 375, h: 667, dpr: 2, androidLike: false };
  }
}

/** 与微信布局一致的逻辑宽高（pt） */
export function getWxCanvasLogicalSize(): { w: number; h: number } {
  const { w, h } = getWxInfo();
  return { w, h };
}

export function applyCanvasSize(canvas: { width: number; height: number }, w: number, h: number): void {
  try {
    canvas.width = w;
    canvas.height = h;
  } catch (e) {
    console.warn('[applyCanvasSize] 赋值失败（可能只读）:', e);
  }
}

/**
 * 真机 EventSystem 坐标映射修复。
 *
 * PixiJS 7 的 mapPositionToPoint 依赖 canvas.parentElement 来获取
 * getBoundingClientRect；真机上 parentElement 不可写，为 null 时
 * rect.width = 0 → 除以零 → NaN → 所有 hit test 失败，按钮无反应。
 *
 * 这里直接覆盖 mapPositionToPoint，在 getBoundingClientRect 失败或
 * 返回零尺寸时用屏幕逻辑尺寸兜底。
 */
function patchEventSystemCoords(renderer: PIXI.IRenderer, screenW: number, screenH: number): void {
  const evtSys = (renderer as any).events;
  if (!evtSys || !evtSys.domElement) return;

  const dom = evtSys.domElement;
  evtSys.mapPositionToPoint = (point: any, x: number, y: number) => {
    let rect: any;
    try { rect = dom.getBoundingClientRect(); } catch (_) { rect = null; }
    if (!rect || !rect.width || !rect.height) {
      rect = { left: 0, top: 0, width: screenW, height: screenH };
    }
    const resMul = 1.0 / (evtSys.resolution || 1);
    point.x = ((x - (rect.left || 0)) * (dom.width / rect.width)) * resMul;
    point.y = ((y - (rect.top || 0)) * (dom.height / rect.height)) * resMul;
  };
  console.log('[createPixiHost] mapPositionToPoint 已覆盖, screenW:', screenW, 'screenH:', screenH);
}

function pixiRendererOptions(canvas: PIXI.ICanvas, w: number, h: number, dpr: number, androidLike: boolean) {
  return {
    view: canvas,
    width: w,
    height: h,
    backgroundColor: 0x2a3548,
    // 低端 Android / 鸿蒙：MSAA 和保留缓冲都会让建上下文变慢甚至失败。
    // 截屏分享不走 toDataURL，不需要 preserveDrawingBuffer。
    antialias: !androidLike,
    resolution: dpr,
    // 花花同款：微信 canvas 没有完整 CSS。autoDensity 会写 view.style，
    // 真机 style 缺失或只读时 Application 当场 throw。
    autoDensity: false,
    preserveDrawingBuffer: !androidLike,
    // 花花同款：鸿蒙假 WebGL2 会建上下文成功但画不出来；必须 WebGL1 + stencil。
    preferWebGLVersion: 1,
    stencil: true,
    hello: false,
  } as any;
}

/**
 * 创建可渲染的 Pixi 宿主；若 Application 缺 ticker/renderer 则降级。
 */
/** Application 用的可能是 pixi.js 里另一份 ShaderSystem，运行时再盖一次。 */
function silencePixiShaderSystemCheck(): void {
  const SS = (PIXI as any).ShaderSystem;
  if (SS?.prototype) {
    SS.prototype.systemCheck = function systemCheck() {};
  }
}

function isReadonlyAssignError(e: unknown): boolean {
  return /readonly|assign to/i.test(String((e as { message?: string })?.message || e));
}

/** adapter 把主屏 canvas.getContext 包了一层鸿蒙补丁；出事时换回原生的。 */
function restoreNativeGetContext(): boolean {
  try {
    const restore = typeof GameGlobal !== 'undefined'
      && (GameGlobal as any).__restoreNativeGetContext;
    return typeof restore === 'function' ? !!restore() : false;
  } catch {
    return false;
  }
}

/** iOS 微信主屏 canvas.style 只读时，换成可写袋，避免 EventSystem 写 touchAction 炸。 */
export function forceWritableCanvasStyle(el: { style?: any }): boolean {
  if (!el) return false;
  const bag: Record<string, string> = {
    touchAction: 'none',
    msTouchAction: 'none',
    msContentZooming: 'none',
    cursor: '',
  };
  try {
    const cur = el.style;
    if (cur && typeof cur === 'object') {
      try { cur.touchAction = 'none'; return true; } catch { /* native readonly */ }
    }
  } catch { /* */ }
  try {
    el.style = bag;
    el.style.touchAction = 'none';
    return true;
  } catch { /* */ }
  try {
    const defineProperty = (typeof GameGlobal !== 'undefined' && (GameGlobal as any).__origDefineProperty)
      || Object.defineProperty;
    defineProperty(el, 'style', {
      configurable: true,
      enumerable: true,
      get: () => bag,
      set: () => {},
    });
    return true;
  } catch {
    return false;
  }
}

function patchPixiReadonlyDom(): void {
  const ES = (PIXI as any).EventSystem;
  if (ES?.prototype && !ES.prototype.__srpgReadonlyPatched) {
    ES.prototype.__srpgReadonlyPatched = true;
    for (const name of ['addEvents', 'removeEvents', 'setCursor'] as const) {
      const orig = ES.prototype[name];
      if (typeof orig !== 'function') continue;
      ES.prototype[name] = function (...args: unknown[]) {
        try {
          return orig.apply(this, args);
        } catch (e) {
          if (!isReadonlyAssignError(e)) throw e;
          forceWritableCanvasStyle(this.domElement);
          try {
            return orig.apply(this, args);
          } catch (e2) {
            console.warn(`[createPixiHost] EventSystem.${name} readonly assign skipped:`, e2);
            if (name === 'addEvents') this.eventsAdded = true;
          }
        }
      };
    }
  }

  const Acc = (PIXI as any).AccessibilityManager;
  try {
    if (Acc && (PIXI as any).extensions?.remove) {
      (PIXI as any).extensions.remove(Acc);
    }
  } catch { /* 小游戏不需要无障碍 DOM */ }
}

export function createPixiHost(canvas: PIXI.ICanvas): PixiHost {
  silencePixiShaderSystemCheck();
  patchPixiReadonlyDom();
  forceWritableCanvasStyle(canvas);
  const { w, h, dpr, androidLike } = getWxInfo();
  applyCanvasSize(canvas, w * dpr, h * dpr);
  console.log(`[createPixiHost] logical=${w}x${h} dpr=${dpr} canvas=${w * dpr}x${h * dpr} webgl1+stencil androidLike=${androidLike}`);

  const options = () => pixiRendererOptions(canvas, w, h, dpr, androidLike);

  let app: PIXI.Application | null = null;
  try {
    app = new PIXI.Application(options());
  } catch (e) {
    console.error('[createPixiHost] new PIXI.Application 失败:', e);
    // adapter 给 canvas.getContext 套了鸿蒙补丁。真机若有只读属性写不得，
    // 还原成原生 getContext 再试一次，别让一个兼容补丁把整个启动拖死。
    if (isReadonlyAssignError(e) && restoreNativeGetContext()) {
      try {
        app = new PIXI.Application(options());
      } catch (e2) {
        console.error('[createPixiHost] 还原原生 getContext 后仍失败:', e2);
      }
    }
  }

  if (app && app.stage && app.ticker && app.renderer) {
    console.log('[createPixiHost] 使用标准 PIXI.Application', w, 'x', h, '@', dpr, 'x');
    patchEventSystemCoords(app.renderer, w, h);
    return app as PixiHost;
  }

  if (app) {
    try {
      app.destroy(false);
    } catch (_) { /* */ }
  }

  console.warn('[createPixiHost] Application 不完整或失败，降级 autoDetectRenderer + Ticker');
  restoreNativeGetContext();
  try {
    const renderer = PIXI.autoDetectRenderer(options());
    const stage = new PIXI.Container();
    const ticker = new PIXI.Ticker();
    ticker.add(() => {
      renderer.render(stage);
    });
    ticker.start();

    patchEventSystemCoords(renderer, w, h);

    return {
      stage,
      ticker,
      renderer,
      screen: new Rectangle(0, 0, w, h),
    };
  } catch (e) {
    console.error('[createPixiHost] autoDetectRenderer 也失败:', e);
    const msg = e instanceof Error ? `${e.name}:${e.message}` : String(e);
    throw new Error(`createPixiHost failed: ${msg}`);
  }
}
