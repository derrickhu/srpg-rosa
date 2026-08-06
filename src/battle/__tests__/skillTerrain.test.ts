import { describe, it, expect } from 'vitest';
import { computeSkillHitDamage } from '../skillDamage';
import type { SkillDamageContext } from '../skillDamage';
import { getSkillSpec } from '@/data/skillCatalog';
import type { TerrainGrid } from '../grid';
import type { UnitArchetypeDef, UnitDef, UnitKind, UnitState, Vec2 } from '../types';

/**
 * 技能伤害必须和普攻走**同一套**地形规则。
 *
 * 这条曾经不成立：`computeDamage` 的 `targetPos` 是可选的，技能那条路径没传，
 * 于是技能无视目标地形。它没被发现是因为当时唯一带减伤的地形是城墙，而城墙不可通行，
 * 谁也站不上去——两条路径算出的结果永远相同。森林一旦带上减伤，这个洞立刻变成
 * 「普攻打不动林子里的敌人、技能照样打满」，而地形是否有用取决于对手用哪一招，没法教。
 */

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
  };
}

function unit(uid: string, kind: UnitKind, pos: Vec2, faction: 'player' | 'enemy'): UnitState {
  return { uid, defId: kind, faction, hp: 100, pos, skillCd: 0, movedInTurn: false };
}

function ctx(casterPos: Vec2, targetPos: Vec2, terrain: TerrainGrid): SkillDamageContext {
  // 施法者与目标都用盾卫：盾卫不参与三角克制，克制乘数恒为 1，测出来的差异只可能来自地形
  return {
    self: unit('a', 'shield', casterPos, 'player'),
    target: unit('b', 'shield', targetPos, 'enemy'),
    casterDef: def('shield', 40),
    targetDef: def('shield', 10),
    spec: getSkillSpec('bash')!,
    terrain,
    defs: {} as Record<UnitKind, UnitArchetypeDef>,
  };
}

const ATK_MUL = 0.85; // bash 的 scaledAtk 倍率

describe('技能伤害与地形', () => {
  const base = Math.floor(40 * ATK_MUL);

  it('目标站森林时技能也要吃减伤', () => {
    const grid: TerrainGrid = [['plain', 'forest']];
    const dmg = computeSkillHitDamage(ctx({ x: 0, y: 0 }, { x: 1, y: 0 }, grid));
    expect(dmg).toBe(Math.floor(base * 0.75));
  });

  it('施法者站高地时技能吃加成', () => {
    const grid: TerrainGrid = [['high', 'plain']];
    const dmg = computeSkillHitDamage(ctx({ x: 0, y: 0 }, { x: 1, y: 0 }, grid));
    expect(dmg).toBe(Math.floor(base * 1.25));
  });

  it('两头地形叠乘', () => {
    const grid: TerrainGrid = [['high', 'forest']];
    const dmg = computeSkillHitDamage(ctx({ x: 0, y: 0 }, { x: 1, y: 0 }, grid));
    expect(dmg).toBe(Math.floor(base * 1.25 * 0.75));
  });

  it('河流削弱施法者输出', () => {
    const grid: TerrainGrid = [['river', 'plain']];
    const dmg = computeSkillHitDamage(ctx({ x: 0, y: 0 }, { x: 1, y: 0 }, grid));
    expect(dmg).toBe(Math.floor(base * 0.8));
  });

  it('平原不改变任何东西', () => {
    const grid: TerrainGrid = [['plain', 'plain']];
    expect(computeSkillHitDamage(ctx({ x: 0, y: 0 }, { x: 1, y: 0 }, grid))).toBe(base);
  });
});
