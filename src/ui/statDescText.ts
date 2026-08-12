import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { C } from '@/view/mvpTheme';

/**
 * 说明文案里的关键数字高亮色。
 * 不用 `C.gold`：金色锁给货币/主 CTA，拿来铺说明会稀释主次。
 */
const STAT_ACCENT = 0xc4782a;

export interface StatDescBlockOpts {
  maxWidth: number;
  fontSize?: number;
  /** 行距（像素） */
  lineGap?: number;
  bodyFill?: number;
  accentFill?: number;
}

/**
 * 分行说明 + 数字高亮（`+5` / `3` / `35%` 等）。
 * 商店详情、以后剧情说明板可复用。
 */
export function makeStatDescBlock(lines: string[], opts: StatDescBlockOpts): PIXI.Container {
  const root = new PIXI.Container();
  const fontSize = opts.fontSize ?? 12;
  const gap = opts.lineGap ?? 4;
  let y = 0;
  for (const line of lines) {
    if (!line) continue;
    const row = makeHighlightLine(line, {
      maxWidth: opts.maxWidth,
      fontSize,
      bodyFill: opts.bodyFill ?? C.muted,
      accentFill: opts.accentFill ?? STAT_ACCENT,
    });
    row.y = y;
    root.addChild(row);
    y += Math.max(fontSize + 2, row.height) + gap;
  }
  return root;
}

function makeHighlightLine(
  text: string,
  opts: { maxWidth: number; fontSize: number; bodyFill: number; accentFill: number },
): PIXI.Container {
  const row = new PIXI.Container();
  const re = /([+-]?\d+%?)/g;
  const parts: { t: string; hi: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), hi: false });
    parts.push({ t: m[1]!, hi: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), hi: false });
  if (parts.length === 0) parts.push({ t: text, hi: false });

  let x = 0;
  let lineY = 0;
  const lineStep = opts.fontSize + 4;
  for (const p of parts) {
    if (!p.t) continue;
    const tx = makeText(p.t, 'caption', {
      fill: p.hi ? opts.accentFill : opts.bodyFill,
      fontSize: opts.fontSize,
      fontWeight: p.hi ? 'bold' : 'normal',
    });
    if (x > 0 && x + tx.width > opts.maxWidth) {
      x = 0;
      lineY += lineStep;
    }
    tx.x = x;
    tx.y = lineY;
    row.addChild(tx);
    x += tx.width;
  }
  return row;
}
