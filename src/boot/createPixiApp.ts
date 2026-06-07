/**
 * 微信小游戏 Pixi 启动。
 *
 * canvas 使用**物理像素**（逻辑尺寸 × pixelRatio），renderer 设 resolution = dpr。
 * PixiJS 内部坐标系仍然是逻辑像素（app.screen.width === windowWidth），
 * 但实际渲染使用全部物理像素，让精灵和文字在高分屏上清晰锐利。
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

function getWxInfo(): { w: number; h: number; dpr: number } {
  if (typeof wx === 'undefined') {
    return { w: 375, h: 667, dpr: 2 };
  }
  try {
    const si = wx.getSystemInfoSync();
    const w = Math.max(2, si.windowWidth || si.screenWidth || 375);
    const h = Math.max(2, si.windowHeight || si.screenHeight || 667);
    const dpr = Math.max(1, Math.min(si.pixelRatio || 2, 3));
    return { w, h, dpr };
  } catch (e) {
    console.warn('[getWxInfo]', e);
    return { w: 375, h: 667, dpr: 2 };
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

/**
 * 创建可渲染的 Pixi 宿主；若 Application 缺 ticker/renderer 则降级。
 */
export function createPixiHost(canvas: PIXI.ICanvas): PixiHost {
  const { w, h, dpr } = getWxInfo();
  applyCanvasSize(canvas, w * dpr, h * dpr);
  console.log(`[createPixiHost] logical=${w}x${h} dpr=${dpr} canvas=${w * dpr}x${h * dpr}`);

  let app: PIXI.Application | null = null;
  try {
    app = new PIXI.Application({
      view: canvas,
      width: w,
      height: h,
      backgroundColor: 0x2a3548,
      antialias: true,
      resolution: dpr,
      autoDensity: true,
    });
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
  const renderer = PIXI.autoDetectRenderer({
    view: canvas,
    width: w,
    height: h,
    backgroundColor: 0x2a3548,
    antialias: true,
    resolution: dpr,
  });
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
