import * as PIXI from 'pixi.js';
import { C } from '@/view/mvpTheme';

/**
 * 列表项卡片的三种状态。
 *
 * `locked` 用深色底而不是把米白卡压半透明：半透明卡叠在草地上会透出草纹，
 * 读起来像「这张卡没画完」，而不是「这个东西你还没有」。深底是明确的空缺信号。
 */
export type CardTone = 'normal' | 'locked' | 'selected';

export interface CardOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  tone?: CardTone;
  radius?: number;
  onTap?: () => void;
  /**
   * 返回 true 时忽略这次点击。
   *
   * 传 `ScrollList.wasDragging` 用：滑动列表时手指必然落在某张卡上，
   * 不拦的话每次滚动都会顺手点开一张卡。
   */
  guard?: () => boolean;
}

/** 卡片底色与描边。米白卡面是 §6 规定的正文承载色，不要在各页各写一份 */
function toneStyle(tone: CardTone): { fill: number; alpha: number; line: number; lineW: number } {
  switch (tone) {
    case 'locked':
      return { fill: C.panel, alpha: 0.62, line: C.ink, lineW: 1.5 };
    case 'selected':
      return { fill: C.paper, alpha: 1, line: C.primary, lineW: 3 };
    default:
      return { fill: C.paper, alpha: 1, line: C.ink, lineW: 1.5 };
  }
}

/**
 * 一张卡片容器。内容自己往返回的容器里加，坐标原点是卡片左上角。
 *
 * 抽出来是因为 `52 / 56 / 68px` 的「圆角矩形 + 米白底 + 描边」在招募 / 背包 / 副本
 * 三个页面各写了一遍，颜色还各自硬编码成 `0xfefef6`——改一次配色要翻三个文件。
 */
export function makeCard(opts: CardOptions): PIXI.Container {
  const c = new PIXI.Container();
  c.x = opts.x ?? 0;
  c.y = opts.y ?? 0;

  const { fill, alpha, line, lineW } = toneStyle(opts.tone ?? 'normal');
  const g = new PIXI.Graphics();
  g.lineStyle(lineW, line, 1, 0);
  g.beginFill(fill, alpha);
  g.drawRoundedRect(0, 0, opts.width, opts.height, opts.radius ?? 12);
  g.endFill();
  c.addChild(g);

  if (opts.onTap) {
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new PIXI.Rectangle(0, 0, opts.width, opts.height);
    c.on('pointertap', () => {
      if (opts.guard?.()) return;
      opts.onTap?.();
    });
  }

  return c;
}
