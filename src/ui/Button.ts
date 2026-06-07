import * as PIXI from 'pixi.js';
import { C } from '@/view/mvpTheme';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  fillColor?: number;
  fillAlpha?: number;
  borderColor?: number;
  textColor?: number;
  radius?: number;
}

export function makeButton(
  label: string,
  onPress: () => void,
  opts?: ButtonOptions,
): PIXI.Container {
  const w = opts?.width ?? Math.max(140, label.length * 14 + 24);
  const h = opts?.height ?? 40;
  const radius = opts?.radius ?? 8;
  const fillColor = opts?.fillColor ?? C.accent;
  const fillAlpha = opts?.fillAlpha ?? 0.25;
  const borderColor = opts?.borderColor ?? C.accent;
  const textColor = opts?.textColor ?? C.text;
  const fontSize = opts?.fontSize ?? 15;

  const g = new PIXI.Graphics();
  g.lineStyle(1, borderColor, 1);
  g.beginFill(fillColor, fillAlpha);
  g.drawRoundedRect(0, 0, w, h, radius);
  g.endFill();

  const tx = new PIXI.Text(label, { fill: textColor, fontSize });
  tx.anchor.set(0.5);
  tx.x = w / 2;
  tx.y = h / 2;

  const c = new PIXI.Container();
  c.addChild(g);
  c.addChild(tx);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.hitArea = new PIXI.Rectangle(0, 0, w, h);
  c.on('pointertap', onPress);
  return c;
}

export function makeMiniButton(
  label: string,
  onPress: () => void,
  opts?: ButtonOptions,
): PIXI.Container {
  return makeButton(label, onPress, {
    width: opts?.width ?? 88,
    height: opts?.height ?? 32,
    fontSize: opts?.fontSize ?? 12,
    fillColor: opts?.fillColor ?? 0x444444,
    fillAlpha: opts?.fillAlpha ?? 0.6,
    borderColor: opts?.borderColor ?? C.muted,
    textColor: opts?.textColor ?? C.muted,
    radius: opts?.radius ?? 6,
  });
}
