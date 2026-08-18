import { describe, expect, it } from 'vitest';
import { computeDamage, guardNote } from '../damage';
import { effectiveUnitDef } from '../effectiveUnit';
import {
  applySkillCastAllyEffects,
  applySkillCastSelfEffects,
  tickTimedBattleEffects,
  timedGuardMul,
} from '../timedBattleEffects';
import { emptyTerrain } from '../grid';
import { computeSkillHitDamage } from '../skillDamage/computeSkillHitDamage';
import type { SkillDamageContext } from '../skillDamage/context';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { SkillSpec } from '@/data/skillCatalog';
import type { UnitState } from '../types';

function unit(uid: string, kind: 'sword' | 'shield' = 'sword'): UnitState {
  return {
    uid,
    defId: kind,
    faction: 'player',
    hp: UNIT_DEFS[kind].base.maxHp,
    pos: { x: 0, y: 0 },
    skillCd: 0,
    movedInTurn: false,
  };
}

/** 只用到 `onCast*Effects` 的假技能：这些测试跟形状/伤害无关 */
function guardSkill(reduceRatio: number, rounds: number, side: 'self' | 'ally'): SkillSpec {
  const eff = { kind: 'guard' as const, reduceRatio, rounds };
  return {
    id: 'test_guard',
    name: '测试减伤',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'selfCast' },
    damage: { kind: 'none' },
    ...(side === 'self' ? { onCastSelfEffects: [eff] } : { onCastAllyEffects: [eff] }),
  };
}

describe('减伤（guard）', () => {
  it('没有减伤时倍率是 1，伤害不变', () => {
    const u = unit('u1');
    expect(timedGuardMul(u)).toBe(1);
    expect(effectiveUnitDef(u, UNIT_DEFS).damageTakenMul).toBe(1);
  });

  it('施放后进入面板，并真的减少受到的伤害', () => {
    const target = unit('t1');
    applySkillCastSelfEffects(target, guardSkill(0.4, 2, 'self'));

    const def = effectiveUnitDef(target, UNIT_DEFS);
    expect(def.damageTakenMul).toBeCloseTo(0.6);

    const attacker = effectiveUnitDef(unit('a1'), UNIT_DEFS);
    const flat = emptyTerrain(5, 5);
    const plain = effectiveUnitDef(unit('t2'), UNIT_DEFS);
    const dmgPlain = computeDamage(attacker, plain, flat, { x: 0, y: 0 }, { x: 1, y: 0 });
    const dmgGuard = computeDamage(attacker, def, flat, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(dmgGuard).toBeLessThan(dmgPlain);
    expect(dmgGuard).toBe(Math.max(1, Math.floor(dmgPlain * 0.6)));
  });

  it('护人和护自己走同一套结算', () => {
    const ally = unit('a1');
    applySkillCastAllyEffects(ally, guardSkill(0.25, 2, 'ally'));
    expect(effectiveUnitDef(ally, UNIT_DEFS).damageTakenMul).toBeCloseTo(0.75);
  });

  /**
   * 这是这个动词最容易崩的一条。多层减伤连乘会渐近免伤，而且过程很隐蔽：
   * 每一条单看都是合理数值。
   */
  it('叠加不会越叠越厚，只保留最强的一条', () => {
    const u = unit('u1');
    applySkillCastSelfEffects(u, guardSkill(0.3, 2, 'self'));
    applySkillCastSelfEffects(u, guardSkill(0.3, 2, 'self'));
    applySkillCastSelfEffects(u, guardSkill(0.3, 2, 'self'));
    expect(u.timedBattleEffects?.filter((e) => e.kind === 'guard')).toHaveLength(1);
    expect(timedGuardMul(u)).toBeCloseTo(0.7);
  });

  it('小减伤盖不掉正在生效的大减伤', () => {
    const u = unit('u1');
    applySkillCastSelfEffects(u, guardSkill(0.5, 2, 'self'));
    applySkillCastSelfEffects(u, guardSkill(0.2, 3, 'self'));
    expect(timedGuardMul(u)).toBeCloseTo(0.5);
  });

  it('同强度但更长的一条可以续上', () => {
    const u = unit('u1');
    applySkillCastSelfEffects(u, guardSkill(0.3, 1, 'self'));
    applySkillCastSelfEffects(u, guardSkill(0.3, 4, 'self'));
    const g = u.timedBattleEffects?.find((e) => e.kind === 'guard');
    expect(g?.kind === 'guard' && g.roundsLeft).toBe(4);
  });

  it('按回合递减，到期后伤害恢复原样', () => {
    const u = unit('u1');
    applySkillCastSelfEffects(u, guardSkill(0.4, 2, 'self'));
    tickTimedBattleEffects([u]);
    expect(timedGuardMul(u)).toBeCloseTo(0.6);
    tickTimedBattleEffects([u]);
    expect(timedGuardMul(u)).toBe(1);
  });

  /** 留 10% 硬地板，免得将来某条词条把比例推到 1 变成无敌 */
  it('比例超过 90% 也仍然会受到伤害', () => {
    const u = unit('u1');
    applySkillCastSelfEffects(u, guardSkill(1, 2, 'self'));
    expect(timedGuardMul(u)).toBeCloseTo(0.1);
  });

  it('减伤有归因飘字，没减伤时不飘', () => {
    const plain = effectiveUnitDef(unit('t1'), UNIT_DEFS);
    expect(guardNote(plain)).toBeNull();

    const guarded = unit('t2');
    applySkillCastSelfEffects(guarded, guardSkill(0.25, 2, 'self'));
    expect(guardNote(effectiveUnitDef(guarded, UNIT_DEFS))).toBe('减伤 -25%');
  });

  /**
   * `flat` 和 `percentTargetMaxHp` 不走 `computeDamage`，是自己算克制和地形的。
   * 减伤要是只写在 `computeDamage` 里，这两种伤害就会悄悄打满——
   * 表现是「套了盾，敌人某一招照样疼」，玩家的结论是盾坏了。
   */
  it.each([
    ['scaledAtk', { kind: 'scaledAtk' as const, atkMul: 1 }],
    ['flat', { kind: 'flat' as const, amount: 40 }],
    ['flat 且不吃克制地形', { kind: 'flat' as const, amount: 40, applyCounter: false, applyTerrain: false }],
    ['percentTargetMaxHp', { kind: 'percentTargetMaxHp' as const, ratio: 0.3 }],
  ])('%s 伤害同样吃减伤', (_label, damage) => {
    const flat = emptyTerrain(5, 5);
    const caster = unit('c1');
    const casterDef = effectiveUnitDef(caster, UNIT_DEFS);

    const bare = unit('t1', 'shield');
    const shielded = unit('t2', 'shield');
    applySkillCastSelfEffects(shielded, guardSkill(0.5, 2, 'self'));

    const ctxFor = (target: UnitState): SkillDamageContext => ({
      self: caster,
      target,
      casterDef,
      targetDef: effectiveUnitDef(target, UNIT_DEFS),
      spec: { ...guardSkill(0.5, 2, 'self'), damage },
      terrain: flat,
      defs: UNIT_DEFS,
    });

    const before = computeSkillHitDamage(ctxFor(bare));
    const after = computeSkillHitDamage(ctxFor(shielded));
    expect(before).toBeGreaterThan(1);
    expect(after).toBe(Math.max(1, Math.floor(before * 0.5)));
  });

  /**
   * 减伤放在 `UnitDef` 而不是结算时读 `UnitState`，图的就是这条：AI 全程通过
   * 这个面板看人，所以它对「套了盾的目标更难杀」是自动知情的。
   */
  it('AI 的伤害预估会跟着减伤走', () => {
    const attacker = effectiveUnitDef(unit('a1'), UNIT_DEFS);
    const flat = emptyTerrain(5, 5);
    const tough = unit('t1', 'shield');
    applySkillCastSelfEffects(tough, guardSkill(0.5, 2, 'self'));

    const before = computeDamage(
      attacker, effectiveUnitDef(unit('t2', 'shield'), UNIT_DEFS), flat, { x: 0, y: 0 }, { x: 1, y: 0 },
    );
    const after = computeDamage(
      attacker, effectiveUnitDef(tough, UNIT_DEFS), flat, { x: 0, y: 0 }, { x: 1, y: 0 },
    );
    expect(after).toBeLessThan(before);
  });
});
