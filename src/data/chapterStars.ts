/**
 * 整章三星：条件写在副本表里，文案由 kind 生成，避免「显示一套、判定另一套」。
 */

export type StarCond =
  | { kind: 'clear' }
  | { kind: 'maxRounds'; max: number }
  | { kind: 'maxDeaths'; max: number }
  | { kind: 'noPotion' }
  | { kind: 'noShop' };

export interface ChapterStarDef {
  cond: StarCond;
  soul: number;
}

export const CHAPTER_STAR_COUNT = 3;

export type ChapterStars = readonly [ChapterStarDef, ChapterStarDef, ChapterStarDef];

/** 一局冒险里给评星用的累计（不进 meta，run 结束即弃） */
export interface RunStarStats {
  battleRounds: number;
  allyDeaths: number;
  potionsUsed: number;
  shopBuys: number;
}

export function emptyRunStarStats(): RunStarStats {
  return { battleRounds: 0, allyDeaths: 0, potionsUsed: 0, shopBuys: 0 };
}

export function starCondLabel(cond: StarCond): string {
  switch (cond.kind) {
    case 'clear':
      return '成功通关';
    case 'maxRounds':
      return `${cond.max} 回合内通关`;
    case 'maxDeaths':
      return cond.max <= 0 ? '无人伤亡' : `伤亡 ${cond.max} 人以内`;
    case 'noPotion':
      return '不使用药剂';
    case 'noShop':
      return '不购买补给';
  }
}

/** 只在整章打通时调用；第 1 条 `clear` 因此恒真 */
export function evaluateChapterStars(
  stars: readonly ChapterStarDef[],
  stats: RunStarStats,
): boolean[] {
  return stars.map((s) => {
    switch (s.cond.kind) {
      case 'clear':
        return true;
      case 'maxRounds':
        return stats.battleRounds <= s.cond.max;
      case 'maxDeaths':
        return stats.allyDeaths <= s.cond.max;
      case 'noPotion':
        return stats.potionsUsed <= 0;
      case 'noShop':
        return stats.shopBuys <= 0;
    }
  });
}

export function starBitMask(achieved: readonly boolean[]): number {
  let mask = 0;
  achieved.forEach((ok, i) => {
    if (ok) mask |= 1 << i;
  });
  return mask;
}

export function isStarBit(mask: number, index: number): boolean {
  return ((mask >> index) & 1) === 1;
}

export function countStarBits(mask: number): number {
  let n = 0;
  let m = mask;
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}

/** 已通关老档：整笔 metaReward 已经发过，三星都算领过，避免再补发 */
export const LEGACY_CLEARED_STAR_MASK = 0b111;
