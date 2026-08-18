import type { UnitArchetypeDef, UnitDef, UnitKind, UnitState, Vec2 } from './types';
import { effectiveUnitDef } from './effectiveUnit';
import { cellsFromDist, reachableCells } from './path';
import { manhattan } from './grid';
import { computeDamage, counterMultiplier } from './damage';
import type { TerrainGrid } from './grid';
import { getTerrainAt } from './grid';
import { hasLineOfSight } from './sight';
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

/**
 * 普攻能否从 `from` 打到格子 `cell`（近战邻格 / 远程 1..range 且视线不被挡）。
 *
 * 只要 `isRanged` 与 `range` 两个字段，不要求完整 `UnitDef`：威胁染色只有射程信息，
 * 没有也不需要凑出一整个单位定义。
 *
 * `terrain` 是必填的，尽管近战分支用不到它。设成可选会让「忘了传地形」表现为
 * **这一处静默地不判遮挡**——射程内的目标照打，而漏判的地方就是玩家眼里
 * 「城墙有时候挡有时候不挡」。判定散在引擎、威胁图、界面三处，
 * 让编译器逼每个调用点显式交出地形，是唯一能保证三处口径一致的办法。
 */
export function canAttackCell(
  atkDef: Pick<UnitDef, 'isRanged' | 'range'>,
  from: Vec2,
  cell: Vec2,
  terrain: TerrainGrid,
): boolean {
  const d = manhattan(from, cell);
  // 近战只打邻格，两格直接相接、中间没有格子可以挡，不必判视线
  if (!atkDef.isRanged) return d === 1;
  if (d < 1 || d > atkDef.range) return false;
  return hasLineOfSight(terrain, from, cell);
}

export function canAttackFrom(
  atkDef: UnitDef,
  fromPos: Vec2,
  target: UnitState,
  terrain: TerrainGrid,
): boolean {
  return canAttackCell(atkDef, fromPos, target.pos, terrain);
}

/**
 * 从 `fromPos` 出发要打谁；射程内无人返回 null。
 *
 * 导出是给引擎的「续打」用的：人工模式按下跳过时，单位可能已经由玩家走到某格了，
 * 这时不能再用 `chooseTurnAction` 的结果——那个目标是配着它想去的**另一格**算出来的，
 * 从玩家选的位置未必打得到，续打就会莫名少一刀。
 */
export function selectAttackTarget(
  atkDef: UnitDef,
  fromPos: Vec2,
  foes: UnitState[],
  defs: Record<UnitKind, UnitArchetypeDef>,
  terrain: TerrainGrid,
  difficulty: AiDifficulty,
): UnitState | null {
  const alive = living(foes);
  const inRange = alive.filter((t) => canAttackFrom(atkDef, fromPos, t, terrain));
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
  const t = selectAttackTarget(atkDef, cell, foes, defs, terrain, difficulty);
  const dmg = t ? computeDamage(atkDef, defOf(t, defs), terrain, cell, t.pos) : 0;

  let score = dmg;
  const tSpec = getTerrainSpec(getTerrainAt(terrain, cell));

  /**
   * 回避持续掉血的格子在**所有难度**下都生效。
   *
   * 原先这条和高地/森林偏好一起关在 `hard` 里。那两条是战术偏好，简单 AI 不会用
   * 是合理的；但「站进火里」不是偏好问题——玩家刚点燃一片森林，看到敌人径直走进去
   * 站着烧，第一反应是这游戏坏了，而不是「这只怪很笨」。简单难度该表现为
   * 索敌和站位更差，不该表现为自杀。
   *
   * 按 `dotPerRound` 线性罚而不是固定 -4：沼泽 5 和燃烧 8 的危险程度差着一截，
   * 一个常数会让 AI 对两者一视同仁。权重 1.5 的量级刻意压在「一次普攻伤害」以下，
   * 所以 AI 仍然愿意踩进火里补掉一个残血目标（hard 的击杀加分是 +20），
   * 只是不会没事站在里面。
   */
  score -= tSpec.dotPerRound * DOT_AVOID_WEIGHT;

  if (difficulty === 'hard') {
    score += tSpec.atkMul > 1 ? 5 : 0;
    score += tSpec.defMul < 1 ? 3 : 0;
    if (t && t.hp <= dmg) score += 20;
  }

  return { score, target: t };
}

/** 每 1 点轮首掉血折算成多少「伤害分」，见 `evaluateCell` */
const DOT_AVOID_WEIGHT = 1.5;

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
  // 打不到任何人时朝最近的敌人走
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
