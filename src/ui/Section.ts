import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { C } from '@/view/mvpTheme';
import { makePanel } from './Panel';

export interface SectionOptions {
  width: number;
  /** 内容区高度（不含标题栏）。整块面板高 = 这个值 + 标题栏 + 内边距 */
  contentHeight: number;
  title: string;
  /** 标题右侧的小字，放计数、剩余次数这类附注 */
  note?: string;
  x?: number;
  y?: number;
}

export interface SectionHandle {
  root: PIXI.Container;
  /** 内容容器，原点在内容区左上角 */
  body: PIXI.Container;
  /** 内容可用宽度 */
  bodyWidth: number;
  /** 整块面板占的高度，调用方据此累加 y */
  height: number;
}

const TITLE_H = 30;
const PAD = 10;

/**
 * 一个带标题的米白分区面板。
 *
 * 大厅这几页原来是「白字标题 + 卡片」直接摆在草地背景上，而草地是 `#CCE43C`（L56）的
 * 高频纹理，白字压上去几乎读不出来（背包页那行横幅就是典型）。风格圣经 §6 早就规定
 * 「冷蓝灰外壳 + 大面积白留白」，这里就是把它落实：**正文一律待在不透明米白面板里**，
 * 分区之间才露草地。
 *
 * 标题放在面板**内部**而不是浮在面板上方，这样标题和它管辖的内容是同一个色块，
 * 不会出现「这个标题到底属于上面还是下面」的歧义。
 */
export function makeSection(opts: SectionOptions): SectionHandle {
  const height = TITLE_H + opts.contentHeight + PAD;
  const root = makePanel({
    width: opts.width,
    height,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    light: true,
  });

  const t = makeText(opts.title, 'uiStrong', { fill: C.text });
  t.x = PAD + 2;
  t.y = Math.round((TITLE_H - t.height) / 2) + 2;
  root.addChild(t);

  if (opts.note) {
    const n = makeText(opts.note, 'caption', { fill: C.muted });
    n.anchor.set(1, 0);
    n.x = opts.width - PAD - 2;
    n.y = t.y + 2;
    root.addChild(n);
  }

  // 标题与内容之间一条细分隔线。不用留白代替：分区里的卡片本身也是浅色块，
  // 只靠间距的话标题会读成第一张卡的一部分。
  const line = new PIXI.Graphics();
  line.lineStyle(1, C.ink, 0.12);
  line.moveTo(PAD, TITLE_H - 2);
  line.lineTo(opts.width - PAD, TITLE_H - 2);
  root.addChild(line);

  const body = new PIXI.Container();
  body.x = PAD;
  body.y = TITLE_H;
  root.addChild(body);

  return { root, body, bodyWidth: opts.width - PAD * 2, height };
}
