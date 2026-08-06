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
    hits.push(resolveHit(self, def, spec, t, terrain, defs));
    applySkillCastFoeEffects(t, spec);
  }
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells:
        area.kind === 'ring'
          ? cellsAtManhattan(self.pos, area.dist, terrain)
          : cellsWithinManhattan(self.pos, area.radius, terrain),
      hits,
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  for (const t of foes) pushDeathIfNeeded(events, t);
  applySkillCastSelfEffects(self, spec);
  pushLifesteal(self, spec, hits, defs, events);
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
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits: [hit],
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastFoeEffects(tgt, spec);
  applySkillCastSelfEffects(self, spec);
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
  const hit = resolveHit(self, def, spec, tgt, terrain, defs);
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits: [hit],
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastFoeEffects(tgt, spec);
  applySkillCastSelfEffects(self, spec);
  pushLifesteal(self, spec, [hit], defs, events);
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
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: spec.name,
      kind: spec.displayKind,
      rangeCells: cellsAtManhattan(self.pos, dist, terrain),
      hits: [resolveHit(self, def, spec, tgt, terrain, defs)],
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushDeathIfNeeded(events, tgt);
  applySkillCastAllyEffects(tgt, spec);
  pushAllyHeal(spec, tgt, defs, events);
  applySkillCastSelfEffects(self, spec);
  return events;
}

/**
 * 玩家点了某个敌人时，取穿过它的那条直线。
 *
 * 直线技能的选择本质是「朝哪个方向射」，但让玩家点方向箭头等于多教一套控件。
 * 点敌人则复用了「点目标」这个唯一的交互动词——射线自然由它所在的方向决定，
 * 顺带把同一条线上的其他敌人也一起打到，玩家看一眼高亮就懂了。
 */
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

function castLineBestRay(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  chosenUid?: string,
): BattleEvent[] {
  const picked = chosenUid ? rayPickThrough(self, self.pos, chosenUid, units, terrain) : null;
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
      skillName: spec.name,
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
  /** 瞄准范围高亮格 */
  rangeCells: Vec2[];
  /**
   * 需要玩家点选的目标 uid。
   *
   * **空数组表示不用选，直接放**——16 个技能里有 6 个是 AoE，它们打范围内全体，
   * 唯一的决策是站位和时机。给这类技能强行加一步「点目标」是凭空的操作成本。
   */
  candidates: string[];
  /** 无需选目标时会打到谁，用来在按钮上预告「命中 2 个」 */
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

  const base = { slot, skillId: spec.id, skillName: spec.name, kind: spec.displayKind };
  switch (spec.shape.type) {
    case 'neighborAoE': {
      const foes = foesAtManhattan(self, units, spec.shape.manhattan);
      if (foes.length === 0) return null;
      return {
        ...base,
        rangeCells: cellsAtManhattan(self.pos, spec.shape.manhattan, terrain),
        candidates: [],
        autoTargets: foes.map((f) => f.uid),
      };
    }
    case 'discAoE': {
      const foes = foesWithinManhattan(self, units, spec.shape.radius);
      if (foes.length === 0) return null;
      return {
        ...base,
        rangeCells: cellsWithinManhattan(self.pos, spec.shape.radius, terrain),
        candidates: [],
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
      // 四条射线上的所有敌人都能点，点谁就朝那个方向射（见 rayPickThrough）
      const cells: Vec2[] = [];
      const cands: string[] = [];
      for (const d of RAY_DIRS) {
        const line = enemiesOnRay(self, self.pos, d, units, terrain);
        if (line.length === 0) continue;
        cells.push(...rayCellsFrom(self.pos, d, terrain));
        cands.push(...line.map((t) => t.uid));
      }
      if (cands.length === 0) return null;
      return { ...base, rangeCells: cells, candidates: cands, autoTargets: [] };
    }
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
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  const spec = readySlotSpec(self, def, slot);
  if (!spec || spec.timing === 'passive') return [];
  return commitCast(self, slot, spec, castByShape(self, def, spec, units, terrain, defs, targetUid));
}

function castByShape(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  targetUid?: string,
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
      return castLineBestRay(self, def, spec, units, terrain, defs, targetUid);
  }
}
