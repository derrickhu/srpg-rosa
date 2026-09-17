import * as PIXI from 'pixi.js';

/**
 * 结算 / 获得 overlay 用的短 tween。
 *
 * 不从 `BattlePlaybackView` 里借 `awaitEase`：那份绑在战斗 ticker 和倍速上，
 * 弹层盖上去之后战场协程可能已经停了，overlay 自己驱动才不会「动画写了但不走」。
 *
 * 没有 Application（单测）时 ticker 没在跑，直接跳到终点，避免 Promise 挂死。
 */

export function easeOutQuad(k: number): number {
  return 1 - (1 - k) * (1 - k);
}

export function awaitDelay(ms: number): Promise<void> {
  return awaitEase(ms, () => undefined);
}

export function awaitEase(
  ms: number,
  onProgress: (t: number) => void,
  opts?: { live?: () => boolean },
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let acc = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const ticker = PIXI.Ticker.shared;
    const finish = (t: number): void => {
      if (settled) return;
      settled = true;
      if (watchdog !== undefined) clearTimeout(watchdog);
      ticker.remove(step);
      try {
        onProgress(t);
      } catch {
        /* 节点已拆时回调里写 x/y 会抛 */
      }
      resolve();
    };
    const step = (): void => {
      if (opts?.live && !opts.live()) {
        finish(1);
        return;
      }
      acc += ticker.deltaMS;
      const k = Math.min(1, acc / ms);
      try {
        onProgress(easeOutQuad(k));
      } catch {
        finish(1);
        return;
      }
      if (k >= 1) finish(1);
    };
    if (ms <= 0) {
      finish(1);
      return;
    }
    if (!ticker.started) {
      finish(1);
      return;
    }
    // 微信里 Ticker.shared 有时 started 但不再打拍。结算「领取」在等这段
    // Promise，ticker 一停人就卡在刚打完的战场上。用真实时钟兜底。
    watchdog = setTimeout(() => finish(1), Math.max(ms + 400, ms * 2));
    ticker.add(step);
  });
}
