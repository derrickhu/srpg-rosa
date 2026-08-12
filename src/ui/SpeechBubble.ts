import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { C } from '@/view/mvpTheme';

export type SpeechBubbleTail = 'left' | 'right' | 'bottom';

export interface SpeechBubbleOptions {
  /** 气泡最大宽度（含内边距）；文字自动换行 */
  maxWidth?: number;
  padX?: number;
  padY?: number;
  /** 尖角朝向说话人；默认 left（尖角在左，气泡在角色右侧） */
  tail?: SpeechBubbleTail;
  /** 尖角长度 */
  tailLen?: number;
  fontSize?: number;
  /** 米白底（默认）或深色底（战场旁白） */
  tone?: 'light' | 'dark';
}

/**
 * 剧情 / 商人对话气泡。纯 Graphics + 得意黑/系统字，可复用到任意场景。
 *
 * 锚点在**尖角根部外侧**（贴着说话人那一侧）：
 * - `tail: 'left'`  → 容器原点在左尖，气泡向右展开（角色在左、气泡在右）
 * - `tail: 'right'` → 原点在右尖，气泡向左
 * - `tail: 'bottom'`→ 原点在底尖，气泡向上（角色头顶说话）
 */
export function makeSpeechBubble(text: string, opts: SpeechBubbleOptions = {}): PIXI.Container {
  const maxWidth = opts.maxWidth ?? 180;
  const padX = opts.padX ?? 12;
  const padY = opts.padY ?? 9;
  const tail = opts.tail ?? 'left';
  const tailLen = opts.tailLen ?? 10;
  const tone = opts.tone ?? 'light';
  const fill = tone === 'light' ? C.paper : C.panel;
  const textFill = tone === 'light' ? C.text : C.textOnDark;
  const wrapW = Math.max(40, maxWidth - padX * 2);

  const label = makeText(text, 'body', {
    fill: textFill,
    fontSize: opts.fontSize ?? 13,
    wordWrap: true,
    wordWrapWidth: wrapW,
    breakWords: true,
  });

  const boxW = Math.min(maxWidth, Math.ceil(label.width) + padX * 2);
  const boxH = Math.ceil(label.height) + padY * 2;
  const radius = 12;

  const root = new PIXI.Container();
  const g = new PIXI.Graphics();

  // 主体圆角盒相对尖角的偏移
  let boxX = 0;
  let boxY = 0;
  if (tail === 'left') {
    boxX = tailLen;
    boxY = 0;
  } else if (tail === 'right') {
    boxX = -boxW - tailLen;
    boxY = 0;
  } else {
    boxX = -boxW / 2;
    boxY = -boxH - tailLen;
  }

  g.lineStyle(2.5, C.ink, 1);
  g.beginFill(fill, 0.96);
  g.drawRoundedRect(boxX, boxY, boxW, boxH, radius);
  g.endFill();

  // 尖角：与盒同色，描边单独补两腰（避免圆角盒挡住）
  g.lineStyle(2.5, C.ink, 1);
  g.beginFill(fill, 0.96);
  if (tail === 'left') {
    const midY = boxY + boxH * 0.38;
    g.moveTo(boxX + 1, midY - 7);
    g.lineTo(0, midY);
    g.lineTo(boxX + 1, midY + 7);
    g.lineTo(boxX + 1, midY - 7);
  } else if (tail === 'right') {
    const midY = boxY + boxH * 0.38;
    const tipX = 0;
    const edge = boxX + boxW - 1;
    g.moveTo(edge, midY - 7);
    g.lineTo(tipX, midY);
    g.lineTo(edge, midY + 7);
    g.lineTo(edge, midY - 7);
  } else {
    const midX = boxX + boxW / 2;
    const edge = boxY + boxH - 1;
    g.moveTo(midX - 8, edge);
    g.lineTo(0, 0);
    g.lineTo(midX + 8, edge);
    g.lineTo(midX - 8, edge);
  }
  g.endFill();

  root.addChild(g);
  label.x = boxX + padX;
  label.y = boxY + padY;
  root.addChild(label);

  return root;
}
