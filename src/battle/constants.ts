/** 三角克制：攻击方 kind -> 被优先进攻的 kind（若目标为该 kind 则伤害 x） */
export const COUNTER_STRONG = 1.25;
export const COUNTER_WEAK = 0.85;

/** 回合上限：控制单场时长（超时判负），也防止死循环 */
export const MAX_BATTLE_ROUNDS = 30;

/** 玩家部署在战场最下两行（行号从 0 起，随关卡 `terrain` 高度变化） */
export function playerDeployRowRange(gridHeight: number): readonly [number, number] {
  const h = Math.max(2, gridHeight);
  return [h - 2, h - 1] as const;
}
