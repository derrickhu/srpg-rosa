import type { UnitKind } from '@/battle/types';

/**
 * 全局配色。数值出处见 `docs/美术风格圣经.md` §2.2 地形色板与 §2.3 UI 色板。
 *
 * §2.3 的语义色是锁死的：金 = 局内金币、紫 = 魂晶、薄荷 = 精华、红 = 生命。
 * 不要拿它们做装饰性配色，否则玩家会把装饰误读成资源。
 */

/** 职业顶条，色值锁在圣经 §2.1，大厅卡和三选一用同一套 */
export const PROFESSION_ACCENT: Record<UnitKind, number> = {
  sword: 0x2b6cdb,
  bow: 0x549c0c,
  shield: 0xa8a8a8,
  cavalry: 0xfcb40c,
  mage: 0x0e7a7a,
  healer: 0xf5e6c8,
};
export const C = {
  // --- 战场 ---
  /** 平原格与背景兜底色，取自战斗背景实测主色 */
  bg: 0xcce43c,
  gridLine: 0xa8c43c,
  plain: 0xcce43c,
  high: 0xd8b878,
  deployTint: 0xaaddaa,

  // --- UI 外壳 ---
  /** 面板底，冷蓝灰 */
  panel: 0x465470,
  /** 留白，占面板 38%、按钮 70% */
  paper: 0xfcfcf6,
  /**
   * 近黑描边。和角色用的是同一个墨色——UI 与角色共用一套线条语言，
   * UI 才不会看起来像贴上去的另一个作品。
   */
  ink: 0x1a1410,

  // --- 文字 ---
  text: 0x333333,
  muted: 0x777777,
  /** 深色底上的文字 */
  textOnDark: 0xfcfcf6,

  // --- 按钮 ---
  /** 主行动金色。一屏最多一个，多了主次就没了 */
  primary: 0xeec462,
  secondary: 0x54708c,
  danger: 0xd2543c,

  // --- 语义色（锁死） ---
  /** 局内金币，出关就清空 */
  gold: 0xeec446,
  /**
   * 魂晶，永久 meta 货币。取自 `icon_soul` 实测主色。
   * 和金币分开是因为两者花在完全不同的地方，混用会让玩家以为攒的是同一笔钱。
   */
  soul: 0xb43ce4,
  /** 深色底上的魂晶文字。饱和紫在深蓝面板上读不动，压亮一档专门给文字用 */
  soulText: 0xd8b0ff,
  /**
   * 深色底上的「不利」小字（地形角标的惩罚项等）。
   * `danger` 是按钮填充色，中暗红压在近黑底上、字号只有 8px 时基本读不出来，
   * 同 `soulText` 的处理：提亮一档专门给文字用。
   */
  warnText: 0xff9a7a,
  /** 精华，单局内的属性道具，别和魂晶混 */
  essence: 0xc4e0d2,
  hp: 0xe05446,

  // --- 兼容旧代码 ---
  accent: 0xeec462,
  enemyTint: 0xdd6666,
  playerTint: 0x5588cc,
};

/** 按比例压暗一个颜色，用来生成按钮的下沿与按下态 */
export function shade(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 0xff) * k);
  const g = Math.round(((color >> 8) & 0xff) * k);
  const b = Math.round((color & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

/** 两色按 t 插值。浅底分区用 paper 混一点 panel / soul，避免 View 里手写 hex */
export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}
