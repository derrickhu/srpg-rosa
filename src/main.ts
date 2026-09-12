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
  if (e instanceof Error) {
    const head = [e.name, e.message].filter(Boolean).join(':');
    const stack = e.stack ? e.stack.split('\n').slice(0, 3).join('|') : '';
    return [head, stack].filter(Boolean).join(' ').slice(0, 400);
  }
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

function markBoot(step: string, err?: unknown): void {
  if (typeof GameGlobal === 'undefined') return;
  GameGlobal.__bootStep = step;
  if (err !== undefined) GameGlobal.__bootErr = formatBootErr(err);
  try {
    GameGlobal.__diag?.(err !== undefined ? `${step}:${formatBootErr(err)}` : step);
  } catch {
    /* */
  }
}

function boot(): boolean {
  markBoot('canvas');
  const canvas =
    (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) ||
    (typeof window !== 'undefined' && (window as unknown as { canvas?: HTMLCanvasElement }).canvas) ||
    null;

  if (!canvas) {
    markBoot('no-canvas');
    console.error('[main] 无法获取 canvas，请确认 pixi-adapter 已加载');
    return false;
  }

  markBoot('pixi');
  const host = createPixiHost(canvas);
  // 先清掉微信开屏，再跑 GameFlow。华为上 Text/云同步若卡住，至少能看见游戏底色。
  markBoot('render0');
  try {
    host.renderer.render(host.stage);
    if (typeof GameGlobal !== 'undefined') GameGlobal.__gameRendered = true;
  } catch (e) {
    markBoot('render0-fail', e);
    console.error('[main] empty stage render failed:', e);
  }

  markBoot('gameflow');
  new GameFlow(host);

  markBoot('render1');
  try {
    host.renderer.render(host.stage);
    if (typeof GameGlobal !== 'undefined') GameGlobal.__gameRendered = true;
  } catch (e) {
    markBoot('render1-fail', e);
    console.error('[main] 首次 render 失败:', e);
  }

  // 分享 API 放在首帧之后：部分安卓 / 鸿蒙在开屏阶段调 onShareTimeline 会原生崩。
  markBoot('share');
  try {
    installWxShare();
  } catch (e) {
    console.warn('[main] installWxShare 失败:', e);
    markBoot('share-fail', e);
  }

  console.log(`[main] ${GAME_TITLE} (${GAME_KEY}) MVP 启动, screen:`, host.screen.width, 'x', host.screen.height);
  void AssetLoader.prefetchManifest();
  markBoot('ok');
  return true;
}

let booted = false;
let booting = false;

function tryBoot(reason: string): void {
  if (booted || booting) return;
  booting = true;
  markBoot(`try:${reason}`);
  try {
    if (!boot()) {
      booting = false;
      return;
    }
    booted = true;
    if (typeof GameGlobal !== 'undefined') GameGlobal.__srpgBooted = true;
  } catch (e) {
    booting = false;
    markBoot(`throw:${reason}`, e);
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
