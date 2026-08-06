import type { SkillSpec } from './skillCatalog';

/**
 * 技能词条：局内三选一拿到的强化，直接改写「已经带着的技能」。
 *
 * 为什么不是独立的加成表，而是**改写技能规格**：所有技能结算（伤害、范围、冷却、
 * 附带效果）都只读一个 `SkillSpec`，所以只要在施放前把词条折进规格里，
 * 结算代码一行都不用改，也不会出现「某个技能忘了应用词条」这种只在特定职业上
 * 复现的漏洞。同一个套路见 `battle/effectiveUnit.ts`。
 *
 * 词条存档时按**角色**挂载（`run.skillMods[rosterId]`），施放前才折进那一刻带着的技能：
 * 攒了一路的加成不会因为中途换招或临时技能而清零。展示时反过来说人话——
 * 部署面板把词条列在技能旁边，玩家读到的仍然是「旋风斩附带中毒」。
 */
export type SkillModRarity = 'common' | 'rare' | 'epic';

export interface SkillModDef {
  id: string;
  name: string;
  rarity: SkillModRarity;
  /** 卡片图标资源 key，见 `core/assetBundles` */
  icon: string;
  /** 挂在这条技能上有没有意义（没伤害的技能挂「伤害+25%」等于白给一张牌） */
  canApply(spec: SkillSpec): boolean;
  /** 第 `stacks` 层时的描述，用于卡片正文与技能说明 */
  describe(stacks: number): string;
  /** 把 `stacks` 层的效果折进技能规格 */
  apply(spec: SkillSpec, stacks: number): SkillSpec;
  maxStacks: number;
}

/** 这条技能会造成伤害吗 */
function isDamaging(spec: SkillSpec): boolean {
  return spec.damage.kind !== 'none';
}

/** 环形/圆形 AoE（「横扫」类词条只对这两种有意义） */
function isAoE(spec: SkillSpec): boolean {
  return spec.shape.type === 'neighborAoE' || spec.shape.type === 'discAoE';
}

/** 按倍率放大技能伤害；`flat` / `percentTargetMaxHp` 也一并支持 */
function scaleDamage(spec: SkillSpec, mul: number): SkillSpec {
  const d = spec.damage;
  switch (d.kind) {
    case 'scaledAtk':
      return { ...spec, damage: { ...d, atkMul: d.atkMul * mul } };
    case 'flat':
      return { ...spec, damage: { ...d, amount: Math.round(d.amount * mul) } };
    case 'percentTargetMaxHp':
      return { ...spec, damage: { ...d, ratio: d.ratio * mul } };
    default:
      return spec;
  }
}

/** 把环形 AoE 摊成覆盖到 `radius` 的整片区域 */
function widenAoE(spec: SkillSpec, plus: number): SkillSpec {
  const s = spec.shape;
  if (s.type === 'neighborAoE') {
    return { ...spec, shape: { type: 'discAoE', radius: s.manhattan + plus } };
  }
  if (s.type === 'discAoE') {
    return { ...spec, shape: { type: 'discAoE', radius: s.radius + plus } };
  }
  return spec;
}

const DEFS: SkillModDef[] = [
  {
    id: 'sharpen',
    name: '锋锐',
    rarity: 'common',
    icon: 'mod_sharpen',
    maxStacks: 3,
    canApply: isDamaging,
    describe: (n) => `技能伤害提升 ${25 * n}%`,
    apply: (spec, n) => scaleDamage(spec, 1 + 0.25 * n),
  },
  {
    id: 'quick_cast',
    name: '迅捷',
    rarity: 'common',
    icon: 'mod_quick',
    maxStacks: 2,
    // 冷却 1 的技能已经几乎每回合能放，再减没有可感知的变化。
    canApply: (spec) => spec.cooldown >= 2,
    describe: (n) => `技能冷却缩短 ${n} 回合`,
    apply: (spec, n) => ({ ...spec, cooldown: Math.max(1, spec.cooldown - n) }),
  },
  {
    id: 'rout',
    name: '挫锐',
    rarity: 'common',
    icon: 'mod_rout',
    maxStacks: 2,
    canApply: isDamaging,
    describe: (n) => `命中后目标攻击 -${4 * n}，持续 2 回合`,
    apply: (spec, n) => ({
      ...spec,
      onCastFoeEffects: [
        ...(spec.onCastFoeEffects ?? []),
        { kind: 'atkDown', subAtk: 4 * n, rounds: 2 },
      ],
    }),
  },
  {
    id: 'hobble',
    name: '迟滞',
    rarity: 'common',
    icon: 'mod_hobble',
    maxStacks: 2,
    canApply: isDamaging,
    describe: (n) => `命中后目标速度 -${2 * n}，持续 2 回合`,
    apply: (spec, n) => ({
      ...spec,
      onCastFoeEffects: [
        ...(spec.onCastFoeEffects ?? []),
        { kind: 'spdDown', subSpd: 2 * n, rounds: 2 },
      ],
    }),
  },
  {
    id: 'venom',
    name: '淬毒',
    rarity: 'rare',
    icon: 'mod_venom',
    maxStacks: 3,
    canApply: isDamaging,
    describe: (n) => `命中后中毒，每回合 -${3 * n} 血，持续 2 回合`,
    apply: (spec, n) => ({
      ...spec,
      onCastFoeEffects: [
        ...(spec.onCastFoeEffects ?? []),
        { kind: 'poison', dmgPerRound: 3 * n, rounds: 2 },
      ],
    }),
  },
  {
    id: 'siphon',
    name: '汲取',
    rarity: 'rare',
    icon: 'mod_siphon',
    maxStacks: 2,
    canApply: isDamaging,
    describe: (n) => `技能伤害的 ${30 * n}% 回复自身`,
    apply: (spec, n) => ({ ...spec, lifestealRatio: (spec.lifestealRatio ?? 0) + 0.3 * n }),
  },
  {
    id: 'battle_fury',
    name: '战意',
    rarity: 'rare',
    icon: 'mod_fury',
    maxStacks: 2,
    canApply: () => true,
    describe: (n) => `施放后自身攻击 +${5 * n}，持续 2 回合`,
    apply: (spec, n) => ({
      ...spec,
      onCastSelfEffects: [
        ...(spec.onCastSelfEffects ?? []),
        { kind: 'atkBonus', addAtk: 5 * n, rounds: 2 },
      ],
    }),
  },
  {
    id: 'wide_swing',
    name: '横扫',
    rarity: 'rare',
    icon: 'mod_wide',
    maxStacks: 1,
    canApply: isAoE,
    describe: () => '作用范围扩大到周围 2 格',
    apply: (spec) => widenAoE(spec, 1),
  },
  {
    id: 'overwhelm',
    name: '势不可挡',
    rarity: 'epic',
    icon: 'mod_overwhelm',
    maxStacks: 1,
    canApply: (spec) => isAoE(spec) && isDamaging(spec),
    describe: () => '范围扩大到 2 格，且伤害提升 40%',
    apply: (spec) => scaleDamage(widenAoE(spec, 1), 1.4),
  },
];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

export function getSkillMod(id: string): SkillModDef | undefined {
  return BY_ID.get(id);
}

export function allSkillMods(): SkillModDef[] {
  return DEFS;
}

/**
 * 把词条折进技能规格。`modIds` 里同一个 id 出现几次就是几层。
 *
 * 层数是一次性算好再 `apply` 的，不是逐层套用：「伤害 +25%」叠三层要的是 +75%，
 * 逐层相乘会变成 +95%，越叠偏得越多。
 */
export function effectiveSkillSpec(spec: SkillSpec, modIds: readonly string[] | undefined): SkillSpec {
  if (!modIds?.length) return spec;

  const stacks = new Map<string, number>();
  for (const id of modIds) stacks.set(id, (stacks.get(id) ?? 0) + 1);

  // 必须先拷一份：没有任何词条能挂上时（比如给纯 debuff 技能塞了「伤害+」），
  // 下面的 `out.mods = ...` 会直接写进 SPECS 里那个共享对象，污染所有单位。
  let out: SkillSpec = { ...spec };
  const applied: string[] = [];
  // 按目录顺序应用，保证同一组词条产出的规格与拿到的先后无关。
  for (const def of DEFS) {
    const n = stacks.get(def.id);
    if (!n) continue;
    if (!def.canApply(spec)) continue;
    out = def.apply(out, Math.min(n, def.maxStacks));
    applied.push(def.id);
  }
  out.mods = applied;
  return out;
}

/** 这条技能上某词条已叠的层数 */
export function modStacks(modIds: readonly string[] | undefined, modId: string): number {
  if (!modIds) return 0;
  let n = 0;
  for (const id of modIds) if (id === modId) n += 1;
  return n;
}
