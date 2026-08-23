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
import { guardNote, terrainAttackNote, terrainDefenseNote } from './damage';
import { computeSkillHitDamage, isExecuting } from './skillDamage';
import {
  applySkillCastAllyEffects,
  applySkillCastFoeEffects,
  applySkillCastSelfEffects,
} from './timedBattleEffects';
import { canProfessionEquipSkill, getSkillSpec, type SkillSpec } from '@/data/skillCatalog';
import { effectiveSkillSpec } from '@/data/skillModCatalog';
import { gridSize, inBounds, manhattan, neighbors4, type TerrainGrid } from './grid';
import { rayCellsUntilBlocked } from './sight';
import { axisDirection, displaceLanding, displaceUnit } from './displace';
import type { TerrainRuntime } from './terrainDynamics';

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

/**
 * 这一招的射线最多推进几格；`undefined` = 不限。
 *
 * 单开一个取值口是因为射程要经过词条：`effectiveSkillSpec` 之后 `shape` 上的
 * `range` 才是这一场真正的射程（希尔的两条专属纹章分别把它抬到 5 和无限）。
 * 任何一处直接读技能表原值，表现就是「装了纹章但射不到那么远」。
 */
function rayRangeOf(spec: SkillSpec): number | undefined {
  return spec.shape.type === 'lineBestRayAllFoes' ? spec.shape.range : undefined;
}

function enemiesOnRay(
  self: UnitState,
  from: Vec2,
  dir: Vec2,
  units: UnitState[],
  terrain: TerrainGrid,
  range?: number,
): UnitState[] {
  const out: UnitState[] = [];
  // 和 `rayCellsFrom` 共用同一条「到哪里为止」的规则：命中判定和高亮范围必须同源，
  // 否则会出现「高亮画到墙后面但打不到那儿的人」，玩家只会认为范围提示是骗人的
  for (const p of rayCellsUntilBlocked(from, dir, terrain, range)) {
    const occ = units.find((u) => u.hp > 0 && u.pos.x === p.x && u.pos.y === p.y);
    if (occ && occ.faction !== self.faction) out.push(occ);
  }
  return out;
}

function rayCellsFrom(from: Vec2, dir: Vec2, terrain: TerrainGrid, range?: number): Vec2[] {
  return rayCellsUntilBlocked(from, dir, terrain, range);
}

function bestLinePick(
  self: UnitState,
  from: Vec2,
  units: UnitState[],
  terrain: TerrainGrid,
  range?: number,
): { targets: UnitState[]; rangeCells: Vec2[] } {
  let bestTargets: UnitState[] = [];
  let bestCells: Vec2[] = [];
  let bestScore = -1;
  for (const d of RAY_DIRS) {
    const line = enemiesOnRay(self, from, d, units, terrain, range);
    const cells = rayCellsFrom(from, d, terrain, range);
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

/** 同行或同列（含重合，调用方自行排除自身格） */
function onAxis(a: Vec2, b: Vec2): boolean {
  return a.x === b.x || a.y === b.y;
}

/**
 * `axisOnly` 的收窄：只留同行同列的格 / 敌人。
 *
 * 带 `onHitDisplace` 的技能必须走这一层，因为位移方向是「施法者 → 目标」的延长线，
 * 而格子是四向的：斜向目标算不出唯一的「背后」。收窄要同时作用在**候选目标**和
 * **高亮格**上——只收其一的表现是「高亮画了 8 格但点其中 4 格没反应」，
 * 玩家只会认为这一招时灵时不灵。
 */
function axisFilter<T>(items: T[], self: Vec2, posOf: (t: T) => Vec2, axisOnly?: boolean): T[] {
  if (!axisOnly) return items;
  return items.filter((t) => onAxis(posOf(t), self));
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

/**
 * 覆盖以自身为心的方形（切比雪夫 <= r），**含四个斜角**，不含自身格。
 *
 * 曼哈顿距离量不出「贴着我站」这件事：斜角邻居的曼哈顿距离是 2，和隔一格的正对面
 * 一样远。所以 `neighborAoE manhattan:1` 和 `discAoE radius:1` 打到的是**同一批人**
 * ——都只有正交四格。旋风斩那种 360° 环形特效画的是整个 3×3，
 * 用这两个形状里的任何一个都会漏掉斜角，正是《特效圣经》§4.6 禁止的
 * 「特效比实际范围大」。要让贴身一圈真的是一圈，得换一把尺子。
 */
function cellsWithinChebyshev(center: Vec2, radius: number, terrain: TerrainGrid): Vec2[] {
  const { w, h } = gridSize(terrain);
  const out: Vec2[] = [];
  for (let y = Math.max(0, center.y - radius); y <= Math.min(h - 1, center.y + radius); y++) {
    for (let x = Math.max(0, center.x - radius); x <= Math.min(w - 1, center.x + radius); x++) {
      if (x === center.x && y === center.y) continue;
      out.push({ x, y });
    }
  }
  return out;
}

function foesWithinChebyshev(self: UnitState, units: UnitState[], radius: number): UnitState[] {
  return livingFoes(self, units).filter((t) => {
    const dx = Math.abs(t.pos.x - self.pos.x);
    const dy = Math.abs(t.pos.y - self.pos.y);
    return (dx !== 0 || dy !== 0) && dx <= radius && dy <= radius;
  });
}

/** 含中心格的曼哈顿圆盘。选点爆炸打得到落点上站着的人，所以中心必须算进去 */
function cellsDiscInclusive(center: Vec2, radius: number, terrain: TerrainGrid): Vec2[] {
  const { w, h } = gridSize(terrain);
  const out: Vec2[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (manhattan({ x, y }, center) <= radius) out.push({ x, y });
    }
  }
  return out;
}

function foesInDisc(center: Vec2, radius: number, self: UnitState, units: UnitState[]): UnitState[] {
  return livingFoes(self, units).filter((t) => manhattan(t.pos, center) <= radius);
}

/**
 * AI 选爆炸中心：优先命中人数，同分打总血量更高的那一簇。
 *
 * 没有这一步的话 `castByShape` 在 AI 路径上拿不到 `aimCell`，选点 AoE 会一声不响地不放。
 */
function pickBestGroundCell(
  self: UnitState,
  units: UnitState[],
  terrain: TerrainGrid,
  castRange: number,
  blastRadius: number,
): Vec2 | null {
  const candidates = [{ ...self.pos }, ...cellsWithinManhattan(self.pos, castRange, terrain)];
  let best: Vec2 | null = null;
  let bestCount = 0;
  let bestHp = -1;
  for (const c of candidates) {
    const foes = foesInDisc(c, blastRadius, self, units);
    if (foes.length === 0) continue;
    const hp = foes.reduce((s, t) => s + t.hp, 0);
    if (foes.length > bestCount || (foes.length === bestCount && hp > bestHp)) {
      best = c;
      bestCount = foes.length;
      bestHp = hp;
    }
  }
  return best;
}

function alliesAtManhattanExcludingSelf(self: UnitState, units: UnitState[], dist: number): UnitState[] {
  return livingAllies(self, units).filter(
    (u) => u.uid !== self.uid && manhattan(u.pos, self.pos) === dist,
  );
}

function alliesWithinManhattanExcludingSelf(
  self: UnitState,
  units: UnitState[],
  radius: number,
): UnitState[] {
  return livingAllies(self, units).filter((u) => {
    if (u.uid === self.uid) return false;
    const d = manhattan(u.pos, self.pos);
    return d > 0 && d <= radius;
  });
}

/**
 * 调用方没指定目标时的策略回退。点谁不是技能字段——玩家点谁打谁，
 * AI 才按这条规则选。口径和普攻 normal 对齐：敌人打最低血；
 * 治疗/护盾救最低血；纯增益给攻击最高的人。
 */
function fallbackSkillTarget(
  spec: SkillSpec,
  pool: UnitState[],
  defs: Record<UnitKind, UnitArchetypeDef>,
): UnitState | undefined {
  if (pool.length === 0) return undefined;
  if (spec.shape.type === 'neighborPickAlly') {
    const protect = spec.onCastAllyEffects?.some((e) => e.kind === 'heal' || e.kind === 'guard');
    if (protect) return pool.reduce((a, b) => (a.hp <= b.hp ? a : b));
    return pool.reduce((a, b) =>
      (effectiveUnitDef(a, defs).atk >= effectiveUnitDef(b, defs).atk ? a : b),
    );
  }
  return pool.reduce((a, b) => (a.hp <= b.hp ? a : b));
}

/**
 * 玩家指定的目标优先，否则退回 AI 策略。
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
 * 单位这一场实际生效的技能规格 = 技能表原始规格 + 词条（**仅主技能**）。
 *
 * 所有施放路径（AI 的 before/afterMove、人工的 castSkillManual、瞄准预览）都必须
 * 从这里拿规格。任何一处漏用，表现是「这个技能在某些情况下不吃词条」——
 * 伤害数字看着正常，只是偏小，肉眼几乎发现不了。
 *
 * **词条只强化主技能。** 临时技能是局内买来的第二个选项，让它也吃满词条的话，
 * 玩家一路攒的投入会分摊到两招上，而三选一卡面只能画其中一招——
 * 卡上写着「惊扰蜂群 · 锋锐」，实际上主技能也在吃这 25%，那张卡就是在撒谎。
 * 收敛到主技能之后，卡面画的那一招**就是**唯一被改的那一招。
 */
export function unitSkillSpec(self: UnitState, skillId: string): SkillSpec | undefined {
  const base = getSkillSpec(skillId);
  if (!base) return undefined;
  return effectiveSkillSpec(base, mainSkillMods(self, skillId));
}

/**
 * 这一招该不该吃这个单位的词条：只有主槽那一招吃。
 *
 * 判据是「等于主槽的 id」而不是「不等于临时槽的 id」。两者在主槽和临时槽
 * 装了同一招时（通用技能允许这样，商店只挡了「重复买同一个临时技能」）会分岔：
 * 反向判据那时会把**主技能**也算成临时的，玩家一路攒的词条当场全失效——
 * 而正向判据最坏只是让那一招在两个槽里表现一致，本来也是同一招。
 *
 * 敌方也走这条：Boss 的皮肤只换显示名，结算 id 仍写在 `battleSkill.id` 上
 * （见 `skillCastName`），所以 Boss 强化词条照样生效。
 */
function mainSkillMods(self: UnitState, skillId: string): readonly string[] | undefined {
  return self.battleSkill?.id === skillId ? self.skillMods : undefined;
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
      } else if (e.kind === 'spdBonus') {
        events.push({ type: 'statusNote', target: who.self.uid, text: `速+${e.addSpd}`, tone: 'buff' });
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
  // 处决要在扣血**之前**判：它读的是命中那一刻的血量
  const modNote = hitModNote(spec, tgt, defs);
  const damage = skillHitDamage(self, def, spec, tgt, terrain, defs);
  tgt.hp -= damage;
  return {
    target: tgt.uid,
    damage,
    hpLeft: Math.max(0, tgt.hp),
    defTerrainNote: terrainDefenseNote(terrain, tgt.pos) ?? undefined,
    guardNote: guardNote(effectiveUnitDef(tgt, defs)) ?? undefined,
    modNote,
    poisoned: specAppliesPoison(spec) || undefined,
  };
}

/**
 * 这一招会不会给挨打的人挂**中毒**（紫雾）。
 *
 * 霜噬等冻伤也走同一条扣血结算，但描述不是中毒，不能叠紫雾。
 * 溅射不走这条——毒只落在真正吃到 foe 效果的目标上。
 */
export function specAppliesPoison(spec: SkillSpec): boolean {
  return spec.onCastFoeEffects?.some((e) => e.kind === 'poison' && e.theme !== 'frost') ?? false;
}

/**
 * 这一击上有没有**条件触发**的词条要报给玩家。
 *
 * 只收条件型的：处决打的是残血目标，触发与否取决于当时的血量，不说出来玩家
 * 就只看到一个更大的数字、没有对照。每次都生效的数值词条（锋锐）不进来——
 * 那种飘字只会挤掉真正要读的信息。
 */
function hitModNote(
  spec: SkillSpec,
  tgt: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
): string | undefined {
  // maxHp 走 effectiveUnitDef，和 computeSkillHitDamage 里那次判定读同一个数
  return isExecuting(spec, tgt.hp, effectiveUnitDef(tgt, defs).maxHp) ? '处决' : undefined;
}

/**
 * 「溅射」词条：单体技能额外打到主目标邻格的敌人。
 *
 * 溅射伤害按**各自**重新算一遍再打折，不是拿主目标的数字乘比例：克制关系、地形减伤
 * 都跟站位有关，直接乘会出现「打到森林里的弓手和打到空地上的一样疼」。
 *
 * 默认尺子是曼哈顿 = 1（正交四格）。`splashChebyshev` 改切比雪夫 = 1（周围八格），
 * 给炎弹「爆炎」这类要铺满一圈余波的专属用——通用溅射不能跟着加大，否则贯枪会被静默加强。
 */
function resolveSplashHits(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  main: UnitState,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
): SkillHit[] {
  const ratio = spec.splashRatio ?? 0;
  if (ratio <= 0 || spec.damage.kind === 'none') return [];
  const out: SkillHit[] = [];
  for (const t of livingFoes(self, units)) {
    if (t.uid === main.uid) continue;
    const dx = Math.abs(t.pos.x - main.pos.x);
    const dy = Math.abs(t.pos.y - main.pos.y);
    const inRing = spec.splashChebyshev
      ? (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1
      : manhattan(t.pos, main.pos) === 1;
    if (!inRing) continue;
    const modNote = hitModNote(spec, t, defs);
    const full = skillHitDamage(self, def, spec, t, terrain, defs);
    const damage = Math.max(1, Math.floor(full * ratio));
    t.hp -= damage;
    out.push({
      target: t.uid,
      damage,
      hpLeft: Math.max(0, t.hp),
      defTerrainNote: terrainDefenseNote(terrain, t.pos) ?? undefined,
      guardNote: guardNote(effectiveUnitDef(t, defs)) ?? undefined,
      modNote,
      splash: true,
    });
  }
  return out;
}

/** 溅射打到的人也要能死、也要飘字，靠 uid 找回单位 */
function pushHitDeaths(events: BattleEvent[], units: UnitState[], hits: readonly SkillHit[]): void {
  for (const h of hits) {
    const t = units.find((u) => u.uid === h.target);
    if (t) pushDeathIfNeeded(events, t);
  }
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
  area:
    | { kind: 'ring'; dist: number }
    | { kind: 'disc'; radius: number }
    | { kind: 'square'; radius: number },
  allowNoFoes = false,
): BattleEvent[] {
  const foes =
    area.kind === 'ring'
      ? foesAtManhattan(self, units, area.dist)
      : area.kind === 'square'
        ? foesWithinChebyshev(self, units, area.radius)
        : foesWithinManhattan(self, units, area.radius);
  if (foes.length === 0 && !allowNoFoes) return [];
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
          : area.kind === 'square'
            ? cellsWithinChebyshev(self.pos, area.radius, terrain)
            : cellsWithinManhattan(self.pos, area.radius, terrain),
      vfxId: spec.vfxId,
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

function castGroundPickAoE(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  castRange: number,
  blastRadius: number,
  aimCell: Vec2 | undefined,
  allowNoFoes: boolean,
): BattleEvent[] {
  const inRange = (p: Vec2): boolean => manhattan(p, self.pos) <= castRange && inBounds(p, terrain);
  const center = aimCell && inRange(aimCell)
    ? { ...aimCell }
    : pickBestGroundCell(self, units, terrain, castRange, blastRadius);
  if (!center) return [];
  const foes = foesInDisc(center, blastRadius, self, units);
  if (foes.length === 0 && !allowNoFoes) return [];
  const hits: SkillHit[] = [];
  for (const t of foes) {
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
      rangeCells: cellsDiscInclusive(center, blastRadius, terrain),
      aimCell: { ...center },
      vfxId: spec.vfxId,
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
      vfxId: spec.vfxId,
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

function castNeighborPickFoe(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  dist: number,
  chosenUid?: string,
  reach: 'exact' | 'within' = 'exact',
  axisOnly?: boolean,
): BattleEvent[] {
  const within = reach === 'within';
  const all = within
    ? foesWithinManhattan(self, units, dist)
    : foesAtManhattan(self, units, dist);
  const foes = axisFilter(all, self.pos, (t) => t.pos, axisOnly);
  const tgt = resolveChoice(foes, chosenUid, () => fallbackSkillTarget(spec, foes, defs));
  if (!tgt) return [];
  // 纯 debuff（破甲/缠足）：保留 hit 供回放对准目标，但不走扣血
  const hits: SkillHit[] =
    spec.damage.kind === 'none'
      ? [{ target: tgt.uid, damage: 0, hpLeft: tgt.hp }]
      : [
          resolveHit(self, def, spec, tgt, terrain, defs),
          ...resolveSplashHits(self, def, spec, tgt, units, terrain, defs),
        ];
  const baseCells = within
    ? cellsWithinManhattan(self.pos, dist, terrain)
    : cellsAtManhattan(self.pos, dist, terrain);
  const events: BattleEvent[] = [
    {
      type: 'skillCast',
      uid: self.uid,
      skillId: spec.id,
      skillName: skillCastName(self, spec),
      kind: spec.displayKind,
      // 跟着 reach / axisOnly 走：回放高亮的格子和实际打得到的格子不一致，
      // 玩家会照着高亮记这一招的射程，然后在下一场里点空
      rangeCells: axisFilter(baseCells, self.pos, (c) => c, axisOnly),
      vfxId: spec.vfxId,
      hits,
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
    },
  ];
  pushHitDeaths(events, units, hits);
  applySkillCastFoeEffects(tgt, spec);
  applySkillCastSelfEffects(self, spec);
  pushAttrNotes(events, spec, { self, foes: [tgt] });
  pushLifesteal(self, spec, hits, defs, events);
  const push = resolveOnHitDisplace(self, spec, tgt, units, terrain, defs, Boolean(chosenUid));
  if (push) events.push(push);
  return events;
}

/**
 * 命中后的强制位移：突进（移动施法者）或击退（移动目标）。
 *
 * 两者的落点都从**目标格**往外量，所以突进要走的总格数是
 * 「到目标的距离 + 穿过去几格」，并且允许穿过目标本人（`ignoreUids`）——
 * 只写 `cells` 格的话岚骑会停在目标脸上，那不是突刺是撞车。
 *
 * 突进后置 `movedInTurn`：岚骑的固定连招是「捅穿过去 + 顺势冲锋一刀」，
 * 冲锋纹章因此近乎每回合生效。这是刻意的，它不再是一个条件判断，
 * 而是这个角色的身份。
 */
function resolveOnHitDisplace(
  self: UnitState,
  spec: SkillSpec,
  tgt: UnitState,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  playerPicked: boolean,
): BattleEvent | null {
  const push = spec.onHitDisplace;
  if (!push) return null;
  const dir = axisDirection(self.pos, tgt.pos);
  if (!dir) return null;
  if (push.who === 'target') {
    if (!playerPicked && !aiWantsKnockback(self, tgt, dir, push.cells, units, terrain, defs)) {
      return null;
    }
    return displaceUnit(tgt, dir, push.cells, units, terrain, 'knockback');
  }
  const total = manhattan(self.pos, tgt.pos) + push.cells;
  const ev = displaceUnit(self, dir, total, units, terrain, 'dash', [tgt.uid]);
  if (ev) self.movedInTurn = true;
  return ev;
}

/**
 * 托管 / 自动不会点名，震击「够得着就放」会把唯一的敌人往角落推。
 * 第一章 Boss 是消耗战，多走两格就是多挨一整轮——裸打从设计窗掉到 10% 以下。
 *
 * 玩家点了谁就照推：他自己看见落点。AI 只在击退不拆掉围殴、或能保后排时才推。
 */
function aiWantsKnockback(
  self: UnitState,
  tgt: UnitState,
  dir: Vec2,
  cells: number,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
): boolean {
  const occupied = new Set(
    units.filter((u) => u.hp > 0 && u.uid !== tgt.uid).map((u) => `${u.pos.x},${u.pos.y}`),
  );
  const landing = displaceLanding(tgt.pos, dir, cells, terrain, occupied);
  if (!landing) return false;
  const traveled = manhattan(tgt.pos, landing);
  if (traveled < cells) return true;

  for (const u of livingAllies(self, units)) {
    if (u.uid === self.uid) continue;
    const d = effectiveUnitDef(u, defs);
    if ((d.isRanged || u.defId === 'healer') && manhattan(u.pos, tgt.pos) <= 1) {
      return true;
    }
  }

  const mates = livingAllies(self, units);
  const ax = mates.reduce((s, u) => s + u.pos.x, 0) / mates.length;
  const ay = mates.reduce((s, u) => s + u.pos.y, 0) / mates.length;
  return manhattan({ x: ax, y: ay }, landing) <= manhattan({ x: ax, y: ay }, tgt.pos);
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
  chosenUid?: string,
  reach?: 'exact' | 'within',
): BattleEvent[] {
  const within = reach === 'within';
  const allies = within
    ? alliesWithinManhattanExcludingSelf(self, units, dist)
    : alliesAtManhattanExcludingSelf(self, units, dist);
  const tgt = resolveChoice(allies, chosenUid, () => fallbackSkillTarget(spec, allies, defs));
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
      rangeCells: within
        ? cellsWithinManhattan(self.pos, dist, terrain)
        : cellsAtManhattan(self.pos, dist, terrain),
      vfxId: spec.vfxId,
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
  range?: number,
): { targets: UnitState[]; rangeCells: Vec2[] } | null {
  for (const d of RAY_DIRS) {
    const line = enemiesOnRay(self, from, d, units, terrain, range);
    if (line.some((t) => t.uid === chosenUid)) {
      return { targets: line, rangeCells: rayCellsFrom(from, d, terrain, range) };
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
  range?: number,
): { targets: UnitState[]; rangeCells: Vec2[] } | null {
  for (const d of RAY_DIRS) {
    const cells = rayCellsFrom(from, d, terrain, range);
    if (!cells.some((c) => c.x === cell.x && c.y === cell.y)) continue;
    return {
      targets: enemiesOnRay(self, from, d, units, terrain, range),
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
  const range = rayRangeOf(spec);
  const picked = aimCell
    ? rayPickThroughCell(self, self.pos, aimCell, units, terrain, range)
    : chosenUid
      ? rayPickThrough(self, self.pos, chosenUid, units, terrain, range)
      : null;
  const { targets: line, rangeCells } =
    picked ?? bestLinePick(self, self.pos, units, terrain, range);
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
      vfxId: spec.vfxId,
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
function commitCast(
  self: UnitState,
  slot: SkillSlot,
  spec: SkillSpec,
  events: BattleEvent[],
  tr?: TerrainRuntime,
): BattleEvent[] {
  if (!events.some((e) => e.type === 'skillCast')) return [];
  setSlotCd(self, slot, spec.cooldown);
  const terrainEvents = applyCastTerrainEffects(spec, events, tr);
  return terrainEvents.length ? [...events, ...terrainEvents] : events;
}

/**
 * 技能改地形（目前只有点燃）。挂在 `commitCast` 上和冷却同一个道理：
 * 这里是「真的放出去了」的唯一判定点，散到各个 `cast*` 里迟早会漏。
 *
 * 作用域取 `skillCast` 事件的 `rangeCells`。注意这只对 **AoE 形状**才等于真实作用域
 * ——单体点名形状的 `rangeCells` 是整个瞄准环（见 `castNeighborPickFoe`），
 * 拿它点燃会烧掉一整圈。所以改地形的词条在 `canApply` 里限定了只能挂 AoE 技能，
 * 这条规则才能一直是诚实的。
 */
function applyCastTerrainEffects(
  spec: SkillSpec,
  events: BattleEvent[],
  tr?: TerrainRuntime,
): BattleEvent[] {
  const effects = spec.onCastTerrainEffects;
  if (!tr || !effects?.length) return [];
  const cast = events.find((e) => e.type === 'skillCast');
  if (cast?.type !== 'skillCast') return [];
  const out: BattleEvent[] = [];
  for (const eff of effects) {
    if (eff.kind === 'ignite') out.push(...tr.ignite(cast.rangeCells));
  }
  return out;
}

export function trySkillBeforeMove(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
  tr?: TerrainRuntime,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  for (const slot of CAST_ORDER) {
    const spec = readySlotSpec(self, def, slot);
    if (!spec || spec.timing !== 'beforeMove') continue;
    const events = commitCast(
      self, slot, spec, castByShape(self, def, spec, units, terrain, defs), tr,
    );
    if (events.length) return events;
  }
  return [];
}

export function trySkillAfterMove(
  self: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
  units: UnitState[],
  terrain: TerrainGrid,
  tr?: TerrainRuntime,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  for (const slot of CAST_ORDER) {
    const spec = readySlotSpec(self, def, slot);
    if (!spec || spec.timing !== 'afterMove') continue;
    const events = commitCast(
      self, slot, spec, castByShape(self, def, spec, units, terrain, defs), tr,
    );
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
    // 会改地形的 AoE 不要求范围里有敌人，理由见 `changesTerrain`。
    // 瞄准这一侧也得放开，否则按钮会一直是「没目标」的灰态——玩家根本按不下去。
    case 'neighborAoE': {
      const foes = foesAtManhattan(self, units, spec.shape.manhattan);
      if (foes.length === 0 && !changesTerrain(spec)) return null;
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
    case 'squareAoE': {
      const foes = foesWithinChebyshev(self, units, spec.shape.radius);
      if (foes.length === 0 && !changesTerrain(spec)) return null;
      const rangeCells = cellsWithinChebyshev(self.pos, spec.shape.radius, terrain);
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
      if (foes.length === 0 && !changesTerrain(spec)) return null;
      const rangeCells = cellsWithinManhattan(self.pos, spec.shape.radius, terrain);
      return {
        ...base,
        rangeCells,
        candidates: [],
        aimCells: rangeCells,
        autoTargets: foes.map((f) => f.uid),
      };
    }
    case 'neighborPickFoe': {
      const within = spec.shape.reach === 'within';
      const d = spec.shape.manhattan;
      const axis = spec.shape.axisOnly;
      const all = within ? foesWithinManhattan(self, units, d) : foesAtManhattan(self, units, d);
      const foes = axisFilter(all, self.pos, (f) => f.pos, axis);
      if (foes.length === 0) return null;
      const cells = within
        ? cellsWithinManhattan(self.pos, d, terrain)
        : cellsAtManhattan(self.pos, d, terrain);
      return {
        ...base,
        rangeCells: axisFilter(cells, self.pos, (c) => c, axis),
        candidates: foes.map((f) => f.uid),
        autoTargets: [],
      };
    }
    case 'neighborPickAlly': {
      const within = spec.shape.reach === 'within';
      const d = spec.shape.manhattan;
      const allies = within
        ? alliesWithinManhattanExcludingSelf(self, units, d)
        : alliesAtManhattanExcludingSelf(self, units, d);
      if (allies.length === 0) return null;
      return {
        ...base,
        rangeCells: within
          ? cellsWithinManhattan(self.pos, d, terrain)
          : cellsAtManhattan(self.pos, d, terrain),
        candidates: allies.map((a) => a.uid),
        autoTargets: [],
      };
    }
    case 'groundPickAoE': {
      const { castRange, blastRadius } = spec.shape;
      const pickCells = [{ ...self.pos }, ...cellsWithinManhattan(self.pos, castRange, terrain)];
      const hitUids = new Set<string>();
      const useful: Vec2[] = [];
      for (const c of pickCells) {
        const foes = foesInDisc(c, blastRadius, self, units);
        if (foes.length === 0 && !changesTerrain(spec)) continue;
        useful.push(c);
        for (const f of foes) hitUids.add(f.uid);
      }
      if (useful.length === 0) return null;
      return {
        ...base,
        rangeCells: pickCells,
        candidates: [],
        aimCells: useful,
        autoTargets: [...hitUids],
      };
    }
    case 'lineBestRayAllFoes': {
      // 点射线上的格子选方向；该方向上所有敌人生效（不是点某个敌人打单体）
      const range = spec.shape.range;
      const cells: Vec2[] = [];
      const hitUids: string[] = [];
      for (const d of RAY_DIRS) {
        const line = enemiesOnRay(self, self.pos, d, units, terrain, range);
        if (line.length === 0) continue;
        cells.push(...rayCellsFrom(self.pos, d, terrain, range));
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
  tr?: TerrainRuntime,
): BattleEvent[] {
  const def = effectiveUnitDef(self, defs);
  const spec = readySlotSpec(self, def, slot);
  if (!spec || spec.timing === 'passive') return [];
  return commitCast(
    self,
    slot,
    spec,
    castByShape(self, def, spec, units, terrain, defs, targetUid, aimCell, changesTerrain(spec)),
    tr,
  );
}

/**
 * 会改地形的 AoE 技能，范围里没有敌人时**也能放**——但只在人工模式下。
 *
 * 放开是因为这类技能的主要用法本来就是对着空地：烧掉隘口的林子断敌人的路、
 * 提前拆掉他们要躲进去的掩体。要求范围内有人，等于把「布置战场」这个用法整个删掉，
 * 只剩下「敌人已经贴上来了才点火」，而那时候火烧不烧都快打完了。
 *
 * 不放开托管/自动那两条路径（`trySkill*`）是因为它们的判断是「够得着就放」，
 * 没有「这一格值不值得烧」的概念——放开后自动模式会一到冷却就把脚边点着，
 * 既浪费施放额度，又会把自己人架在火上。托管少用一招是可接受的退化，
 * 自动纵火不是。
 */
function changesTerrain(spec: SkillSpec): boolean {
  return Boolean(spec.onCastTerrainEffects?.length);
}

/**
 * 按形状分发到对应的 `cast*`。三条施放路径（AI 的 before/afterMove、人工）共用这一处，
 * 所以 switch **必须覆盖全部形状**（不写 `default`，漏了形状就是编译错误）。
 *
 * AI 那两条路径原先没走这里：`trySkillAfterMove` 硬写 `shape.type !== 'lineBestRayAllFoes'
 * continue`，另有一份漏了射线的 switch 给 beforeMove 用。当时能跑只是因为 afterMove
 * 恰好只有弓系射线技能。给 afterMove 技能换形状（把「速射」改成点名单体）时，
 * AI 会**一声不响地不放这一招**：人工模式正常，自动模式废掉，
 * 而这种漏放要跑完整章胜率回归才看得出来。
 *
 * 合到一处之后，形状和 `timing` 是两个自由维度，新技能想配什么组合都行。
 */
function castByShape(
  self: UnitState,
  def: UnitDef,
  spec: SkillSpec,
  units: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  targetUid?: string,
  aimCell?: Vec2,
  allowNoFoes = false,
): BattleEvent[] {
  switch (spec.shape.type) {
    case 'neighborAoE':
      return castAreaAoE(self, def, spec, units, terrain, defs, {
        kind: 'ring',
        dist: spec.shape.manhattan,
      }, allowNoFoes);
    case 'discAoE':
      return castAreaAoE(self, def, spec, units, terrain, defs, {
        kind: 'disc',
        radius: spec.shape.radius,
      }, allowNoFoes);
    case 'squareAoE':
      return castAreaAoE(self, def, spec, units, terrain, defs, {
        kind: 'square',
        radius: spec.shape.radius,
      }, allowNoFoes);
    case 'neighborPickFoe':
      return castNeighborPickFoe(
        self, def, spec, units, terrain, defs,
        spec.shape.manhattan, targetUid, spec.shape.reach, spec.shape.axisOnly,
      );
    case 'neighborPickAlly':
      return castNeighborPickAlly(
        self, def, spec, units, terrain, defs,
        spec.shape.manhattan, targetUid, spec.shape.reach,
      );
    case 'groundPickAoE':
      return castGroundPickAoE(
        self, def, spec, units, terrain, defs,
        spec.shape.castRange, spec.shape.blastRadius, aimCell, allowNoFoes,
      );
    case 'lineBestRayAllFoes':
      return castLineBestRay(self, def, spec, units, terrain, defs, targetUid, aimCell);
    case 'selfCast':
      return castSelfCast(self, spec);
  }
}
