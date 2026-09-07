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
import { installWxShare } from '@/platform/wxShare';

declare const GameGlobal: any;
declare const wx: any;

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

function boot(): boolean {
  const canvas =
    (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) ||
    (typeof window !== 'undefined' && (window as unknown as { canvas?: HTMLCanvasElement }).canvas) ||
    null;

  if (!canvas) {
    console.error('[main] 无法获取 canvas，请确认 pixi-adapter 已加载');
    return false;
  }

  const host = createPixiHost(canvas);
  new GameFlow(host);

  try {
    host.renderer.render(host.stage);
  } catch (e) {
    console.error('[main] 首次 render 失败:', e);
  }

  // 分享 API 放在首帧之后：部分安卓 / 鸿蒙在开屏阶段调 onShareTimeline 会原生崩。
  try {
    installWxShare();
  } catch (e) {
    console.warn('[main] installWxShare 失败:', e);
  }

  console.log(`[main] ${GAME_TITLE} (${GAME_KEY}) MVP 启动, screen:`, host.screen.width, 'x', host.screen.height);
  void AssetLoader.prefetchManifest();
  return true;
}

let booted = false;

function tryBoot(reason: string): void {
  if (booted) return;
  try {
    if (!boot()) return;
    booted = true;
    if (typeof GameGlobal !== 'undefined') GameGlobal.__srpgBooted = true;
  } catch (e) {
    console.error(`[main] boot 异常 (${reason}):`, e);
  }
}

/**
 * 华为等安卓机双 rAF 经常不回调，只靠 rAF 会永远停在微信开屏。
 * setTimeout / nextTick / onShow 各兜一层。
 */
function scheduleBoot(): void {
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  if (raf) {
    raf(() => {
      raf(() => tryBoot('raf'));
    });
  }
  const later = typeof setTimeout === 'function' ? setTimeout : null;
  if (later) {
    later(() => tryBoot('timeout-0'), 0);
    later(() => tryBoot('timeout-300'), 300);
  } else if (!raf) {
    tryBoot('sync');
  }
  try {
    const wxApi = (typeof GameGlobal !== 'undefined' && GameGlobal.wx)
      || (typeof wx !== 'undefined' ? wx : null);
    wxApi?.nextTick?.(() => tryBoot('nextTick'));
    wxApi?.onShow?.(() => tryBoot('onShow'));
  } catch {
    /* */
  }
}

if (typeof GameGlobal !== 'undefined') {
  GameGlobal.__srpgTryBoot = () => tryBoot('external');
}

scheduleBoot();
