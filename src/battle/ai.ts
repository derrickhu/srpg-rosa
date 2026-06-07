import type { UnitArchetypeDef, UnitDef, UnitKind, UnitState, Vec2 } from './types';
import { effectiveUnitDef } from './effectiveUnit';
import { cellsFromDist, reachableCells } from './path';
import { manhattan } from './grid';
import { computeDamage, counterMultiplier } from './damage';
import type { TerrainGrid } from './grid';
import { getTerrainAt } from './grid';
import { getTerrainSpec } from '@/data/terrainSpec';

export type AiDifficulty = 'easy' | 'normal' | 'hard';

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

function living(units: UnitState[]): UnitState[] {
  return units.filter((u) => u.hp > 0);
}

function defOf(u: UnitState, defs: Record<UnitKind, UnitArchetypeDef>): UnitDef {
  return effectiveUnitDef(u, defs);
}

export function canAttackFrom(
  atkDef: UnitDef,
  fromPos: Vec2,
  target: UnitState,
): boolean {
  const d = manhattan(fromPos, target.pos);
  if (atkDef.isRanged) {
    return d <= atkDef.range && d >= 1;
  }
  return d === 1;
}

function selectAttackTarget(
  atkDef: UnitDef,
  fromPos: Vec2,
  foes: UnitState[],
  defs: Record<UnitKind, UnitArchetypeDef>,
  difficulty: AiDifficulty,
): UnitState | null {
  const alive = living(foes);
  const inRange = alive.filter((t) => canAttackFrom(atkDef, fromPos, t));
  if (inRange.length === 0) return null;

  const taunters = inRange.filter((t) => defOf(t, defs).taunt);
  if (taunters.length > 0) {
    return taunters.reduce((a, b) => (a.hp <= b.hp ? a : b));
  }

  if (difficulty === 'easy') {
    return inRange[Math.floor(Math.random() * inRange.length)]!;
  }

  if (difficulty === 'hard') {
    let bestScore = -Infinity;
    let best: UnitState = inRange[0]!;
    for (const t of inRange) {
      const cm = counterMultiplier(atkDef.id, t.defId);
      const killBonus = t.hp <= atkDef.atk * cm ? 100 : 0;
      const score = cm * 10 + killBonus - t.hp * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  return inRange.reduce((a, b) => (a.hp <= b.hp ? a : b));
}

export interface TurnChoice {
  moveTo: Vec2 | null;
  attackTarget: UnitState | null;
}

function evaluateCell(
  cell: Vec2,
  self: UnitState,
  atkDef: UnitDef,
  allUnits: UnitState[],
  defs: Record<UnitKind, UnitArchetypeDef>,
  terrain: TerrainGrid,
  difficulty: AiDifficulty,
): { score: number; target: UnitState | null } {
  const foes = living(allUnits).filter((u) => u.faction !== self.faction);
  const t = selectAttackTarget(atkDef, cell, foes, defs, difficulty);
  const dmg = t ? computeDamage(atkDef, defOf(t, defs), terrain, cell, t.pos) : 0;

  let score = dmg;

  if (difficulty === 'hard') {
    const tSpec = getTerrainSpec(getTerrainAt(terrain, cell));
    score += tSpec.atkMul > 1 ? 5 : 0;
    score += tSpec.evade > 0 ? 3 : 0;
    score -= tSpec.dotPerRound > 0 ? 4 : 0;
    if (t && t.hp <= dmg) score += 20;
  }

  return { score, target: t };
}

export function chooseTurnAction(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  allUnits: UnitState[],
  terrain: TerrainGrid,
  difficulty: AiDifficulty = 'normal',
): TurnChoice {
  if (difficulty === 'easy' && Math.random() < 0.15) {
    return { moveTo: null, attackTarget: null };
  }

  const atkDef = defOf(self, defs);
  const blocked = new Set(
    living(allUnits)
      .filter((u) => u.uid !== self.uid)
      .map((u) => key(u.pos)),
  );
  const dist = reachableCells(self.pos, atkDef.move, blocked, terrain);
  const candidates = cellsFromDist(self.pos, dist);

  let bestScore = -1;
  let bestMoveCost = 99;
  let bestCell: Vec2 = self.pos;
  let bestTarget: UnitState | null = null;

  for (const cell of candidates) {
    const moveCost = manhattan(cell, self.pos);
    const { score, target } = evaluateCell(cell, self, atkDef, allUnits, defs, terrain, difficulty);
    if (score > bestScore || (score === bestScore && score > 0 && moveCost < bestMoveCost)) {
      bestScore = score;
      bestMoveCost = moveCost;
      bestCell = cell;
      bestTarget = target;
    }
  }

  if (bestScore > 0 && bestTarget) {
    const moveTo = manhattan(bestCell, self.pos) === 0 ? null : bestCell;
    return { moveTo, attackTarget: bestTarget };
  }

  const enemies = living(allUnits).filter((u) => u.faction !== self.faction);
  if (enemies.length === 0) return { moveTo: null, attackTarget: null };
  const nearest = enemies.reduce((a, b) =>
    (manhattan(self.pos, a.pos) <= manhattan(self.pos, b.pos) ? a : b));
  let bestDist = Infinity;
  let walk: Vec2 | null = null;
  for (const cell of candidates) {
    if (manhattan(cell, self.pos) === 0) continue;
    const d = manhattan(cell, nearest.pos);
    if (d < bestDist) {
      bestDist = d;
      walk = cell;
    }
  }
  return { moveTo: walk, attackTarget: null };
}
