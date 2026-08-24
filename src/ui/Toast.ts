import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { getSafeAreaInsets } from '@/core/safeArea';
import { isDisplayLive, safeDestroy } from '@/view/pixiLive';
import { awaitDelay, awaitEase } from '@/view/fx/tween';
import { C } from '@/view/mvpTheme';

export interface ToastOptions {
  color?: number;
  fontSize?: number;
  durationMs?: number;
  x?: number;
  y?: number;
  /** 有宽度时水平居中，避开「裸字贴左上」在草地上糊掉 */
  screenWidth?: number;
}

export function showToast(
  parent: PIXI.Container,
  msg: string,
  opts?: ToastOptions,
): void {
  const wrap = new PIXI.Container();
  const fontSize = opts?.fontSize ?? 14;
  const maxW = Math.max(160, (opts?.screenWidth ?? 300) - 48);
  const tx = makeText(msg, 'ui', {
    fill: opts?.color ?? C.paper,
    fontSize,
    wordWrap: true,
    wordWrapWidth: maxW - 28,
    breakWords: true,
  });
  const padX = 14;
  const padY = 8;
  const bw = Math.ceil(tx.width) + padX * 2;
  const bh = Math.ceil(tx.height) + padY * 2;
  const bg = new PIXI.Graphics();
  bg.lineStyle(2, C.ink, 1, 0);
  bg.beginFill(C.panel, 0.94);
  bg.drawRoundedRect(0, 0, bw, bh, Math.min(18, bh / 2));
  bg.endFill();
  tx.x = padX;
  tx.y = padY;
  wrap.addChild(bg);
  wrap.addChild(tx);

  const screenW = opts?.screenWidth;
  if (opts?.x != null) {
    wrap.x = opts.x;
  } else if (screenW != null) {
    wrap.x = Math.round((screenW - bw) / 2);
  } else {
    wrap.x = 16;
  }
  wrap.y = opts?.y ?? getSafeAreaInsets().top + 8;
  wrap.alpha = 0;
  parent.addChild(wrap);

  const duration = opts?.durationMs ?? 1600;
  const fadeIn = 140;
  const fadeOut = 220;
  const hold = Math.max(200, duration - fadeIn - fadeOut);
  const live = (): boolean => isDisplayLive(wrap);

  void (async () => {
    await awaitEase(fadeIn, (k) => {
      if (live()) wrap.alpha = k;
    }, { live });
    await awaitDelay(hold);
    await awaitEase(fadeOut, (k) => {
      if (live()) wrap.alpha = 1 - k;
    }, { live });
    if (!live()) return;
    wrap.parent?.removeChild(wrap);
    safeDestroy(wrap);
  })();
}
