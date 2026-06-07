/**
 * 无尽纹章 - 小游戏入口（须先于 PIXI.Application 加载 unsafe-eval patch）
 */
import '@/core/pixiUnsafeEvalPatch';
import { createPixiHost } from '@/boot/createPixiApp';
import { GameFlow } from '@/view/GameFlow';
import '@/platform/wxPlatform';

declare const GameGlobal: any;

if (typeof GameGlobal !== 'undefined') {
  GameGlobal.onError = (msg: string) => {
    console.error('[GlobalError]', msg);
  };
  GameGlobal.onUnhandledRejection = (ev: unknown) => {
    console.error('[UnhandledRejection]', ev);
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

  console.log('[main] 无尽纹章 MVP 启动, screen:', host.screen.width, 'x', host.screen.height);
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
