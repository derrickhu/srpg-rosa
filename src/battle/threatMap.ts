import type { Faction, UnitArchetypeDef, UnitKind, UnitState, Vec2 } from './types';
import { effectiveUnitDef } from './effectiveUnit';
import { canAttackCell } from './ai';
import { cellsFromDist, reachableCells } from './path';
import { gridSize, inBounds, type TerrainGrid } from './grid';

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

function blockedExcept(units: UnitState[], selfUid: string): Set<string> {
  const s = new Set<string>();
  for (const u of units) {
    if (u.hp <= 0 || u.uid === selfUid) continue;
    s.add(key(u.pos));
  }
  return s;
}

/**
 * 从 `from` 普攻能打到的所有在板格（威胁染色用）。
 * 近战 4 邻；远程扫曼哈顿环，只收板内坐标。
 */
export function attackableCellsFrom(
  atkDef: { isRanged: boolean; range: number },
  from: Vec2,
  terrain: TerrainGrid,
): Vec2[] {
  const out: Vec2[] = [];
  if (!atkDef.isRanged) {
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const c = { x: from.x + d.x, y: from.y + d.y };
      if (inBounds(c, terrain)) out.push(c);
    }
    return out;
  }
  const { w, h } = gridSize(terrain);
  const r = atkDef.range;
  for (let y = Math.max(0, from.y - r); y <= Math.min(h - 1, from.y + r); y++) {
    for (let x = Math.max(0, from.x - r); x <= Math.min(w - 1, from.x + r); x++) {
      if (canAttackCell(atkDef, from, { x, y })) out.push({ x, y });
    }
  }
  return out;
}

/**
 * 敌方下一行动：移动后普攻能覆盖的格子并集。
 * 口径与 AI 决策同：可达格（含脚下）+ 普攻射程，不含技能。
 */
export function cellsThreatenedByEnemies(
  units: UnitState[],
  defs: Record<UnitKind, UnitArchetypeDef>,
  terrain: TerrainGrid,
  friendlyFaction: Faction,
): Set<string> {
  const threatened = new Set<string>();
  for (const e of units) {
    if (e.hp <= 0 || e.faction === friendlyFaction) continue;
    const def = effectiveUnitDef(e, defs);
    const reach = cellsFromDist(
      e.pos,
      reachableCells(e.pos, def.move, blockedExcept(units, e.uid), terrain),
    );
    for (const from of reach) {
      for (const cell of attackableCellsFrom(def, from, terrain)) {
        threatened.add(key(cell));
      }
    }
  }
  return threatened;
}

/**
 * 哪些敌人下一行动能普攻打到 `cell`（供威胁箭头）。
 * 同一敌人只出现一次。
 */
export function enemiesThreateningCell(
  units: UnitState[],
  defs: Record<UnitKind, UnitArchetypeDef>,
  terrain: TerrainGrid,
  cell: Vec2,
  friendlyFaction: Faction,
): UnitState[] {
  const out: UnitState[] = [];
  for (const e of units) {
    if (e.hp <= 0 || e.faction === friendlyFaction) continue;
    const def = effectiveUnitDef(e, defs);
    const reach = cellsFromDist(
      e.pos,
      reachableCells(e.pos, def.move, blockedExcept(units, e.uid), terrain),
    );
    for (const from of reach) {
      if (canAttackCell(def, from, cell)) {
        out.push(e);
        break;
      }
    }
  }
  return out;
}

/**
 * 选移动格时的危险落点：按「人已经站在目标格」来算威胁。
 *
 * 若仍用当前位置挡路，会把「我走开后敌人才抄得过来」的格子误标成安全蓝格，
 * 走过去却出现威胁箭头——蓝格和箭头口径必须和落地后一致。
 */
export function dangerMoveCellsForMover(
  units: UnitState[],
  defs: Record<UnitKind, UnitArchetypeDef>,
  terrain: TerrainGrid,
  moverUid: string,
  moveCells: Vec2[],
): Vec2[] {
  const mover = units.find((u) => u.uid === moverUid && u.hp > 0);
  if (!mover || moveCells.length === 0) return [];
  const danger: Vec2[] = [];
  for (const dest of moveCells) {
    const ghosted = units.map((u) =>
      u.uid === moverUid ? { ...u, pos: { ...dest } } : u,
    );
    if (enemiesThreateningCell(ghosted, defs, terrain, dest, mover.faction).length > 0) {
      danger.push(dest);
    }
  }
  return danger;
}
