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
  /**
   * 曼哈顿距离 <= r 的**整片**区域内所有敌人。
   *
   * 和 `neighborAoE` 的区别是环 vs 圆：把 `neighborAoE` 的 manhattan 从 1 调到 2，
   * 打到的是「正好 2 格外」的一圈，贴脸的敌人反而漏掉了——那是位移不是扩大。
   * 词条「横扫」要的是真的覆盖更多格，所以单开这个形状。
   */
  | { type: 'discAoE'; radius: number }
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
  | { kind: 'spdDown'; subSpd: number; rounds: number }
  /** 中毒：每轮开始扣血，无视克制与地形，见 `tickTimedBattleEffects` */
  | { kind: 'poison'; dmgPerRound: number; rounds: number };

/** 对选中友方单位施加的限时 buff（成功施放且命中目标后） */
export type SkillCastAllyEffect =
  | { kind: 'atkBonus'; addAtk: number; rounds: number }
  | { kind: 'spdBonus'; addSpd: number; rounds: number }
  /** 即时回血（不是限时效果，命中当场结算，见 `pushAllyHeal`） */
  | { kind: 'heal'; amount: number };

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
  /** 吸血：本次技能造成的总伤害 × 该比例回复施法者（不超过上限血量）；缺省 0 */
  lifestealRatio?: number;
  /** 已挂载的词条 id（由 `effectiveSkillSpec` 填充，仅供 UI 展示，不参与结算） */
  mods?: string[];
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
  /** 剑士进阶：单体高倍率 + 削攻，打最高血目标（与 cleave 收割型区分） */
  blade_rush: {
    id: 'blade_rush',
    name: '破阵斩',
    cooldown: 3,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickFoe', manhattan: 1, pick: 'highestHp' },
    damage: { kind: 'scaledAtk', atkMul: 1.15 },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 4, rounds: 2 }],
  },
  /** 骑兵主动：2 格外单体突刺，弥补骑兵只有被动的问题 */
  lance_thrust: {
    id: 'lance_thrust',
    name: '长驱突刺',
    cooldown: 2,
    exclusiveProfession: 'cavalry',
    timing: 'beforeMove',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickFoe', manhattan: 2, pick: 'lowestHp' },
    damage: { kind: 'scaledAtk', atkMul: 0.9 },
    shopPrice: 7,
  },
  /** 骑兵主动：邻格 AoE + 减速，反集群 */
  trample: {
    id: 'trample',
    name: '铁蹄践踏',
    cooldown: 3,
    exclusiveProfession: 'cavalry',
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.5 },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'spdDown', subSpd: 2, rounds: 2 }],
  },
  /** 盾卫进阶：邻格 AoE 削攻 + 自身嘲讽，纯坦装 */
  shield_wall: {
    id: 'shield_wall',
    name: '盾墙震慑',
    cooldown: 3,
    exclusiveProfession: 'shield',
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.4 },
    shopPrice: 8,
    onCastSelfEffects: [{ kind: 'taunt', rounds: 2 }],
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 4, rounds: 2 }],
  },
  /**
   * Boss 专属（血牙酋长）：邻格 AoE + 自身攻击提升。
   * exclusiveProfession 为 null 仅为通过施放校验；不进任何商店池/可学列表，玩家拿不到。
   */
  savage_roar: {
    id: 'savage_roar',
    name: '狂暴战吼',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.6 },
    onCastSelfEffects: [{ kind: 'atkBonus', addAtk: 6, rounds: 2 }],
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
  /**
   * ── 草原战线专属临时技能（`temp_gl_*`）────────────────────────────
   *
   * 只在第一章商店出现，装进**临时槽**，任何职业都能带（`exclusiveProfession: null`）。
   * 设计口径有三条，偏离哪一条都会出问题：
   *
   * 1. **主打功能而不是伤害。** 临时技能和主技能共用每回合一次的施放额度，
   *    如果它也是「打一发伤害」，那玩家每回合就是在两个伤害技能里挑大的，
   *    临时槽退化成一次静默的数值升级。做成控制/治疗/群体减益，
   *    它才有「主技能进冷却时我还能干点别的」这个存在理由。
   * 2. **不吃伤害类词条。** 由 `canApply` 自动实现——「锋锐」要求技能有伤害，
   *    这几个大多 `damage: none`，挂不上去。所以后期攒满词条也不会
   *    把临时技能变成主力，主技能始终是投入的去处。
   * 3. **名字和效果要认得出是草原。** 场景专属技能的意义就在这——
   *    玩家换章节时应该从技能名上就感觉到「这里不一样」。
   */
  temp_gl_snare: {
    id: 'temp_gl_snare',
    name: '野草缠足',
    cooldown: 2,
    exclusiveProfession: null,
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    // 邻格而不是 2 格环：`neighborPickFoe` 的距离是**正好等于**，取 2 的话
    // 贴到脸上的敌人反而缠不住，而那恰恰是最需要缠住的那个。
    // 已有的 lance_thrust / hex_mark 是 2 格环，那两个是「够得着远处」的定位，不一样。
    shape: { type: 'neighborPickFoe', manhattan: 1, pick: 'highestHp' },
    damage: { kind: 'none' },
    shopPrice: 6,
    onCastFoeEffects: [{ kind: 'spdDown', subSpd: 4, rounds: 2 }],
  },
  temp_gl_salve: {
    id: 'temp_gl_salve',
    name: '草药敷治',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 1, pick: 'lowestHp' },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastAllyEffects: [{ kind: 'heal', amount: 14 }],
  },
  temp_gl_swarm: {
    id: 'temp_gl_swarm',
    name: '惊扰蜂群',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'discAoE', radius: 1 },
    damage: { kind: 'flat', amount: 3, applyCounter: false, applyTerrain: false },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'poison', dmgPerRound: 3, rounds: 2 }],
  },
  temp_gl_horn: {
    id: 'temp_gl_horn',
    name: '牧野号角',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastSelfEffects: [{ kind: 'taunt', rounds: 2 }, { kind: 'atkBonus', addAtk: 5, rounds: 2 }],
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

/**
 * 玩家有可能带上场的全部技能。
 *
 * Boss 专属的 `savage_roar` 排除在外：它不进商店池也不在可学列表里，
 * 玩家永远看不到它的图标或说明，给它配这些是白做的。
 */
export function allPlayerSkillSpecs(): SkillSpec[] {
  return Object.values(SPECS).filter((s) => s.id !== 'savage_roar');
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
