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

  // 不用描金角花框：那张方图一拉伸，四角云纹会变成贴纸，标题还会嵌进黑边。
  // 大厅明底靠落影和米白面分层，战场深色浮层仍走色块。
  if (light) {
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.16);
    shadow.drawRoundedRect(2, 4, opts.width, opts.height, radius);
    shadow.endFill();
    c.addChild(shadow);
  }

  const bg = new PIXI.Graphics();
  bg.lineStyle(light ? 1.5 : 2, opts.borderColor ?? C.ink, light ? 0.35 : 1, 0);
  bg.beginFill(fill, opts.fillAlpha ?? 0.97);
  bg.drawRoundedRect(0, 0, opts.width, opts.height, radius);
  bg.endFill();
  c.addChild(bg);

  return c;
}
