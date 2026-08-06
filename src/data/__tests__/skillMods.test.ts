import { describe, expect, it } from 'vitest';
import { getSkillSpec } from '@/data/skillCatalog';
import { effectiveSkillSpec, getSkillMod } from '@/data/skillModCatalog';

const whirl = () => getSkillSpec('whirl')!;
const hex = () => getSkillSpec('hex_mark')!;

function atkMul(spec: ReturnType<typeof whirl>): number {
  return spec.damage.kind === 'scaledAtk' ? spec.damage.atkMul : NaN;
}

describe('词条折进技能规格', () => {
  it('不带词条时原样返回', () => {
    const s = effectiveSkillSpec(whirl(), undefined);
    expect(atkMul(s)).toBe(atkMul(whirl()));
    expect(s.mods).toBeUndefined();
  });

  it('锋锐按层数线性叠加，不是逐层相乘', () => {
    const base = atkMul(whirl());
    const three = effectiveSkillSpec(whirl(), ['sharpen', 'sharpen', 'sharpen']);
    // +75%，而不是 1.25³ = +95%
    expect(atkMul(three)).toBeCloseTo(base * 1.75, 6);
  });

  it('超过上限的层数被截断', () => {
    const base = atkMul(whirl());
    const many = effectiveSkillSpec(whirl(), Array(9).fill('sharpen'));
    expect(atkMul(many)).toBeCloseTo(base * 1.75, 6);
  });

  it('横扫把「正好 1 格外的环」摊成「2 格以内全覆盖」', () => {
    // 直接把 manhattan 从 1 加到 2 会漏掉贴脸的敌人，那是位移不是扩大。
    expect(whirl().shape).toEqual({ type: 'neighborAoE', manhattan: 1 });
    const s = effectiveSkillSpec(whirl(), ['wide_swing']);
    expect(s.shape).toEqual({ type: 'discAoE', radius: 2 });
  });

  it('淬毒挂上中毒效果，且层数只体现在每回合伤害上', () => {
    const one = effectiveSkillSpec(whirl(), ['venom']);
    expect(one.onCastFoeEffects).toContainEqual({ kind: 'poison', dmgPerRound: 3, rounds: 2 });

    const two = effectiveSkillSpec(whirl(), ['venom', 'venom']);
    const poisons = (two.onCastFoeEffects ?? []).filter((e) => e.kind === 'poison');
    expect(poisons).toHaveLength(1);
    expect(poisons[0]).toEqual({ kind: 'poison', dmgPerRound: 6, rounds: 2 });
  });

  it('挂不上的词条被跳过，而不是产出一个坏规格', () => {
    // 破甲咒是纯 debuff，没有伤害，「伤害 +25%」对它无意义。
    expect(hex().damage.kind).toBe('none');
    const s = effectiveSkillSpec(hex(), ['sharpen']);
    expect(s.damage).toEqual(hex().damage);
    expect(s.mods).toEqual([]);
  });

  it('折算结果与拿到词条的先后无关', () => {
    const a = effectiveSkillSpec(whirl(), ['venom', 'sharpen', 'wide_swing']);
    const b = effectiveSkillSpec(whirl(), ['wide_swing', 'venom', 'sharpen']);
    expect(a.damage).toEqual(b.damage);
    expect(a.shape).toEqual(b.shape);
    expect(a.onCastFoeEffects).toEqual(b.onCastFoeEffects);
  });

  it('不污染技能表里的共享规格对象', () => {
    const before = JSON.stringify(whirl());
    effectiveSkillSpec(whirl(), ['sharpen', 'venom', 'overwhelm']);
    effectiveSkillSpec(hex(), ['sharpen']);
    expect(JSON.stringify(whirl())).toBe(before);
  });

  it('迅捷不会把冷却压到 0（0 冷却等于每回合白嫖）', () => {
    const s = effectiveSkillSpec(getSkillSpec('lance_thrust')!, ['quick_cast', 'quick_cast']);
    expect(s.cooldown).toBe(1);
  });
});

describe('词条适用性', () => {
  it('横扫只挂 AoE，不挂单体和直线', () => {
    const wide = getSkillMod('wide_swing')!;
    expect(wide.canApply(whirl())).toBe(true);
    expect(wide.canApply(getSkillSpec('cleave')!)).toBe(false);
    expect(wide.canApply(getSkillSpec('pierce')!)).toBe(false);
  });

  it('迅捷不挂本来就没冷却的被动', () => {
    const quick = getSkillMod('quick_cast')!;
    expect(quick.canApply(getSkillSpec('charge')!)).toBe(false);
  });

  it('汲取只挂有伤害的技能', () => {
    const siphon = getSkillMod('siphon')!;
    expect(siphon.canApply(whirl())).toBe(true);
    expect(siphon.canApply(getSkillSpec('field_bless')!)).toBe(false);
  });
});
