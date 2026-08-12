import * as PIXI from 'pixi.js';

/**
 * 全站文字角色。业务侧禁止手写 fontFamily，一律走 textStyle / makeText。
 *
 * - 正文/HUD/数字：系统字体（不打包自定义字）
 * - 展示类：得意黑 Smiley Sans（OFL），见 docs/字体规范.md
 */
export type TextRole =
  | 'display'
  | 'title'
  | 'ui'
  | 'uiStrong'
  | 'body'
  | 'caption'
  | 'combatFloat'
  | 'combatLabel'
  | 'micro';

/**
 * 需要游戏展示字体的角色（其余走系统字）。
 * 战斗飘字 / 技能名 / 回合条算「反馈展示」，必须和 HUD 正文区分开。
 */
export const SHOWCASE_ROLES: ReadonlySet<TextRole> = new Set([
  'display',
  'title',
  'combatLabel',
  'combatFloat',
]);

/**
 * 系统 UI 字体栈。微信小游戏 canvas 会落到苹方/黑体，
 * 正文与系统字差别本就不大，不必再打一份思源进包。
 */
const SYSTEM_STACK = 'sans-serif';

/** 展示字体逻辑名；FontLoader 成功后覆写为 wx.loadFont 返回值 */
let showcaseFamily = 'SmileySans';

const ROLE_DEFAULTS: Record<
  TextRole,
  { showcase: boolean; fontSize: number; fontWeight: 'normal' | 'bold' }
> = {
  display: { showcase: true, fontSize: 26, fontWeight: 'bold' },
  title: { showcase: true, fontSize: 18, fontWeight: 'bold' },
  ui: { showcase: false, fontSize: 14, fontWeight: 'normal' },
  uiStrong: { showcase: false, fontSize: 14, fontWeight: 'bold' },
  body: { showcase: false, fontSize: 12, fontWeight: 'normal' },
  caption: { showcase: false, fontSize: 11, fontWeight: 'normal' },
  combatFloat: { showcase: true, fontSize: 22, fontWeight: 'bold' },
  combatLabel: { showcase: true, fontSize: 15, fontWeight: 'bold' },
  micro: { showcase: false, fontSize: 9, fontWeight: 'normal' },
};

export function setShowcaseFontFamily(family: string): void {
  showcaseFamily = family;
}

export function showcaseFontFamily(): string {
  return showcaseFamily;
}

export type TextStyleOverrides = Partial<PIXI.ITextStyle> & {
  fontSize?: number;
};

/**
 * 生成 Text 样式。展示角色注入得意黑；其余只用系统栈。
 * overrides 可改颜色/字号/描边，不能靠它换字体。
 */
export function textStyle(role: TextRole, overrides: TextStyleOverrides = {}): Partial<PIXI.ITextStyle> {
  const def = ROLE_DEFAULTS[role];
  const { fontFamily: _ignored, fontWeight: ow, ...rest } = overrides as TextStyleOverrides & {
    fontFamily?: string;
  };
  return {
    fontSize: def.fontSize,
    fontWeight: ow ?? def.fontWeight,
    ...rest,
    fontFamily: def.showcase ? showcaseFamily : SYSTEM_STACK,
  };
}

export function makeText(
  content: string,
  role: TextRole,
  overrides: TextStyleOverrides = {},
): PIXI.Text {
  return new PIXI.Text(content, textStyle(role, overrides));
}
