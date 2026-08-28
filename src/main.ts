/**
 * 无尽纹章 - 小游戏入口（须先于 PIXI.Application 加载 unsafe-eval patch）
 */
import '@/core/pixiUnsafeEvalPatch';
import { createPixiHost } from '@/boot/createPixiApp';
import { AssetLoader } from '@/core/AssetLoader';
import { analytics } from '@/analytics/gpAnalytics';
import { GAME_KEY, GAME_TITLE } from '@/config/gameKey';
import { GameFlow } from '@/view/GameFlow';
import '@/platform/wxPlatform';

declare const GameGlobal: any;

function formatBootErr(e: unknown): string {
  if (e == null) return String(e);
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.stack || e.message;
  if (typeof e === 'object') {
    const o = e as { errMsg?: unknown; message?: unknown; reason?: unknown };
    if (o.errMsg != null) return String(o.errMsg);
    if (o.message != null) return String(o.message);
    if (o.reason != null) return formatBootErr(o.reason);
    try {
      return JSON.stringify(e);
    } catch {
      return Object.prototype.toString.call(e);
    }
  }
  return String(e);
}

if (typeof GameGlobal !== 'undefined') {
  GameGlobal.onError = (msg: unknown) => {
    console.error('[GlobalError]', formatBootErr(msg));
    analytics.trackAppError(msg, { source: 'GameGlobal.onError' });
  };
  GameGlobal.onUnhandledRejection = (ev: unknown) => {
    console.error('[UnhandledRejection]', formatBootErr(ev));
    analytics.trackAppError(ev, { source: 'unhandledRejection' });
  };
}

function boot(): void {
  const canvas =
    (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) ||
    (typeof window !== 'undefined' && (window as unknown as { canvas?: HTMLCanvasElement }).canvas) ||
    null;

  if (!canvas) {
    console.error('[main] 无法获取 canvas，请确认 pixi-adapter 已加载');
    return;
  }

  const host = createPixiHost(canvas);
  new GameFlow(host);

  try {
    host.renderer.render(host.stage);
  } catch (e) {
    console.error('[main] 首次 render 失败:', e);
  }

  console.log(`[main] ${GAME_TITLE} (${GAME_KEY}) MVP 启动, screen:`, host.screen.width, 'x', host.screen.height);
  void AssetLoader.prefetchManifest();
}

/** 微信首帧 canvas 尺寸偶发未就绪：双 rAF 再启动（huahua 类项目常用） */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    try {
      boot();
    } catch (e) {
      console.error('[main] boot 异常:', e);
    }
  });
});
