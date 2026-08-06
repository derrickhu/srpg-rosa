/**
 * 药剂：局内商店购入 → 进入本局背包 → **战斗回放中手动点击使用**（全场生效）。
 * 效果通过战斗指令注入（见 `battle/engine` 的 `usePotion`）。
 */

export type PotionEffect =
  /** 全体友军回复最大生命的一定比例 */
  | { kind: 'healAllies'; ratio: number }
  /** 全体友军攻击按当前攻击一定比例提升，持续 N 回合 */
  | { kind: 'atkBuffAllies'; atkRatio: number; rounds: number }
  /** 全体敌军速度降低，持续 N 回合 */
  | { kind: 'slowFoes'; subSpd: number; rounds: number };

export interface PotionDef {
  id: string;
  name: string;
  desc: string;
  effect: PotionEffect;
}

export const POTION_DEFS: Record<string, PotionDef> = {
  heal: {
    id: 'heal',
    name: '治疗药剂',
    desc: '全体友军回复 35% 最大生命',
    effect: { kind: 'healAllies', ratio: 0.35 },
  },
  draught: {
    id: 'draught',
    name: '蛮力药剂',
    desc: '全体友军攻击 +30%，持续 2 回合',
    effect: { kind: 'atkBuffAllies', atkRatio: 0.3, rounds: 2 },
  },
  slow: {
    id: 'slow',
    name: '迟缓药剂',
    desc: '全体敌军速度 -2，持续 2 回合',
    effect: { kind: 'slowFoes', subSpd: 2, rounds: 2 },
  },
};
