import type {
  BattleEvent,
  SkillDef,
  SkillHit,
  UnitArchetypeDef,
  UnitDef,
  UnitKind,
  UnitState,
  Vec2,
} from './types';
import { effectiveUnitDef } from './effectiveUnit';
import { terrainAttackNote, terrainDefenseNote } from './damage';
import { computeSkillHitDamage } from './skillDamage';
import {
  applySkillCastAllyEffects,
  applySkillCastFoeEffects,
  applySkillCastSelfEffects,
} from './timedBattleEffects';
import { canProfessionEquipSkill, getSkillSpec, type SkillSpec } from '@/data/skillCatalog';
import { effectiveSkillSpec } from '@/data/skillModCatalog';
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

/** 覆盖整片区域（曼哈顿 <= r），含贴脸格；「横扫」词条用 */
function cellsWithinManhattan(center: Vec2, radius: number, terrain: TerrainGrid): Vec2[] {
  const { w, h } = gridSize(terrain);
  const out: Vec2[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = { x, y };
      const d = manhattan(p, center);
      if (d > 0 && d <= radius) out.push(p);
    }
  }
  return out;
}

function foesWithinManhattan(self: UnitState, units: UnitState[], radius: number): UnitState[] {
  return livingFoes(self, units).filter((t) => {
    const d = manhattan(t.pos, self.pos);
    return d > 0 && d <= radius;
  });
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

/**
 * 玩家指定的目标优先，否则退回自动挑选规则。
 *
 * `chosenUid` 必须落在 `pool` 里才生效。校验放这里而不是信任调用方：pool 是「合法目标」的
 * 唯一定义（射程 + 阵营 + 存活），要是让一个不在其中的 uid 通过，技能就能隔着半张地图
 * 打死人，而这种越界在回放上看不出异常——伤害数字照样正常飘。
 */
function resolveChoice(
  pool: UnitState[],
  chosenUid: string | undefined,
  fallback: () => UnitState | undefined,
): UnitState | undefined {
  if (chosenUid) {
    const hit = pool.find((u) => u.uid === chosenUid);
    if (hit) return hit;
  }
  return fallback();
}

function canCast(self: UnitState, spec: SkillSpec): boolean {
  return canProfessionEquipSkill(self.defId, spec.id);
}

/**
 * 单位这一场实际生效的技能规格 = 技能表原始规格 + 挂在它身上的词条。
 *
 * 所有施放路径（AI 的 before/afterMove、人工的 castSkillManual、瞄准预览）都必须
 * 从这里拿规格。任何一处漏用，表现是「这个技能在某些情况下不吃词条」——
 * 伤害数字看着正常，只是偏小，肉眼几乎发现不了。
 */
function unitSkillSpec(self: UnitState, skillId: string): SkillSpec | undefined {
  const base = getSkillSpec(skillId);
  if (!base) return undefined;
  return effectiveSkillSpec(base, self.skillMods);
}

/**
 * 飘字 / 瞄准预览上的技能名。
 * 敌方皮肤把展示名写在 `battleSkill.name` 上，结算仍用 `spec.id`；
 * 这里优先取皮肤名，否则 Boss 放技能时仍会飘出底层的「狂暴战吼」。
 */
function skillCastName(self: UnitState, spec: SkillSpec): string {
  if (self.battleSkill?.id === spec.id && self.battleSkill.name) {
    return self.battleSkill.name;
  }
  return spec.name;
}

/**
 * 属性加减的飘字。治疗走 `heal` 事件、中毒走每回合 `dot`，这里只报攻/速/嘲讽。
 * 漏了的话玩家只看见特效，会以为号角、祝福、削攻「没效果」。
 */
function pushAttrNotes(
  events: BattleEvent[],
  spec: SkillSpec,
  who: { self?: UnitState; ally?: UnitState; foes?: readonly UnitState[] },
): void {
  if (who.self) {
    for (const e of spec.onCastSelfEffects ?? []) {
      if (e.kind === 'atkBonus') {
        events.push({ type: 'statusNote', target: who.self.uid, text: `攻+${e.addAtk}`, tone: 'buff' });
      } else if (e.kind === 'taunt') {
        events.push({ type: 'statusNote', target: who.self.uid, text: '嘲讽', tone: 'buff' });
      }
    }
  }
  if (who.ally) {
    for (const e of spec.onCastAllyEffects ?? []) {
      if (e.kind === 'atkBonus') {
        events.push({ type: 'statusNote', target: who.ally.uid, text: `攻+${e.addAtk}`, tone: 'buff' });
      } else if (e.kind === 'spdBonus') {
        events.push({ type: 'statusNote', target: who.ally.uid, text: `速+${e.addSpd}`, tone: 'buff' });
      }
    }
  }
  for (const t of who.foes ?? []) {
    for (const e of spec.onCastFoeEffects ?? []) {
      if (e.kind === 'atkDown') {
        events.push({ type: 'statusNote', target: t.uid, text: `攻-${e.subAtk}`, tone: 'debuff' });
      } else if (e.kind === 'spdDown') {
        events.push({ type: 'statusNote', target: t.uid, text: `速-${e.subSpd}`, tone: 'debuff' });
      }
    }
  }
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

/**
 * 结算一个目标：扣血并返回带地形归因的 hit。
 *
 * 每个 cast 分支原本各自拼 `{ target, damage, hpLeft }`。归因文案要是也各拼一遍，
 * 漏掉一处的表现是「这个技能在森林里不出地形提示」——它和其他技能长得一模一样，
 * 靠肉眼几乎发现不了。所以统一从这里出。
 */
function resolveHit(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  tgt: UnitState,
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
): SkillHit {
  const damage = skillHitDamage(self, def, spec, tgt, terrain, defs);
  tgt.hp -= damage;
  return {
    target: tgt.uid,
    damage,
    hpLeft: Math.max(0, tgt.hp),
    defTerrainNote: terrainDefenseNote(terrain, tgt.pos) ?? undefined,
  };
}

/**
 * 环形 / 圆形 AoE 共用的施放流程。
 *
 * `ring` = 正好 `dist` 格外的一圈（技能表原本的形状）；
 * `disc` = `radius` 格以内全覆盖（「横扫」「势不可挡」词条把环摊成圆）。
 */
function castAreaAoE(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  area: { kind: 'ring'; dist: number } | { kind: 'disc'; radius: number },
): BattleEvent[] {
  const foes =
    area.kind === 'ring'
      ? foesAtManhattan(self, units, area.dist)
      : foesWithinManhattan(self, units, area.radius);
  if (foes.length === 0) return [];
  const hits: SkillHit[] = [];
  for (const t of foes) {
    // 无伤 AoE（若还有）不要塞 damage:0 的 hit——回放会飘「0」
    if (spec.damage.kind !== 'none') {
      hits.push(resolveHit(self, def, spec, t, terrain, defs));
    }
    applySkillCastFoeEffects(t, spec);
  }
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: skillCastName(self, spec),
      kind: spec.displayKind,
      rangeCells:
        area.kind === 'ring'
          ? cellsAtManhattan(self.pos, area.dist, terrain)
          : cellsWithinManhattan(self.pos, area.radius, terrain),
      hits,
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushAttrNotes(events, spec, { self, foes });
  for (const t of foes) pushDeathIfNeeded(events, t);
  applySkillCastSelfEffects(self, spec);
  pushLifesteal(self, spec, hits, defs, events);
  return events;
}

/** 只对自己放的号角 / 自 buff：无需目标，点技能即放 */
function castSelfCast(
  self: UnitState,
  spec: SkillSpec,
): BattleEvent[] {
  if (self.hp <= 0) return [];
  applySkillCastSelfEffects(self, spec);
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: skillCastName(self, spec),
      kind: spec.displayKind,
      rangeCells: [{ ...self.pos }],
      hits: [],
    },
  ];
  pushAttrNotes(events, spec, { self });
  return events;
}

/**
 * 「汲取」词条：按本次技能打出的总伤害回血。
 *
 * 按 `hits` 里的 `damage` 算而不是按技能面板值：克制、地形、目标残血都会让实际伤害
 * 低于理论值，用面板值算会出现「打了个残血小怪回满血」。
 */
function pushLifesteal(
  self: UnitState,
  spec: SkillSpec,
  hits: SkillHit[],
  defs: Record<UnitKind, UnitArchetypeDef>,
  events: BattleEvent[],
): void {
  const ratio = spec.lifestealRatio ?? 0;
  if (ratio <= 0 || self.hp <= 0) return;
  const total = hits.reduce((s, h) => s + h.damage, 0);
  const maxHp = effectiveUnitDef(self, defs).maxHp;
  const heal = Math.min(Math.floor(total * ratio), Math.max(0, maxHp - self.hp));
  if (heal <= 0) return;
  self.hp += heal;
  events.push({ type: 'heal', target: self.uid, amount: heal, hpLeft: self.hp });
}

function castNeighborPickLowest(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  dist: number,
  chosenUid?: string,
): BattleEvent[] {
  const foes = foesAtManhattan(self, units, dist);
  if (foes.length === 0) return [];
  const tgt = resolveChoice(foes, chosenUid, () => foes.reduce((a, b) => (a.hp <= b.hp ? a : b)))!;
  const hit = resolveHit(self, def, spec, tgt, terrain, defs);
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: skillCastName(self, spec),
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits: [hit],
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastFoeEffects(tgt, spec);
  applySkillCastSelfEffects(self, spec);
  pushAttrNotes(events, spec, { self, foes: [tgt] });
  pushLifesteal(self, spec, [hit], defs, events);
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
  chosenUid?: string,
): BattleEvent[] {
  const foes = foesAtManhattan(self, units, dist);
  const tgt = resolveChoice(foes, chosenUid, () => pickFoeInRing(foes, pick));
  if (!tgt) return [];
  // 纯 debuff（破甲/缠足）：保留 hit 供回放对准目标，但不走扣血
  const hits: SkillHit[] =
    spec.damage.kind === 'none'
      ? [{ target: tgt.uid, damage: 0, hpLeft: tgt.hp }]
      : [resolveHit(self, def, spec, tgt, terrain, defs)];
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: skillCastName(self, spec),
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits,
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastFoeEffects(tgt, spec);
  applySkillCastSelfEffects(self, spec);
  pushAttrNotes(events, spec, { self, foes: [tgt] });
  pushLifesteal(self, spec, hits, defs, events);
  return events;
}

/** 友方即时治疗（`onCastAllyEffects` 里的 `heal`）；超过上限的部分丢弃 */
function pushAllyHeal(
  spec: SkillSpec,
  tgt: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  events: BattleEvent[],
): void {
  let amount = 0;
  for (const e of spec.onCastAllyEffects ?? []) if (e.kind === 'heal') amount += e.amount;
  if (amount <= 0 || tgt.hp <= 0) return;
  const maxHp = effectiveUnitDef(tgt, defs).maxHp;
  const heal = Math.min(amount, Math.max(0, maxHp - tgt.hp));
  if (heal <= 0) return;
  tgt.hp += heal;
  events.push({ type: 'heal', target: tgt.uid, amount: heal, hpLeft: tgt.hp });
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
  chosenUid?: string,
): BattleEvent[] {
  const allies = alliesAtManhattanExcludingSelf(self, units, dist);
  const tgt = resolveChoice(allies, chosenUid, () => pickAllyInRing(allies, pick));
  if (!tgt) return [];
  // 友方治疗/buff：不要 resolveHit，否则无伤也会被当成「打了友军 0 点」
  const hits: SkillHit[] =
    spec.damage.kind === 'none'
      ? [{ target: tgt.uid, damage: 0, hpLeft: tgt.hp }]
      : [resolveHit(self, def, spec, tgt, terrain, defs)];
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: skillCastName(self, spec),
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits,
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastAllyEffects(tgt, spec);
  pushAllyHeal(spec, tgt, defs, events);
  applySkillCastSelfEffects(self, spec);
  pushAttrNotes(events, spec, { self, ally: tgt });
  return events;
}

/** 玩家点了某个敌人时，取穿过它的那条直线（兼容旧调用；瞄准优先走格子） */
function rayPickThrough(
  self: UnitState,
  from: Vec2,
  chosenUid: string,
  units: UnitState[],
  terrain: TerrainGrid,
): { targets: UnitState[]; rangeCells: Vec2[] } | null {
  for (const d of RAY_DIRS) {
    const line = enemiesOnRay(self, from, d, units, terrain);
    if (line.some((t) => t.uid === chosenUid)) {
      return { targets: line, rangeCells: rayCellsFrom(from, d, terrain) };
    }
  }
  return null;
}

/** 玩家点了射线上某一格：朝该方向贯穿，打中线上全部敌人 */
function rayPickThroughCell(
  self: UnitState,
  from: Vec2,
  cell: Vec2,
  units: UnitState[],
  terrain: TerrainGrid,
): { targets: UnitState[]; rangeCells: Vec2[] } | null {
  for (const d of RAY_DIRS) {
    const cells = rayCellsFrom(from, d, terrain);
    if (!cells.some((c) => c.x === cell.x && c.y === cell.y)) continue;
    return {
      targets: enemiesOnRay(self, from, d, units, terrain),
      rangeCells: cells,
    };
  }
  return null;
}

function castLineBestRay(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  chosenUid?: string,
  aimCell?: Vec2,
): BattleEvent[] {
  const picked = aimCell
    ? rayPickThroughCell(self, self.pos, aimCell, units, terrain)
    : chosenUid
      ? rayPickThrough(self, self.pos, chosenUid, units, terrain)
      : null;
  const { targets: line, rangeCells } = picked ?? bestLinePick(self, self.pos, units, terrain);
  if (line.length === 0) return [];
  const hits: SkillHit[] = [];
  for (const t of line) {
    if (t.hp <= 0) continue;
    hits.push(resolveHit(self, def, spec, t, terrain, defs));
    applySkillCastFoeEffects(t, spec);
  }
  if (hits.length === 0) return [];
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: skillCastName(self, spec),
      kind: spec.displayKind,
      rangeCells,
      hits,
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  for (const h of hits) {
    const t = units.find((u) => u.uid === h.target);
    if (t) pushDeathIfNeeded(events, t);
  }
  applySkillCastSelfEffects(self, spec);
  pushAttrNotes(events, spec, { self, foes: line });
  pushLifesteal(self, spec, hits, defs, events);
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
      return castAreaAoE(self, def, spec, units, terrain, defs, {
        kind: 'ring',
        dist: spec.shape.manhattan,
      });
    case 'discAoE':
      return castAreaAoE(self, def, spec, units, terrain, defs, {
        kind: 'disc',
        radius: spec.shape.radius,
      });
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
    case 'selfCast':
      return castSelfCast(self, spec);
    default:
      return [];
  }
}

/**
 * 技能槽。主槽来自布阵配置，临时槽来自局内商店。
 *
 * 两槽**冷却各自独立**，但共用每回合一次的施放额度（`PendingTurn.canSkill`）。
 * 让临时技能额外多一次出手会直接改变行动经济——每回合能打两发技能的队伍
 * 和现在这套敌人血量完全不是一个游戏，整条难度曲线都得重调。
 * 共用额度之后它加的是「主技能进冷却时你还有别的事可做」，这是选择，不是数值膨胀。
 */
export type SkillSlot = 'main' | 'temp';

function slotSkill(def: UnitDef, slot: SkillSlot): SkillDef | undefined {
  return slot === 'temp' ? def.tempSkill : def.skill;
}

function slotCd(self: UnitState, slot: SkillSlot): number {
  return (slot === 'temp' ? self.tempSkillCd : self.skillCd) ?? 0;
}

function setSlotCd(self: UnitState, slot: SkillSlot, cd: number): void {
  if (slot === 'temp') self.tempSkillCd = cd;
  else self.skillCd = cd;
}

/**
 * 槽内技能当前可用则返回它的生效规格，否则 undefined。
 * `passive` 由调用方自行判断——AI 的 `trySkill*` 要排除它，瞄准也要，但被动本身另有出路。
 */
function readySlotSpec(
  self: UnitState,
  def: UnitDef,
  slot: SkillSlot,
): SkillSpec | undefined {
  const sk = slotSkill(def, slot);
  if (!sk || slotCd(self, slot) > 0) return undefined;
  const spec = unitSkillSpec(self, sk.id);
  if (!spec || !canCast(self, spec)) return undefined;
  return spec;
}

/**
 * 冷却统一在施放入口写，不在各个 `cast*` 里写。
 *
 * 原本 5 个 `cast*` 各自写一行 `self.skillCd = spec.cooldown`。加了第二个槽之后
 * 那 5 行都得知道自己在为哪个槽服务，等于把槽位概念散进整个结算层。
 * 改成由入口按「有没有真的放出去」来判定并落到对应槽上——
 * `skillCast` 事件就是那个判定：`cast*` 只在通过目标校验后才会发它。
 */
function commitCast(self: UnitState, slot: SkillSlot, spec: SkillSpec, events: BattleEvent[]): BattleEvent[] {
  if (!events.some((e) => e.type === 'skillCast')) return [];
  setSlotCd(self, slot, spec.cooldown);
  return events;
}

export function trySkillBeforeMove(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  for (const slot of CAST_ORDER) {
    const spec = readySlotSpec(self, def, slot);
    if (!spec || spec.timing !== 'beforeMove') continue;
    const events = commitCast(self, slot, spec, runBeforeMoveShape(self, def, spec, units, terrain, defs));
    if (events.length) return events;
  }
  return [];
}

export function trySkillAfterMove(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  for (const slot of CAST_ORDER) {
    const spec = readySlotSpec(self, def, slot);
    if (!spec || spec.timing !== 'afterMove') continue;
    if (spec.shape.type !== 'lineBestRayAllFoes') continue;
    const events = commitCast(self, slot, spec, castLineBestRay(self, def, spec, units, terrain, defs));
    if (events.length) return events;
  }
  return [];
}

/**
 * AI 的取用顺序：主技能优先。
 *
 * 主技能是玩家在布阵页选的、并且词条大多是冲着它去的；临时技能是补位。
 * 让 AI 去比较两者的期望收益需要一套评估函数，而自动模式的定位是
 * 「把已经会打的关快速过掉」，不是替玩家打出最优解——固定顺序更好预测。
 */
const CAST_ORDER: readonly SkillSlot[] = ['main', 'temp'];

/** 人工模式的技能瞄准信息：玩家要看到打哪儿、以及需不需要点目标 */
export interface SkillAiming {
  slot: SkillSlot;
  skillId: string;
  skillName: string;
  kind: SkillSpec['displayKind'];
  /** 瞄准范围高亮格（展示用，可大于可点格） */
  rangeCells: Vec2[];
  /**
   * 需要玩家点选的**单位** uid（单体点名技能）。
   * 与 `aimCells` 互斥：直线/范围确认走格子，不走点敌人。
   */
  candidates: string[];
  /**
   * 需要玩家点选的**格子**（选方向 / 确认范围）。
   * 非空时进入瞄准态，点其中一格才施放；与 `candidates` 都空则点按钮直接放。
   */
  aimCells: Vec2[];
  /** 无需点选时会打到谁，用来在按钮上预告「命中 2 个」 */
  autoTargets: string[];
}

/**
 * 当前位置能不能放技能，以及要玩家点什么；返回 null = 放不出来（冷却 / 无技能 / 范围内没目标）。
 *
 * 「范围内没目标就返回 null」是有意的：技能按钮的可点状态必须和真实结算一致。
 * 允许点一个放不出东西的按钮，玩家会以为自己把机会用掉了（毕竟冷却条是他唯一的凭据），
 * 而实际上什么都没发生。
 */
export function skillAiming(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
  slot: SkillSlot = 'main',
): SkillAiming | null {
  const def = effectiveUnitDef(self, defs);
  const spec = readySlotSpec(self, def, slot);
  if (!spec || spec.timing === 'passive') return null;

  const base = {
    slot,
    skillId: spec.id,
    skillName: skillCastName(self, spec),
    kind: spec.displayKind,
    aimCells: [] as Vec2[],
  };
  switch (spec.shape.type) {
    case 'neighborAoE': {
      const foes = foesAtManhattan(self, units, spec.shape.manhattan);
      if (foes.length === 0) return null;
      const rangeCells = cellsAtManhattan(self.pos, spec.shape.manhattan, terrain);
      // 自身 AoE：点范围内任意格确认释放（选的是范围，不是点某个敌人）
      return {
        ...base,
        rangeCells,
        candidates: [],
        aimCells: rangeCells,
        autoTargets: foes.map((f) => f.uid),
      };
    }
    case 'discAoE': {
      const foes = foesWithinManhattan(self, units, spec.shape.radius);
      if (foes.length === 0) return null;
      const rangeCells = cellsWithinManhattan(self.pos, spec.shape.radius, terrain);
      return {
        ...base,
        rangeCells,
        candidates: [],
        aimCells: rangeCells,
        autoTargets: foes.map((f) => f.uid),
      };
    }
    case 'neighborPickLowest':
    case 'neighborPickFoe': {
      const foes = foesAtManhattan(self, units, spec.shape.manhattan);
      if (foes.length === 0) return null;
      return {
        ...base,
        rangeCells: cellsAtManhattan(self.pos, spec.shape.manhattan, terrain),
        candidates: foes.map((f) => f.uid),
        autoTargets: [],
      };
    }
    case 'neighborPickAlly': {
      const allies = alliesAtManhattanExcludingSelf(self, units, spec.shape.manhattan);
      if (allies.length === 0) return null;
      return {
        ...base,
        rangeCells: cellsAtManhattan(self.pos, spec.shape.manhattan, terrain),
        candidates: allies.map((a) => a.uid),
        autoTargets: [],
      };
    }
    case 'lineBestRayAllFoes': {
      // 点射线上的格子选方向；该方向上所有敌人生效（不是点某个敌人打单体）
      const cells: Vec2[] = [];
      const hitUids: string[] = [];
      for (const d of RAY_DIRS) {
        const line = enemiesOnRay(self, self.pos, d, units, terrain);
        if (line.length === 0) continue;
        cells.push(...rayCellsFrom(self.pos, d, terrain));
        hitUids.push(...line.map((t) => t.uid));
      }
      if (cells.length === 0) return null;
      return {
        ...base,
        rangeCells: cells,
        candidates: [],
        aimCells: cells,
        autoTargets: hitUids,
      };
    }
    case 'selfCast':
      // 点技能即放，不进瞄准；高亮自身脚下示意「对自己」
      return {
        ...base,
        rangeCells: [{ ...self.pos }],
        candidates: [],
        aimCells: [],
        autoTargets: [self.uid],
      };
  }
}

/**
 * 人工模式施放技能。和 `trySkill*` 的区别是**不看 `timing`**。
 *
 * `beforeMove` / `afterMove` 是给 AI 排流程用的内部提示（先炸再走，还是走完再射）。
 * 对人来说这个区分毫无意义且不可见：玩家只知道「我这回合要放这一招」，
 * 移动前后都该允许，否则同一个按钮会在同一回合的两个瞬间给出不同答案。
 */
export function castSkillManual(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
  targetUid?: string,
  slot: SkillSlot = 'main',
  aimCell?: Vec2,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  const spec = readySlotSpec(self, def, slot);
  if (!spec || spec.timing === 'passive') return [];
  return commitCast(
    self,
    slot,
    spec,
    castByShape(self, def, spec, units, terrain, defs, targetUid, aimCell),
  );
}

function castByShape(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  targetUid?: string,
  aimCell?: Vec2,
): BattleEvent[] {
  switch (spec.shape.type) {
    case 'neighborAoE':
      return castAreaAoE(self, def, spec, units, terrain, defs, {
        kind: 'ring',
        dist: spec.shape.manhattan,
      });
    case 'discAoE':
      return castAreaAoE(self, def, spec, units, terrain, defs, {
        kind: 'disc',
        radius: spec.shape.radius,
      });
    case 'neighborPickLowest':
      return castNeighborPickLowest(
        self, def, spec, units, terrain, defs, spec.shape.manhattan, targetUid,
      );
    case 'neighborPickFoe':
      return castNeighborPickFoe(
        self, def, spec, units, terrain, defs, spec.shape.manhattan, spec.shape.pick, targetUid,
      );
    case 'neighborPickAlly':
      return castNeighborPickAlly(
        self, def, spec, units, terrain, defs, spec.shape.manhattan, spec.shape.pick, targetUid,
      );
    case 'lineBestRayAllFoes':
      return castLineBestRay(self, def, spec, units, terrain, defs, targetUid, aimCell);
    case 'selfCast':
      return castSelfCast(self, spec);
  }
}
