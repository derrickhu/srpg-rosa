import * as PIXI from 'pixi.js';

export interface PressOptions {
  /** 按下时的缩放。默认 0.97，原点在左上，避免改 pivot 打乱各页排版 */
  scale?: number;
  /** 返回 true 时不进入按下态（滚动误触） */
  guard?: () => boolean;
  /** 返回 false 时完全不响应（禁用芯片） */
  enabled?: () => boolean;
}

/**
 * 给任意可点节点补「按下缩小、抬手复位」。
 *
 * 不改 pivot：调用方按左上角排 x/y，这里一改原点所有大厅卡都会错位。
 * 3% 的左上收缩在手机上够用来确认点到了。
 */
export function attachPress(node: PIXI.Container, opts?: PressOptions): void {
  const downS = opts?.scale ?? 0.97;
  const can = (): boolean => (opts?.enabled?.() ?? true) && !opts?.guard?.();
  const apply = (down: boolean): void => {
    if (down && !can()) return;
    node.scale.set(down ? downS : 1);
  };
  node.on('pointerdown', () => apply(true));
  node.on('pointerup', () => apply(false));
  node.on('pointerupoutside', () => apply(false));
  node.on('pointercancel', () => apply(false));
}
