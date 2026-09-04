import { describe, expect, it } from 'vitest';
import {
  applyCritToDamage,
  BASE_CRIT_CHANCE,
  BASE_CRIT_MUL,
  effectiveCritChance,
  rollCrit,
} from '../crit';
import { computeSkillHitDamage } from '../skillDamage';
import type { SkillDamageContext } from '../skillDamage';
import { getSkillSpec } from '@/data/skillCatalog';
import type { TerrainGrid } from '../grid';
import type { UnitArchetypeDef, UnitDef, UnitKind, UnitState, Vec2 } from '../types';
import { castSkillManual, setHitRng } from '../skills';

function def(id: UnitKind, atk: number): UnitDef {
  return {
    id,
    name: id,
    maxHp: 100,
    atk,
    spd: 5,
    move: 3,
    range: 1,
    isRanged: false,
    taunt: false,
    damageTakenMul: 1,
  };
}

function unit(uid: string, kind: UnitKind, pos: Vec2): UnitState {
  return {
    uid,
    defId: kind,
    faction: 'player',
    hp: 100,
    pos,
    skillCd: 0,
    movedInTurn: false,
    battleSkill: { id: 'whirl', name: '旋风斩', cooldown: 3, kind: 'whirlwind' },
  };
}

const FLAT: TerrainGrid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'plain' as const));

describe('暴击结算', () => {
  it('基础暴击率偏低', () => {
    expect(BASE_CRIT_CHANCE).toBeLessThanOrEqual(0.1);
    expect(BASE_CRIT_MUL).toBe(1.5);
  });

  it('词条叠加暴击率', () => {
    expect(effectiveCritChance({ critBonus: { chance: 0.1, mul: 1 } }))
      .toBeCloseTo(BASE_CRIT_CHANCE + 0.1);
  });

  it('掷点低于阈值时伤害 × 倍率', () => {
    const base = 40;
    const out = applyCritToDamage(base, undefined, () => 0);
    expect(out.crit).toBe(true);
    expect(out.damage).toBe(Math.floor(base * BASE_CRIT_MUL));
  });

  it('掷点高于阈值时不暴击', () => {
    const out = applyCritToDamage(40, undefined, () => 0.99);
    expect(out.crit).toBe(false);
    expect(out.damage).toBe(40);
  });

  it('技能伤害路径会写入 crit 标记', () => {
    const ctx: SkillDamageContext = {
      self: unit('a', 'shield', { x: 0, y: 0 }),
      target: unit('b', 'shield', { x: 1, y: 0 }),
      casterDef: def('shield', 40),
      targetDef: def('shield', 10),
      spec: { ...getSkillSpec('bash')!, critBonus: { chance: 0.5, mul: 1 } },
      terrain: FLAT,
      defs: {} as Record<UnitKind, UnitArchetypeDef>,
      rng: () => 0,
    };
    const hit = computeSkillHitDamage(ctx);
    expect(hit.crit).toBe(true);
    expect(hit.damage).toBeGreaterThan(Math.floor(40 * 0.85));
  });
});

describe('会心词条', () => {
  it('会心触发时给回放层 crit 标记', () => {
    setHitRng(() => 0);
    const self: UnitState = {
      uid: 'hero',
      defId: 'sword',
      faction: 'player',
      hp: 100,
      pos: { x: 3, y: 3 },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: { id: 'whirl', name: '旋风斩', cooldown: 3, kind: 'whirlwind' },
      skillMods: ['crit_strike'],
    };
    const foe: UnitState = {
      uid: 'e1',
      defId: 'shield',
      faction: 'enemy',
      hp: 100,
      pos: { x: 3, y: 2 },
      skillCd: 0,
      movedInTurn: false,
    };
    const DEFS = {
      sword: {
        id: 'sword' as const,
        name: '剑士',
        base: { maxHp: 100, atk: 40, spd: 5, move: 3 },
        strike: { range: 1, isRanged: false, taunt: false },
      },
      bow: {
        id: 'bow' as const,
        name: '弓手',
        base: { maxHp: 80, atk: 36, spd: 6, move: 3 },
        strike: { range: 3, isRanged: true, taunt: false },
      },
      cavalry: {
        id: 'cavalry' as const,
        name: '骑兵',
        base: { maxHp: 110, atk: 42, spd: 7, move: 4 },
        strike: { range: 1, isRanged: false, taunt: false },
      },
      shield: {
        id: 'shield' as const,
        name: '盾卫',
        base: { maxHp: 140, atk: 26, spd: 3, move: 2 },
        strike: { range: 1, isRanged: false, taunt: true },
      },
      mage: {
        id: 'mage' as const,
        name: '法师',
        base: { maxHp: 52, atk: 40, spd: 6, move: 2 },
        strike: { range: 3, isRanged: true, taunt: false },
      },
      healer: {
        id: 'healer' as const,
        name: '祭司',
        base: { maxHp: 80, atk: 20, spd: 4, move: 2 },
        strike: { range: 2, isRanged: true, taunt: false },
      },
    } satisfies Record<UnitKind, UnitArchetypeDef>;

    const events = castSkillManual(self, DEFS, [self, foe], FLAT, 'e1');
    const cast = events.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.hits[0]?.crit).toBe(true);
  });
});
