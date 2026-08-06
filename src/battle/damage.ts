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

/**
 * 攻击方所站地形对本次伤害的影响，供回放飘字用；无影响返回 null。
 *
 * 文案从 spec 现算而不是写死：改了 `atkMul` 忘了改文案，玩家看到的数字和飘字就会对不上，
 * 而这类不一致比没有飘字更伤——它教会玩家不要相信 UI。
 */
export function terrainAttackNote(terrainGrid: TerrainGrid, attackerPos: Vec2): string | null {
  const spec = getTerrainSpec(getTerrainAt(terrainGrid, attackerPos));
  if (spec.atkMul === 1) return null;
  return `${spec.name} ${formatPct(spec.atkMul)}`;
}

/** 目标所站地形对本次伤害的影响，供回放飘字用；无影响返回 null */
export function terrainDefenseNote(terrainGrid: TerrainGrid, targetPos: Vec2): string | null {
  const spec = getTerrainSpec(getTerrainAt(terrainGrid, targetPos));
  if (spec.defMul === 1) return null;
  return `${spec.name} ${formatPct(spec.defMul)}`;
}

function formatPct(mul: number): string {
  const pct = Math.round((mul - 1) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * 基础伤害：`atk × 克制 × 攻击方地形 × 目标地形`，下限 1。
 *
 * `targetPos` 现在是必填。它曾经是可选的，于是技能伤害那条路径一直没传，
 * 技能等于无视目标地形——只要有一种可通行地形带减伤，同一个森林里的敌人就会
 * 「普攻打不动、技能照样打满」。地形规则必须对普攻和技能完全一致，
 * 不然「站进森林」这条策略是真是假取决于对手用哪一招，没人教得会。
 */
export function computeDamage(
  attackerDef: UnitDef,
  targetDef: UnitDef,
  terrainGrid: TerrainGrid,
  attackerPos: Vec2,
  targetPos: Vec2,
): number {
  const cm = counterMultiplier(attackerDef.id, targetDef.id);
  const tm = terrainAttackMul(terrainGrid, attackerPos);
  const dm = terrainDefenseMul(terrainGrid, targetPos);
  const raw = attackerDef.atk * cm * tm * dm;
  return Math.max(1, Math.floor(raw));
}
