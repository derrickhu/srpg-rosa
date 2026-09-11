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
    autoDensity: true,
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
export function createPixiHost(canvas: PIXI.ICanvas): PixiHost {
  const { w, h, dpr, androidLike } = getWxInfo();
  applyCanvasSize(canvas, w * dpr, h * dpr);
  console.log(`[createPixiHost] logical=${w}x${h} dpr=${dpr} canvas=${w * dpr}x${h * dpr} webgl1+stencil androidLike=${androidLike}`);

  let app: PIXI.Application | null = null;
  try {
    app = new PIXI.Application(pixiRendererOptions(canvas, w, h, dpr, androidLike));
  } catch (e) {
    console.error('[createPixiHost] new PIXI.Application 失败:', e);
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
  const renderer = PIXI.autoDetectRenderer(pixiRendererOptions(canvas, w, h, dpr, androidLike));
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
}
