import * as PIXI from 'pixi.js';
import { C } from '@/view/mvpTheme';

export interface PanelOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  /** 明底面板。弹窗正文多、要读字的用它；深色壳用于战场上的浮层 */
  light?: boolean;
  fillColor?: number;
  fillAlpha?: number;
  borderColor?: number;
  radius?: number;
}

export function makePanel(opts: PanelOptions): PIXI.Container {
  const c = new PIXI.Container();
  c.x = opts.x ?? 0;
  c.y = opts.y ?? 0;

  const light = opts.light ?? false;
  const fill = opts.fillColor ?? (light ? C.paper : C.panel);
  const radius = opts.radius ?? 14;

  // 平涂 + 近黑粗描边，和角色、按钮共用一套线条语言。按风格圣经 §9 不加渐变和斜面：
  // 面板没有交互，不需要立体反馈，加了只会和战场上的角色抢注意力。
  const bg = new PIXI.Graphics();
  bg.lineStyle(2, opts.borderColor ?? C.ink, 1, 0);
  bg.beginFill(fill, opts.fillAlpha ?? 0.97);
  bg.drawRoundedRect(0, 0, opts.width, opts.height, radius);
  bg.endFill();
  c.addChild(bg);

  return c;
}
