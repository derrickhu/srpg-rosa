import * as PIXI from 'pixi.js';
import { textStyle } from '@/theme/typography';
import { isDisplayLive, safeDestroy } from '@/view/pixiLive';

export function showToast(
  parent: PIXI.Container,
  msg: string,
  opts?: { color?: number; fontSize?: number; durationMs?: number; x?: number; y?: number },
): void {
  const t = new PIXI.Text(msg, textStyle('ui', {
    fill: opts?.color ?? 0xffcc66,
    fontSize: opts?.fontSize ?? 14,
  }));
  t.x = opts?.x ?? 16;
  t.y = opts?.y ?? 24;
  parent.addChild(t);
  setTimeout(() => {
    // 这 1.6s 里玩家已经切走了页面：父节点会把 Text 一起拆掉。
    // 再无条件 destroy 就会在空贴图上调 off，微信直接抛 MiniProgramError。
    if (!isDisplayLive(t)) return;
    t.parent?.removeChild(t);
    safeDestroy(t);
  }, opts?.durationMs ?? 1600);
}
