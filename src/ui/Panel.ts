import * as PIXI from 'pixi.js';
import { C } from '@/view/mvpTheme';

export interface PanelOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  fillColor?: number;
  fillAlpha?: number;
  borderColor?: number;
  radius?: number;
}

export function makePanel(opts: PanelOptions): PIXI.Container {
  const c = new PIXI.Container();
  c.x = opts.x ?? 0;
  c.y = opts.y ?? 0;

  const bg = new PIXI.Graphics();
  bg.lineStyle(1, opts.borderColor ?? C.accent, 1);
  bg.beginFill(opts.fillColor ?? 0x1a1a22, opts.fillAlpha ?? 0.96);
  bg.drawRoundedRect(0, 0, opts.width, opts.height, opts.radius ?? 10);
  bg.endFill();
  c.addChild(bg);

  return c;
}
