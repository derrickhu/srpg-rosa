import { beforeEach, describe, expect, it } from 'vitest';
import { castSkillManual, setHitRng } from '../skills';
import { computeDamage } from '../damage';
import { applyBasicDealtMul } from '../damage';
import { effectiveUnitDef } from '../effectiveUnit';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { TerrainGrid } from '../grid';
import type { BattleEvent, SkillHit, UnitState, Vec2 } from '../types';

const FLAT: TerrainGrid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'plain' as const));

function dummy(uid: string, pos: Vec2, hp = 80): UnitState {
  return {
    uid,
    defId: 'shield',
    faction: 'enemy',
    hp,
    pos,
    skillCd: 0,
    movedInTurn: false,
  };
}

function rawHits(events: BattleEvent[]): SkillHit[] {
  const cast = events.find((e) => e.type === 'skillCast');
  return cast?.type === 'skillCast' ? cast.hits : [];
}

describe('跟人纹章进战斗', () => {
  beforeEach(() => {
    setHitRng(() => 1);
  });

  it('技能伤害倍率提高旋风斩', () => {
    const plain: UnitState = {
      uid: 'hero',
      defId: 'sword',
      faction: 'player',
      hp: 100,
      pos: { x: 2, y: 2 },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: { id: 'whirl', name: '旋风斩', cooldown: 3, kind: 'whirlwind' },
    };
    const buffed = { ...plain, personalSkillDealtMul: 1.5 };
    const a = castSkillManual(plain, UNIT_DEFS, [plain, dummy('e1', { x: 2, y: 1 })], FLAT);
    const b = castSkillManual(buffed, UNIT_DEFS, [buffed, dummy('e1', { x: 2, y: 1 })], FLAT);
    expect(rawHits(b)[0]!.damage).toBeGreaterThan(rawHits(a)[0]!.damage);
  });

  it('受伤倍率折进面板，普攻少打', () => {
    const atk: UnitState = {
      uid: 'bow',
      defId: 'bow',
      faction: 'player',
      hp: 60,
      pos: { x: 0, y: 0 },
      skillCd: 0,
      movedInTurn: false,
    };
    const tank: UnitState = {
      uid: 'tank',
      defId: 'shield',
      faction: 'enemy',
      hp: 140,
      pos: { x: 1, y: 0 },
      skillCd: 0,
      movedInTurn: false,
      personalTakenMul: 0.9,
    };
    const atkDef = effectiveUnitDef(atk, UNIT_DEFS);
    const plain = effectiveUnitDef({ ...tank, personalTakenMul: 1 }, UNIT_DEFS);
    const guarded = effectiveUnitDef(tank, UNIT_DEFS);
    expect(guarded.damageTakenMul).toBeCloseTo(0.9, 6);
    const dmgPlain = computeDamage(atkDef, plain, FLAT, atk.pos, tank.pos);
    const dmgGuard = computeDamage(atkDef, guarded, FLAT, atk.pos, tank.pos);
    expect(dmgGuard).toBeLessThan(dmgPlain);
  });

  it('普攻倍率不进技能公式', () => {
    const base: UnitState = {
      uid: 'hero',
      defId: 'sword',
      faction: 'player',
      hp: 100,
      pos: { x: 2, y: 2 },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: { id: 'whirl', name: '旋风斩', cooldown: 3, kind: 'whirlwind' },
      personalBasicDealtMul: 1.5,
    };
    const noBasic = { ...base, personalBasicDealtMul: 1 };
    const skillA = rawHits(castSkillManual(noBasic, UNIT_DEFS, [noBasic, dummy('e1', { x: 2, y: 1 })], FLAT));
    const skillB = rawHits(castSkillManual(base, UNIT_DEFS, [base, dummy('e1', { x: 2, y: 1 })], FLAT));
    expect(skillB[0]!.damage).toBe(skillA[0]!.damage);

    const atk = effectiveUnitDef(base, UNIT_DEFS);
    const tgt = effectiveUnitDef(dummy('e1', { x: 3, y: 2 }), UNIT_DEFS);
    const raw = computeDamage(atk, tgt, FLAT, base.pos, { x: 3, y: 2 });
    expect(applyBasicDealtMul(raw, atk)).toBeGreaterThan(raw);
  });

  it('治疗倍率提高祭司的技能治疗', () => {
    const healer: UnitState = {
      uid: 'mir',
      defId: 'healer',
      faction: 'player',
      hp: 74,
      pos: { x: 2, y: 2 },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: { id: 'heal_touch', name: '圣疗', cooldown: 2, kind: 'whirlwind' },
      personalHealGivenMul: 1.2,
    };
    const ally: UnitState = {
      uid: 'ray',
      defId: 'sword',
      faction: 'player',
      hp: 20,
      pos: { x: 2, y: 3 },
      skillCd: 0,
      movedInTurn: false,
    };
    const events = castSkillManual(healer, UNIT_DEFS, [healer, ally], FLAT, 'ray');
    const heal = events.find((e) => e.type === 'heal');
    expect(heal?.type).toBe('heal');
    if (heal?.type === 'heal') {
      expect(heal.amount).toBe(Math.floor(28 * 1.2));
    }
  });
});
