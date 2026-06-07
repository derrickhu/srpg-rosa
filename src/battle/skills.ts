import type { BattleEvent, UnitArchetypeDef, UnitDef, UnitKind, UnitState, Vec2 } from './types';
import { effectiveUnitDef } from './effectiveUnit';
import { computeSkillHitDamage } from './skillDamage';
import {
  applySkillCastAllyEffects,
  applySkillCastFoeEffects,
  applySkillCastSelfEffects,
} from './timedBattleEffects';
import { canProfessionEquipSkill, getSkillSpec, type SkillSpec } from '@/data/skillCatalog';
import { gridSize, inBounds, manhattan, neighbors4, type TerrainGrid } from './grid';

const RAY_DIRS: Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function livingFoes(self: UnitState, units: UnitState[]): UnitState[] {
  return units.filter((u) => u.hp > 0 && u.faction !== self.faction);
}

function livingAllies(self: UnitState, units: UnitState[]): UnitState[] {
  return units.filter((u) => u.hp > 0 && u.faction === self.faction);
}

function pushDeathIfNeeded(events: BattleEvent[], t: UnitState): void {
  if (t.hp <= 0) events.push({ type: 'death', uid: t.uid });
}

function enemiesOnRay(
  self: UnitState,
  from: Vec2,
  dir: Vec2,
  units: UnitState[],
  terrain: TerrainGrid,
): UnitState[] {
  const out: UnitState[] = [];
  let p = { x: from.x + dir.x, y: from.y + dir.y };
  while (inBounds(p, terrain)) {
    const occ = units.find((u) => u.hp > 0 && u.pos.x === p.x && u.pos.y === p.y);
    if (occ && occ.faction !== self.faction) out.push(occ);
    p = { x: p.x + dir.x, y: p.y + dir.y };
  }
  return out;
}

function rayCellsFrom(from: Vec2, dir: Vec2, terrain: TerrainGrid): Vec2[] {
  const cells: Vec2[] = [];
  let p = { x: from.x + dir.x, y: from.y + dir.y };
  while (inBounds(p, terrain)) {
    cells.push({ ...p });
    p = { x: p.x + dir.x, y: p.y + dir.y };
  }
  return cells;
}

function bestLinePick(
  self: UnitState,
  from: Vec2,
  units: UnitState[],
  terrain: TerrainGrid,
): { targets: UnitState[]; rangeCells: Vec2[] } {
  let bestTargets: UnitState[] = [];
  let bestCells: Vec2[] = [];
  let bestScore = -1;
  for (const d of RAY_DIRS) {
    const line = enemiesOnRay(self, from, d, units, terrain);
    const cells = rayCellsFrom(from, d, terrain);
    const score = line.reduce((s, t) => s + t.hp, 0);
    if (score > bestScore) {
      bestScore = score;
      bestTargets = line;
      bestCells = cells;
    }
  }
  return { targets: bestTargets, rangeCells: bestCells };
}

function cellsAtManhattan(center: Vec2, dist: number, terrain: TerrainGrid): Vec2[] {
  if (dist === 1) return neighbors4(center, terrain);
  const { w, h } = gridSize(terrain);
  const out: Vec2[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = { x, y };
      if (manhattan(p, center) === dist) out.push(p);
    }
  }
  return out;
}

function foesAtManhattan(self: UnitState, units: UnitState[], dist: number): UnitState[] {
  return livingFoes(self, units).filter((t) => manhattan(t.pos, self.pos) === dist);
}

function alliesAtManhattanExcludingSelf(self: UnitState, units: UnitState[], dist: number): UnitState[] {
  return livingAllies(self, units).filter(
    (u) => u.uid !== self.uid && manhattan(u.pos, self.pos) === dist,
  );
}

function pickFoeInRing(foes: UnitState[], pick: 'lowestHp' | 'highestHp'): UnitState | undefined {
  if (foes.length === 0) return undefined;
  if (pick === 'lowestHp') return foes.reduce((a, b) => (a.hp <= b.hp ? a : b));
  return foes.reduce((a, b) => (a.hp >= b.hp ? a : b));
}

function pickAllyInRing(allies: UnitState[], pick: 'lowestHp' | 'highestHp'): UnitState | undefined {
  if (allies.length === 0) return undefined;
  if (pick === 'lowestHp') return allies.reduce((a, b) => (a.hp <= b.hp ? a : b));
  return allies.reduce((a, b) => (a.hp >= b.hp ? a : b));
}

function canCast(self: UnitState, spec: SkillSpec): boolean {
  return canProfessionEquipSkill(self.defId, spec.id);
}

function skillHitDamage(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  tgt: UnitState,
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
): number {
  return computeSkillHitDamage({
    self,
    target: tgt,
    casterDef: def,
    targetDef: effectiveUnitDef(tgt, defs),
    spec,
    terrain,
    defs,
  });
}

function castNeighborAoE(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  dist: number,
): BattleEvent[] {
  const foes = foesAtManhattan(self, units, dist);
  if (foes.length === 0) return [];
  const hits: { target: string; damage: number; hpLeft: number }[] = [];
  for (const t of foes) {
    const dmg = skillHitDamage(self, def, spec, t, terrain, defs);
    t.hp -= dmg;
    hits.push({ target: t.uid, damage: dmg, hpLeft: Math.max(0, t.hp) });
    applySkillCastFoeEffects(t, spec);
  }
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits,
    },
  ];
  for (const t of foes) pushDeathIfNeeded(events, t);
  self.skillCd = spec.cooldown;
  applySkillCastSelfEffects(self, spec);
  return events;
}

function castNeighborPickLowest(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  dist: number,
): BattleEvent[] {
  const foes = foesAtManhattan(self, units, dist);
  if (foes.length === 0) return [];
  const tgt = foes.reduce((a, b) => (a.hp <= b.hp ? a : b));
  const dmg = skillHitDamage(self, def, spec, tgt, terrain, defs);
  tgt.hp -= dmg;
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits: [{ target: tgt.uid, damage: dmg, hpLeft: Math.max(0, tgt.hp) }],
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastFoeEffects(tgt, spec);
  self.skillCd = spec.cooldown;
  applySkillCastSelfEffects(self, spec);
  return events;
}

function castNeighborPickFoe(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  dist: number,
  pick: 'lowestHp' | 'highestHp',
): BattleEvent[] {
  const foes = foesAtManhattan(self, units, dist);
  const tgt = pickFoeInRing(foes, pick);
  if (!tgt) return [];
  const dmg = skillHitDamage(self, def, spec, tgt, terrain, defs);
  tgt.hp -= dmg;
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits: [{ target: tgt.uid, damage: dmg, hpLeft: Math.max(0, tgt.hp) }],
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastFoeEffects(tgt, spec);
  self.skillCd = spec.cooldown;
  applySkillCastSelfEffects(self, spec);
  return events;
}

function castNeighborPickAlly(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  dist: number,
  pick: 'lowestHp' | 'highestHp',
): BattleEvent[] {
  const allies = alliesAtManhattanExcludingSelf(self, units, dist);
  const tgt = pickAllyInRing(allies, pick);
  if (!tgt) return [];
  const dmg = skillHitDamage(self, def, spec, tgt, terrain, defs);
  tgt.hp -= dmg;
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits: [{ target: tgt.uid, damage: dmg, hpLeft: Math.max(0, tgt.hp) }],
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastAllyEffects(tgt, spec);
  self.skillCd = spec.cooldown;
  applySkillCastSelfEffects(self, spec);
  return events;
}

function castLineBestRay(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
): BattleEvent[] {
  const { targets: line, rangeCells } = bestLinePick(self, self.pos, units, terrain);
  if (line.length === 0) return [];
  const hits: { target: string; damage: number; hpLeft: number }[] = [];
  for (const t of line) {
    if (t.hp <= 0) continue;
    const dmg = skillHitDamage(self, def, spec, t, terrain, defs);
    t.hp -= dmg;
    hits.push({ target: t.uid, damage: dmg, hpLeft: Math.max(0, t.hp) });
    applySkillCastFoeEffects(t, spec);
  }
  if (hits.length === 0) return [];
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells,
      hits,
    },
  ];
  for (const h of hits) {
    const t = units.find((u) => u.uid === h.target);
    if (t) pushDeathIfNeeded(events, t);
  }
  self.skillCd = spec.cooldown;
  applySkillCastSelfEffects(self, spec);
  return events;
}

function runBeforeMoveShape(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
): BattleEvent[] {
  switch (spec.shape.type) {
    case 'neighborAoE':
      return castNeighborAoE(self, def, spec, units, terrain, defs, spec.shape.manhattan);
    case 'neighborPickLowest':
      return castNeighborPickLowest(self, def, spec, units, terrain, defs, spec.shape.manhattan);
    case 'neighborPickFoe':
      return castNeighborPickFoe(
        self,
        def,
        spec,
        units,
        terrain,
        defs,
        spec.shape.manhattan,
        spec.shape.pick,
      );
    case 'neighborPickAlly':
      return castNeighborPickAlly(
        self,
        def,
        spec,
        units,
        terrain,
        defs,
        spec.shape.manhattan,
        spec.shape.pick,
      );
    default:
      return [];
  }
}

export function trySkillBeforeMove(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  const sk = def.skill;
  if (!sk || (self.skillCd ?? 0) > 0) return [];
  const spec = getSkillSpec(sk.id);
  if (!spec || !canCast(self, spec)) return [];
  if (spec.timing === 'passive' || spec.timing === 'afterMove') return [];
  if (spec.timing !== 'beforeMove') return [];
  return runBeforeMoveShape(self, def, spec, units, terrain, defs);
}

export function trySkillAfterMove(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  const sk = def.skill;
  if (!sk || (self.skillCd ?? 0) > 0) return [];
  const spec = getSkillSpec(sk.id);
  if (!spec || !canCast(self, spec)) return [];
  if (spec.timing !== 'afterMove') return [];
  if (spec.shape.type !== 'lineBestRayAllFoes') return [];
  return castLineBestRay(self, def, spec, units, terrain, defs);
}
