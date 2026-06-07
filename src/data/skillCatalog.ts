import type { SkillDef, SkillKind, UnitKind } from '@/battle/types';

/** 技能触发时机 */
export type SkillTiming = 'beforeMove' | 'afterMove' | 'passive';

/**
 * 技能施放时的作用范围/形状（与普攻射程 `UnitDef.range` 无关）。
 * 具体数值由各技能在 `SPECS` 中配置。
 */
export type SkillShape =
  /** 曼哈顿距离 = d 的环上所有敌人（含多目标） */
  | { type: 'neighborAoE'; manhattan: number }
  /** 同上环内选一个敌人（默认最低血量） */
  | { type: 'neighborPickLowest'; manhattan: number }
  /** 四向射线穿透，取「线上敌人总血量」最大的一条（弓系） */
  | { type: 'lineBestRayAllFoes' }
  /** 曼哈顿距离 = d 的环上选一个敌人（用于 debuff 等选目标） */
  | { type: 'neighborPickFoe'; manhattan: number; pick: 'lowestHp' | 'highestHp' }
  /** 曼哈顿距离 = d 的环上选一个友方（不含自身），用于 buff */
  | { type: 'neighborPickAlly'; manhattan: number; pick: 'lowestHp' | 'highestHp' };

/**
 * 技能成功施放时对自身施加的限时效果（与是否造成伤害独立；无合法目标未施放时不触发）。
 * 回合数以战局 `round` 计，在每轮开始递减，见 `tickTimedBattleEffects`。
 */
export type SkillCastSelfEffect =
  | { kind: 'taunt'; rounds: number }
  | { kind: 'atkBonus'; addAtk: number; rounds: number };

/** 对选中敌方单位施加的限时 debuff（成功施放且命中目标后） */
export type SkillCastFoeEffect =
  | { kind: 'atkDown'; subAtk: number; rounds: number }
  | { kind: 'spdDown'; subSpd: number; rounds: number };

/** 对选中友方单位施加的限时 buff（成功施放且命中目标后） */
export type SkillCastAllyEffect =
  | { kind: 'atkBonus'; addAtk: number; rounds: number }
  | { kind: 'spdBonus'; addSpd: number; rounds: number };

/**
 * 技能对「单个目标」的伤害规则（由 `computeSkillHitDamage` 解析）。
 * - 扩展：使用 `{ kind: 'custom', id, params }` 并在运行时 `registerSkillDamageCalculator(id, fn)` 注册。
 */
export type SkillDamageSpec =
  | { kind: 'scaledAtk'; atkMul: number }
  | {
      kind: 'flat';
      amount: number;
      /** 默认 true：乘三角克制 */
      applyCounter?: boolean;
      /** 默认 true：乘攻击方高地倍率 */
      applyTerrain?: boolean;
    }
  | {
      kind: 'percentTargetMaxHp';
      ratio: number;
      applyCounter?: boolean;
      applyTerrain?: boolean;
    }
  | { kind: 'none' }
  | { kind: 'custom'; id: string; params?: Record<string, number> };

/** 单条技能：独立范围、时机、数值与职业限制 */
export interface SkillSpec {
  id: string;
  name: string;
  cooldown: number;
  /**
   * 职业限制：`null` = 通用（任意职业可学/可携带）；非 null = 仅该职业专属
   */
  exclusiveProfession: UnitKind | null;
  timing: SkillTiming;
  /** 回放/UI 高亮色类 */
  displayKind: SkillKind;
  shape: SkillShape;
  /** 对单目标伤害规则；见 `battle/skillDamage` */
  damage: SkillDamageSpec;
  /** 仅 passive：本回合若已沿路径移动，则普攻伤害再乘此倍率 */
  passiveBasicAttackMulIfMoved?: number;
  /** 商店技能报价，默认 7 */
  shopPrice?: number;
  /** 成功施放后对自身生效的限时 buff（含嘲讽）；缺省无 */
  onCastSelfEffects?: SkillCastSelfEffect[];
  /** 对技能选中的敌方单位施加的 debuff；需配合可选敌形状（如 `neighborPickFoe`） */
  onCastFoeEffects?: SkillCastFoeEffect[];
  /** 对技能选中的友方单位施加的 buff；需配合 `neighborPickAlly` */
  onCastAllyEffects?: SkillCastAllyEffect[];
}

const SPECS: Record<string, SkillSpec> = {
  whirl: {
    id: 'whirl',
    name: '旋风斩',
    cooldown: 3,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.45 },
  },
  pierce: {
    id: 'pierce',
    name: '穿透箭',
    cooldown: 3,
    exclusiveProfession: 'bow',
    timing: 'afterMove',
    displayKind: 'lineShot',
    shape: { type: 'lineBestRayAllFoes' },
    damage: { kind: 'scaledAtk', atkMul: 0.55 },
  },
  charge: {
    id: 'charge',
    name: '冲锋',
    cooldown: 0,
    exclusiveProfession: 'cavalry',
    timing: 'passive',
    displayKind: 'passiveCharge',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'none' },
    passiveBasicAttackMulIfMoved: 1.35,
  },
  bash: {
    id: 'bash',
    name: '震击',
    cooldown: 3,
    exclusiveProfession: 'shield',
    timing: 'beforeMove',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickLowest', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.85 },
    onCastSelfEffects: [{ kind: 'taunt', rounds: 2 }],
  },
  cleave: {
    id: 'cleave',
    name: '重劈',
    cooldown: 2,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickLowest', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.88 },
    shopPrice: 7,
  },
  snap: {
    id: 'snap',
    name: '速射',
    cooldown: 2,
    exclusiveProfession: 'bow',
    timing: 'afterMove',
    displayKind: 'lineShot',
    shape: { type: 'lineBestRayAllFoes' },
    damage: { kind: 'scaledAtk', atkMul: 0.52 },
    shopPrice: 7,
  },
  hammer: {
    id: 'hammer',
    name: '铁锤',
    cooldown: 3,
    exclusiveProfession: 'shield',
    timing: 'beforeMove',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickLowest', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.9 },
    shopPrice: 7,
    onCastSelfEffects: [{ kind: 'taunt', rounds: 2 }],
  },
  /** 通用技能：任意职业可买可带 */
  war_shout: {
    id: 'war_shout',
    name: '战吼',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.32 },
    shopPrice: 8,
  },
  /** 弓系：环上选一敌，纯 debuff（可与伤害技能并存于构筑） */
  hex_mark: {
    id: 'hex_mark',
    name: '破甲咒',
    cooldown: 3,
    exclusiveProfession: 'bow',
    timing: 'beforeMove',
    displayKind: 'lineShot',
    shape: { type: 'neighborPickFoe', manhattan: 2, pick: 'lowestHp' },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 5, rounds: 3 }],
  },
  /** 通用：邻格选一友（不含自身），纯 buff */
  field_bless: {
    id: 'field_bless',
    name: '战场祝福',
    cooldown: 4,
    exclusiveProfession: null,
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 1, pick: 'lowestHp' },
    damage: { kind: 'none' },
    shopPrice: 8,
    onCastAllyEffects: [
      { kind: 'atkBonus', addAtk: 4, rounds: 2 },
      { kind: 'spdBonus', addSpd: 1, rounds: 2 },
    ],
  },
};

const DEFAULT_SKILL_ID_BY_KIND: Record<UnitKind, string> = {
  sword: 'whirl',
  bow: 'pierce',
  cavalry: 'charge',
  shield: 'bash',
};

export function getSkillSpec(id: string): SkillSpec | undefined {
  return SPECS[id];
}

/** 各职业开局默认携带的技能 id */
export function defaultSkillId(kind: UnitKind): string {
  return DEFAULT_SKILL_ID_BY_KIND[kind];
}

export function skillDefForId(id: string): SkillDef | undefined {
  const s = SPECS[id];
  if (!s) return undefined;
  return { id: s.id, name: s.name, cooldown: s.cooldown, kind: s.displayKind };
}

/** 某职业是否允许学习/携带该技能（通用技 exclusiveProfession === null 恒为 true） */
export function canProfessionEquipSkill(profession: UnitKind, skillId: string): boolean {
  const s = SPECS[skillId];
  if (!s) return false;
  if (s.exclusiveProfession === null) return true;
  return s.exclusiveProfession === profession;
}
