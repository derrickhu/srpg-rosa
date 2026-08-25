import * as PIXI from 'pixi.js';
import { AudioManager } from '@/core/AudioManager';
import { textStyle } from '@/theme/typography';
import { C, shade } from '@/view/mvpTheme';
import { makeButtonSkin } from './chrome';

/**
 * 按钮语义档位。**优先用 variant，不要逐处传颜色**——散在各 View 里的一次性配色
 * 正是上一版 UI 看起来东拼西凑的原因。
 *
 * - `primary`  金色主行动。够宽的主 CTA 才套金皮；小钮走色块，避免九宫格把两头拉变形。
 * - `secondary` 蓝灰次行动。
 * - `danger`   破坏性操作（放弃副本一类）。
 * - `ghost`    透明底，只有描边，用于「关闭 / 取消」这种不该抢视线的操作。
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonOptions {
  variant?: ButtonVariant;
  width?: number;
  height?: number;
  fontSize?: number;
  radius?: number;
  /** 覆盖 variant 的底色。只在 variant 表达不了时用 */
  fillColor?: number;
  fillAlpha?: number;
  borderColor?: number;
  textColor?: number;
  /** 禁用：发灰、点不动、不沉底 */
  disabled?: boolean;
}

export type ButtonNode = PIXI.Container & {
  setDisabled: (on: boolean) => void;
};

interface VariantStyle {
  /** 面色 */
  fill: number;
  /** 下沿色。默认由面色压暗得到，ghost 单独给，因为它没有实色面 */
  base?: number;
  /** 面与下沿的不透明度，ghost 要半透明才能透出下面的面板 */
  alpha?: number;
  /**
   * 是否在描边外再套一圈米白。主 CTA 是金色，而战场背景是同明度的黄绿草地
   * （金 L66 / 草 L56），只有一圈近黑描边压不住，按钮会陷进草里。
   * 这圈米白和 logo 用的是同一招。ghost 只出现在米白面板上，不需要。
   */
  rim?: boolean;
  text: number;
}

/** 米白外圈的厚度 */
const RIM = 2;

/**
 * ghost 是**给浅色面板用的**：底几乎透明、字用深色。这一档目前只出现在设置弹窗和
 * 角色详情这类米白面板上。真要放到深色底上，得另开一档，别直接改这里的字色。
 */
const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { fill: C.primary, text: 0x4a3a12, rim: true },
  secondary: { fill: C.secondary, text: C.textOnDark, rim: true },
  danger: { fill: C.danger, text: C.textOnDark, rim: true },
  ghost: { fill: 0xffffff, base: 0x000000, alpha: 0.22, text: C.text },
};

/** 按下时下沉的像素数，也是静止时底部露出的深色下沿厚度 */
const LIP = 3;
const PRESS_SCALE = 0.97;

/** 禁用态的外观与命中。Pixi 在 node 里建不了 Graphics，单测只测这一层 */
export function buttonDisabledLook(disabled: boolean): {
  alpha: number;
  eventMode: 'none' | 'static';
} {
  return disabled
    ? { alpha: 0.45, eventMode: 'none' }
    : { alpha: 1, eventMode: 'static' };
}

export function shouldFireButtonPress(disabled: boolean): boolean {
  return !disabled;
}

export function makeButton(
  label: string,
  onPress: () => void,
  opts?: ButtonOptions,
): ButtonNode {
  const variant = opts?.variant ?? 'secondary';
  const style = VARIANTS[variant];
  const w = opts?.width ?? Math.max(140, label.length * 14 + 24);
  const h = opts?.height ?? 40;
  const radius = opts?.radius ?? 10;
  const fill = opts?.fillColor ?? style.fill;
  const textColor = opts?.textColor ?? style.text;
  const fontSize = opts?.fontSize ?? 15;
  const alpha = opts?.fillAlpha ?? style.alpha ?? 1;

  const c = new PIXI.Container() as ButtonNode;
  // 视觉放在带中心 pivot 的内层，外层原点仍是左上角，各页 x/y 不用改
  const inner = new PIXI.Container();
  inner.pivot.set(w / 2, h / 2);
  inner.x = w / 2;
  inner.y = h / 2;
  c.addChild(inner);

  const skin = variant === 'primary' && opts?.fillColor == null ? makeButtonSkin(w, h) : null;
  let face: PIXI.Container;

  if (skin) {
    // 主 CTA 用画出来的金皮。皮自己带高光和下沿，再套米白外圈会像贴了两层。
    inner.addChild(skin);
    face = skin;
  } else {
    if (style.rim) {
      const rim = new PIXI.Graphics();
      rim.beginFill(C.paper, 1);
      rim.drawRoundedRect(-RIM, -RIM, w + RIM * 2, h + RIM * 2, radius + RIM);
      rim.endFill();
      inner.addChild(rim);
    }

    // 底座：比面色暗一档，只有底部 LIP 像素露出来，形成厚实的下沿。
    const base = new PIXI.Graphics();
    base.lineStyle(2, opts?.borderColor ?? C.ink, 1, 0);
    base.beginFill(style.base ?? shade(fill, 0.72), alpha);
    base.drawRoundedRect(0, 0, w, h, radius);
    base.endFill();
    inner.addChild(base);

    const g = new PIXI.Graphics();
    g.beginFill(fill, alpha);
    g.drawRoundedRect(2, 2, w - 4, h - 4 - LIP, Math.max(2, radius - 2));
    g.endFill();
    inner.addChild(g);
    face = g;
  }

  // 按钮文案用展示字体，和正文系统字拉开层级
  const tx = new PIXI.Text(label, textStyle('title', { fill: textColor, fontSize }));
  tx.anchor.set(0.5);
  tx.x = w / 2;
  tx.y = (h - (skin ? 0 : LIP)) / 2;
  inner.addChild(tx);

  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.hitArea = new PIXI.Rectangle(0, 0, w, h);

  let disabled = false;

  const restTextY = (h - (skin ? 0 : LIP)) / 2;
  const press = (down: boolean): void => {
    if (disabled) return;
    face.y = down ? LIP : 0;
    tx.y = restTextY + (down ? LIP : 0);
    inner.scale.set(down ? PRESS_SCALE : 1);
  };

  const applyDisabled = (on: boolean): void => {
    disabled = on;
    const look = buttonDisabledLook(on);
    c.alpha = look.alpha;
    c.eventMode = look.eventMode;
    c.cursor = on ? 'default' : 'pointer';
    if (on) {
      face.y = 0;
      tx.y = restTextY;
      inner.scale.set(1);
    }
  };

  c.on('pointerdown', () => press(true));
  c.on('pointerup', () => press(false));
  c.on('pointerupoutside', () => press(false));
  c.on('pointertap', () => {
    if (!shouldFireButtonPress(disabled)) return;
    AudioManager.playSfx('ui_click');
    onPress();
  });

  c.setDisabled = applyDisabled;
  applyDisabled(opts?.disabled ?? false);

  return c;
}

export function makeMiniButton(
  label: string,
  onPress: () => void,
  opts?: ButtonOptions,
): ButtonNode {
  return makeButton(label, onPress, {
    variant: 'ghost',
    ...opts,
    width: opts?.width ?? 88,
    height: opts?.height ?? 32,
    fontSize: opts?.fontSize ?? 12,
    radius: opts?.radius ?? 8,
  });
}
