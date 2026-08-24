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
    const finish = (t: number): void => {
      try {
        onProgress(t);
      } catch {
        /* 节点已拆时回调里写 x/y 会抛 */
      }
      resolve();
    };
    if (ms <= 0) {
      finish(1);
      return;
    }
    const ticker = PIXI.Ticker.shared;
    if (!ticker.started) {
      finish(1);
      return;
    }
    let acc = 0;
    const step = (): void => {
      if (opts?.live && !opts.live()) {
        ticker.remove(step);
        resolve();
        return;
      }
      acc += ticker.deltaMS;
      const k = Math.min(1, acc / ms);
      try {
        onProgress(easeOutQuad(k));
      } catch {
        ticker.remove(step);
        resolve();
        return;
      }
      if (k >= 1) {
        ticker.remove(step);
        resolve();
      }
    };
    ticker.add(step);
  });
}
