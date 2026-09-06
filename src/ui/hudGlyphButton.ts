import * as PIXI from 'pixi.js';
import { AudioManager } from '@/core/AudioManager';
import { makeText } from '@/theme/typography';
import { attachPress } from '@/ui/press';
import { createUiIcon } from '@/view/renderHelpers';
import { C, mix, shade } from '@/view/mvpTheme';

const DEFAULT_D = 52;
const ICON = 30;
const LIP = 3;
const CHIP_H = 16;

/**
 * 战斗右下那种圆盘徽钮：米白外晕 + 色环 + 底部名牌。
 * 图只出剪影，字用代码画，和托管 / 接手同一套。
 */
export function makeRoundHudButton(opts: {
  iconKey: string;
  label: string;
  /** 色环。复活这类次操作走蓝灰，不要金 */
  tone?: number;
  diameter?: number;
  onPress: () => void;
}): PIXI.Container {
  const d = opts.diameter ?? DEFAULT_D;
  const r = d / 2;
  const tone = opts.tone ?? C.secondary;
  const face = mix(C.panel, tone, 0.16);

  const btn = new PIXI.Container();
  const inner = new PIXI.Container();
  const plate = new PIXI.Graphics();
  inner.addChild(plate);

  const icon = createUiIcon(opts.iconKey, ICON);
  if (icon) {
    icon.x = r - ICON / 2;
    icon.y = r - ICON / 2 - 6;
    inner.addChild(icon);
  }

  const lbl = makeText(opts.label, 'heading', { fill: C.paper, fontSize: 11 });
  lbl.anchor.set(0.5);
  lbl.x = r;
  lbl.y = d - 9;
  inner.addChild(lbl);
  btn.addChild(inner);

  plate.beginFill(C.paper, 0.92);
  plate.drawCircle(r + 0.5, r + 1.5, r + 2);
  plate.endFill();
  plate.beginFill(shade(face, 0.48), 1);
  plate.drawCircle(r + 1, r + LIP, r);
  plate.endFill();
  plate.lineStyle(2, C.ink, 1, 0);
  plate.beginFill(face, 1);
  plate.drawCircle(r, r, r);
  plate.endFill();
  plate.lineStyle(2.5, tone, 1);
  plate.drawCircle(r, r, r - 2.5);
  plate.lineStyle(1.5, C.ink, 1, 0);
  plate.beginFill(mix(C.ink, C.panel, 0.35), 0.96);
  plate.drawRoundedRect(r - 22, d - 16, 44, CHIP_H, 8);
  plate.endFill();

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-8, -8, d + 16, d + LIP + 16);
  attachPress(btn, { scale: 0.96 });
  const sink = (down: boolean): void => {
    inner.y = down ? LIP : 0;
  };
  btn.on('pointerup', () => sink(false));
  btn.on('pointerupoutside', () => sink(false));
  btn.on('pointercancel', () => sink(false));
  let lastAt = 0;
  btn.on('pointerdown', () => {
    const now = Date.now();
    if (now - lastAt < 280) return;
    lastAt = now;
    sink(true);
    AudioManager.playSfx('ui_click');
    opts.onPress();
  });

  return btn;
}
