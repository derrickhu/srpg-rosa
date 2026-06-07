import * as PIXI from 'pixi.js';

export function showToast(
  parent: PIXI.Container,
  msg: string,
  opts?: { color?: number; fontSize?: number; durationMs?: number; x?: number; y?: number },
): void {
  const t = new PIXI.Text(msg, {
    fill: opts?.color ?? 0xffcc66,
    fontSize: opts?.fontSize ?? 14,
  });
  t.x = opts?.x ?? 16;
  t.y = opts?.y ?? 24;
  parent.addChild(t);
  setTimeout(() => {
    if (!t.destroyed) parent.removeChild(t);
    t.destroy();
  }, opts?.durationMs ?? 1600);
}
