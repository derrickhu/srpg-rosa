import type { SkillSpec } from '@/data/skillCatalog';

/** 所有攻击的基础暴击率（普攻与技能共用，偏低以免太跳） */
export const BASE_CRIT_CHANCE = 0.08;
/** 暴击伤害倍率 */
export const BASE_CRIT_MUL = 1.5;

export interface CritRollResult {
  damage: number;
  crit: boolean;
}

export function effectiveCritChance(spec?: Pick<SkillSpec, 'critBonus'>): number {
  return Math.min(1, BASE_CRIT_CHANCE + (spec?.critBonus?.chance ?? 0));
}

export function effectiveCritMul(spec?: Pick<SkillSpec, 'critBonus'>): number {
  const bonus = spec?.critBonus?.mul ?? 1;
  return BASE_CRIT_MUL * bonus;
}

export function rollCrit(spec: Pick<SkillSpec, 'critBonus'> | undefined, rng: () => number): boolean {
  return rng() < effectiveCritChance(spec);
}

/**
 * 在已算好的伤害上乘暴击。顺序：基础 → 处决 → **暴击** → 减伤。
 * `spec` 缺省时只走基础暴击率（普攻路径）。
 */
export function applyCritToDamage(
  damage: number,
  spec: Pick<SkillSpec, 'critBonus'> | undefined,
  rng: () => number,
): CritRollResult {
  if (damage <= 0) return { damage, crit: false };
  if (!rollCrit(spec, rng)) return { damage, crit: false };
  return {
    damage: Math.max(1, Math.floor(damage * effectiveCritMul(spec))),
    crit: true,
  };
}
