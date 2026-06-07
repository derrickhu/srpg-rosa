import type { UnitDef, UnitKind, Vec2 } from './types';
import { COUNTER_STRONG, COUNTER_WEAK } from './constants';
import { getTerrainAt, type TerrainGrid } from './grid';
import { getTerrainSpec } from '@/data/terrainSpec';

/** 骑 → 剑 → 弓 → 骑；盾卫不参与 */
export function counterMultiplier(attacker: UnitKind, target: UnitKind): number {
  if (attacker === 'shield' || target === 'shield') return 1;
  const strong = (
    (attacker === 'cavalry' && target === 'sword')
    || (attacker === 'sword' && target === 'bow')
    || (attacker === 'bow' && target === 'cavalry')
  );
  const weak = (
    (attacker === 'sword' && target === 'cavalry')
    || (attacker === 'bow' && target === 'sword')
    || (attacker === 'cavalry' && target === 'bow')
  );
  if (strong) return COUNTER_STRONG;
  if (weak) return COUNTER_WEAK;
  return 1;
}

export function terrainAttackMul(
  terrainGrid: TerrainGrid,
  attackerPos: Vec2,
): number {
  const tid = getTerrainAt(terrainGrid, attackerPos);
  return getTerrainSpec(tid).atkMul;
}

export function terrainDefenseMul(
  terrainGrid: TerrainGrid,
  targetPos: Vec2,
): number {
  const tid = getTerrainAt(terrainGrid, targetPos);
  return getTerrainSpec(tid).defMul;
}

export function terrainEvade(
  terrainGrid: TerrainGrid,
  targetPos: Vec2,
): number {
  const tid = getTerrainAt(terrainGrid, targetPos);
  return getTerrainSpec(tid).evade;
}

export function computeDamage(
  attackerDef: UnitDef,
  targetDef: UnitDef,
  terrainGrid: TerrainGrid,
  attackerPos: Vec2,
  targetPos?: Vec2,
): number {
  const cm = counterMultiplier(attackerDef.id, targetDef.id);
  const tm = terrainAttackMul(terrainGrid, attackerPos);
  const dm = targetPos ? terrainDefenseMul(terrainGrid, targetPos) : 1;
  const raw = attackerDef.atk * cm * tm * dm;
  return Math.max(1, Math.floor(raw));
}
