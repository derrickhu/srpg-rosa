import { getCharacterDef } from '@/data/characterCatalog';
import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import { isEliteDungeon, officialDungeonIdOfElite } from '@/data/eliteCatalog';
import type { CharacterBaseStats } from '@/game/characterTypes';

/**
 * 跟人的永久专属纹章。
 *
 * 和局内三选一纹章（`skillModCatalog`）不是一类东西：
 * - 局内纹章挂技能、改 `SkillSpec`、出副本即弃，还要考虑「这枚能不能装在这招上」；
 * - 这里每一枚在表里就写死给谁，效果是这个人的永久被动，不进技能兼容层。
 *
 * 一个人可以有多枚。投放是「每章同一枚」：主线首通 1 级，同章精英首通升到 2 级。
 * 领过的 id / 等级记在 meta 上，不写在角色实例上——人还没入队也能先记账。
 */

export const PERSONAL_EMBLEM_MAX_LEVEL = 2;
/** 2 级固定值相对 1 级 */
const LEVEL2_STAT_MUL = 2;
/** 2 级百分比加成相对 1 级（+5% → +8%，−5% → −8%） */
const LEVEL2_BONUS_MUL = 1.6;

export type PersonalEmblemEffect =
  | { kind: 'stat'; maxHp?: number; atk?: number; spd?: number; move?: number }
  | { kind: 'skillDealtMul'; mul: number }
  | { kind: 'basicDealtMul'; mul: number }
  | { kind: 'takenMul'; mul: number }
  | { kind: 'healGivenMul'; mul: number };

export interface PersonalEmblemDef {
  id: string;
  name: string;
  /** 一句身份，不写数字；数字由 `describePersonalEmblem` 从效果现算 */
  blurb: string;
  rosterId: string;
  /** 绑定的主线章。精英首通升同一枚，不另开 id */
  dungeonId: string;
  icon: string;
  effects: readonly PersonalEmblemEffect[];
}

const DEFS: readonly PersonalEmblemDef[] = [
  {
    id: 'pe_ray_grassland',
    name: '草原开辟',
    blurb: '踏平草原后铭刻。旋风斩更锋利。',
    rosterId: 'hero_sword_ray',
    dungeonId: 'dungeon_grassland',
    icon: 'emblem_pe_grassland',
    effects: [
      { kind: 'stat', atk: 2 },
      { kind: 'skillDealtMul', mul: 1.05 },
    ],
  },
  {
    id: 'pe_hill_forest',
    name: '穿叶',
    blurb: '密林里练出的那一箭，离开林子也还在。',
    rosterId: 'hero_bow_hill',
    dungeonId: 'dungeon_forest',
    icon: 'emblem_pe_forest',
    effects: [
      { kind: 'stat', atk: 2 },
      { kind: 'basicDealtMul', mul: 1.05 },
    ],
  },
  {
    id: 'pe_gron_fortress',
    name: '城垣铁卫',
    blurb: '在墙下站过的人，挨打也更稳。',
    rosterId: 'hero_shield_gron',
    dungeonId: 'dungeon_fortress',
    icon: 'emblem_pe_fortress',
    effects: [
      { kind: 'stat', maxHp: 16 },
      { kind: 'takenMul', mul: 0.95 },
    ],
  },
  {
    id: 'pe_aoli_swamp',
    name: '沼火',
    blurb: '毒沼的火气收进法杖，技能更烫。',
    rosterId: 'hero_mage_aoli',
    dungeonId: 'dungeon_swamp',
    icon: 'emblem_pe_swamp',
    effects: [
      { kind: 'stat', atk: 3 },
      { kind: 'skillDealtMul', mul: 1.05 },
    ],
  },
  {
    id: 'pe_floe_dragon',
    name: '霜脊',
    blurb: '龙岭的寒风结在霜环上。',
    rosterId: 'hero_mage_floe',
    dungeonId: 'dungeon_dragon',
    icon: 'emblem_pe_dragon',
    effects: [
      { kind: 'stat', maxHp: 8 },
      { kind: 'skillDealtMul', mul: 1.05 },
    ],
  },
  {
    id: 'pe_mir_altar',
    name: '血契',
    blurb: '祭坛上学会的续命，带得出圣地。',
    rosterId: 'hero_healer_mir',
    dungeonId: 'dungeon_bloodfang',
    icon: 'emblem_pe_altar',
    effects: [
      { kind: 'stat', maxHp: 10 },
      { kind: 'healGivenMul', mul: 1.08 },
    ],
  },
];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

export function allPersonalEmblems(): readonly PersonalEmblemDef[] {
  return DEFS;
}

export function getPersonalEmblem(id: string): PersonalEmblemDef | undefined {
  return BY_ID.get(id);
}

export function personalEmblemsForRoster(rosterId: string): PersonalEmblemDef[] {
  return DEFS.filter((d) => d.rosterId === rosterId);
}

export type PersonalEmblemSave = {
  claimedPersonalEmblemIds?: string[];
  personalEmblemLevelById?: Record<string, number>;
  clearedDungeonIds?: readonly string[];
};

export interface PersonalEmblemGrant {
  def: PersonalEmblemDef;
  level: number;
}

/** 精英本回落到对应主线章，找同一枚纹章 */
export function officialDungeonIdForEmblem(dungeonId: string): string {
  return (isEliteDungeon(dungeonId) ? officialDungeonIdOfElite(dungeonId) : undefined) ?? dungeonId;
}

export function targetPersonalEmblemLevel(dungeonId: string): number {
  return isEliteDungeon(dungeonId) ? PERSONAL_EMBLEM_MAX_LEVEL : 1;
}

export function personalEmblemsForDungeon(dungeonId: string): PersonalEmblemDef[] {
  const official = officialDungeonIdForEmblem(dungeonId);
  return DEFS.filter((d) => d.dungeonId === official);
}

export function clampPersonalEmblemLevel(level: number): number {
  return Math.max(0, Math.min(PERSONAL_EMBLEM_MAX_LEVEL, Math.floor(level)));
}

export function personalEmblemLevel(meta: PersonalEmblemSave, emblemId: string): number {
  const marked = meta.personalEmblemLevelById?.[emblemId];
  if (marked && marked > 0) return clampPersonalEmblemLevel(marked);
  if ((meta.claimedPersonalEmblemIds ?? []).includes(emblemId)) return 1;
  return 0;
}

export function claimedPersonalEmblemIds(meta: PersonalEmblemSave): string[] {
  const fromLevels = Object.entries(meta.personalEmblemLevelById ?? {})
    .filter(([, lv]) => (lv ?? 0) > 0)
    .map(([id]) => id);
  if (fromLevels.length > 0) return fromLevels;
  return [...(meta.claimedPersonalEmblemIds ?? [])];
}

export function isPersonalEmblemClaimed(meta: PersonalEmblemSave, emblemId: string): boolean {
  return personalEmblemLevel(meta, emblemId) > 0;
}

function writeEmblemLevel(meta: PersonalEmblemSave, emblemId: string, level: number): void {
  const next = clampPersonalEmblemLevel(level);
  const map = { ...(meta.personalEmblemLevelById ?? {}) };
  if (next <= 0) delete map[emblemId];
  else map[emblemId] = next;
  meta.personalEmblemLevelById = map;
  const have = new Set(meta.claimedPersonalEmblemIds ?? []);
  if (next > 0) have.add(emblemId);
  else have.delete(emblemId);
  meta.claimedPersonalEmblemIds = [...have];
}

/** 已领取、且属于这个人的纹章（按目录顺序） */
export function ownedPersonalEmblemsFor(
  meta: PersonalEmblemSave,
  rosterId: string,
): PersonalEmblemDef[] {
  return personalEmblemsForRoster(rosterId).filter((d) => isPersonalEmblemClaimed(meta, d.id));
}

export function previewPersonalEmblemsForDungeon(
  meta: PersonalEmblemSave,
  dungeonId: string,
): PersonalEmblemGrant[] {
  const target = targetPersonalEmblemLevel(dungeonId);
  return personalEmblemsForDungeon(dungeonId)
    .filter((d) => personalEmblemLevel(meta, d.id) < target)
    .map((def) => ({ def, level: target }));
}

export function claimPersonalEmblemsForDungeon(
  meta: PersonalEmblemSave,
  dungeonId: string,
): PersonalEmblemGrant[] {
  const fresh = previewPersonalEmblemsForDungeon(meta, dungeonId);
  for (const g of fresh) writeEmblemLevel(meta, g.def.id, g.level);
  return fresh;
}

/**
 * 老档已通关的章补领：主线 → 1 级，对应精英 → 2 级。不升档。
 */
export function hydratePersonalEmblems(meta: PersonalEmblemSave & {
  clearedDungeonIds: readonly string[];
}): void {
  const levels = { ...(meta.personalEmblemLevelById ?? {}) };
  for (const id of meta.claimedPersonalEmblemIds ?? []) {
    if ((levels[id] ?? 0) < 1) levels[id] = 1;
  }
  for (const id of meta.clearedDungeonIds ?? []) {
    const target = targetPersonalEmblemLevel(id);
    for (const e of personalEmblemsForDungeon(id)) {
      if ((levels[e.id] ?? 0) < target) levels[e.id] = target;
    }
  }
  meta.personalEmblemLevelById = levels;
  meta.claimedPersonalEmblemIds = Object.entries(levels)
    .filter(([, lv]) => (lv ?? 0) > 0)
    .map(([id]) => id);
}

export interface PersonalEmblemCombatMods {
  stats: CharacterBaseStats;
  skillDealtMul: number;
  basicDealtMul: number;
  takenMul: number;
  healGivenMul: number;
}

const ZERO_STATS: CharacterBaseStats = { maxHp: 0, atk: 0, spd: 0, move: 0 };

export function emptyPersonalEmblemCombatMods(): PersonalEmblemCombatMods {
  return {
    stats: { ...ZERO_STATS },
    skillDealtMul: 1,
    basicDealtMul: 1,
    takenMul: 1,
    healGivenMul: 1,
  };
}

export function addCharacterStats(
  a: CharacterBaseStats,
  b: CharacterBaseStats,
): CharacterBaseStats {
  return {
    maxHp: a.maxHp + b.maxHp,
    atk: a.atk + b.atk,
    spd: a.spd + b.spd,
    move: a.move + b.move,
  };
}

function scaleStat(n: number | undefined, level: number): number | undefined {
  if (!n) return undefined;
  const lv = Math.max(1, clampPersonalEmblemLevel(level));
  return lv >= PERSONAL_EMBLEM_MAX_LEVEL ? n * LEVEL2_STAT_MUL : n;
}

function scaleMul(mul: number, level: number): number {
  const lv = Math.max(1, clampPersonalEmblemLevel(level));
  if (lv < PERSONAL_EMBLEM_MAX_LEVEL) return mul;
  return Math.round((1 + (mul - 1) * LEVEL2_BONUS_MUL) * 100) / 100;
}

/** 按等级折算效果。表里写的是 1 级。 */
export function personalEmblemEffectsAtLevel(
  def: PersonalEmblemDef,
  level = 1,
): PersonalEmblemEffect[] {
  const lv = Math.max(1, clampPersonalEmblemLevel(level) || 1);
  return def.effects.map((e) => {
    if (e.kind === 'stat') {
      return {
        kind: 'stat',
        maxHp: scaleStat(e.maxHp, lv),
        atk: scaleStat(e.atk, lv),
        spd: scaleStat(e.spd, lv),
        move: scaleStat(e.move, lv),
      };
    }
    return { ...e, mul: scaleMul(e.mul, lv) };
  });
}

function addEffects(out: PersonalEmblemCombatMods, effects: readonly PersonalEmblemEffect[]): void {
  for (const e of effects) {
    if (e.kind === 'stat') {
      out.stats.maxHp += e.maxHp ?? 0;
      out.stats.atk += e.atk ?? 0;
      out.stats.spd += e.spd ?? 0;
      out.stats.move += e.move ?? 0;
      continue;
    }
    if (e.kind === 'skillDealtMul') out.skillDealtMul *= e.mul;
    else if (e.kind === 'basicDealtMul') out.basicDealtMul *= e.mul;
    else if (e.kind === 'takenMul') out.takenMul *= e.mul;
    else out.healGivenMul *= e.mul;
  }
}

export function sumPersonalEmblemMods(
  emblems: readonly PersonalEmblemDef[],
  level = 1,
): PersonalEmblemCombatMods {
  const out = emptyPersonalEmblemCombatMods();
  for (const def of emblems) addEffects(out, personalEmblemEffectsAtLevel(def, level));
  return out;
}

export function personalEmblemModsFor(
  meta: PersonalEmblemSave,
  rosterId: string,
): PersonalEmblemCombatMods {
  const out = emptyPersonalEmblemCombatMods();
  for (const def of ownedPersonalEmblemsFor(meta, rosterId)) {
    addEffects(out, personalEmblemEffectsAtLevel(def, personalEmblemLevel(meta, def.id)));
  }
  return out;
}

function fmtMul(mul: number): string {
  const pct = Math.round((mul - 1) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** 效果文案从数值现算，改表不用改两处字 */
export function describePersonalEmblem(def: PersonalEmblemDef, level = 1): string {
  const parts: string[] = [];
  for (const e of personalEmblemEffectsAtLevel(def, level)) {
    if (e.kind === 'stat') {
      if (e.maxHp) parts.push(`生命 +${e.maxHp}`);
      if (e.atk) parts.push(`攻击 +${e.atk}`);
      if (e.spd) parts.push(`速度 +${e.spd}`);
      if (e.move) parts.push(`移动 +${e.move}`);
      continue;
    }
    if (e.kind === 'skillDealtMul') parts.push(`技能伤害 ${fmtMul(e.mul)}`);
    else if (e.kind === 'basicDealtMul') parts.push(`普攻伤害 ${fmtMul(e.mul)}`);
    else if (e.kind === 'takenMul') parts.push(`受到伤害 ${fmtMul(e.mul)}`);
    else parts.push(`技能治疗 ${fmtMul(e.mul)}`);
  }
  return parts.join('。') + (parts.length > 0 ? '。' : '');
}

export function personalEmblemSourceLabel(def: PersonalEmblemDef, level = 1): string {
  const dungeon = getDungeonDef(def.dungeonId);
  const who = getCharacterDef(def.rosterId);
  const chapter = dungeon?.name ?? def.dungeonId;
  const name = who?.name ?? def.rosterId;
  if (level >= PERSONAL_EMBLEM_MAX_LEVEL) {
    return `首次通关「${chapter} · 精英」· ${name}`;
  }
  return `首次通关「${chapter}」· ${name}`;
}

/** 给测试和投放守卫用：主线章是否都配了一枚 */
export function officialChaptersMissingEmblem(): string[] {
  return DUNGEON_DEFS.filter((d) => personalEmblemsForDungeon(d.id).length === 0).map((d) => d.id);
}

export interface PersonalEmblemCardCopy {
  title: string;
  source: string;
  desc: string;
}

/** 没拿到的不露牌。拿到了才给名字、说明和数值。 */
export function personalEmblemOwnedCardCopy(
  def: PersonalEmblemDef,
  level: number,
): PersonalEmblemCardCopy | null {
  if (level <= 0) return null;
  const maxed = level >= PERSONAL_EMBLEM_MAX_LEVEL;
  return {
    title: maxed ? `${def.name} · 2级` : def.name,
    source: maxed ? '已铭刻 · 2级' : '已铭刻 · 1级',
    desc: `${def.blurb}${describePersonalEmblem(def, level)}`,
  };
}

export type PersonalEmblemRosterCard = {
  def: PersonalEmblemDef;
  copy: PersonalEmblemCardCopy;
};

/** 角色页只画已经铭刻的。没拿到的整页留空，不写占位、不剧透。 */
export function personalEmblemRosterCards(
  meta: PersonalEmblemSave,
  rosterId: string,
): PersonalEmblemRosterCard[] {
  const cards: PersonalEmblemRosterCard[] = [];
  for (const def of personalEmblemsForRoster(rosterId)) {
    const copy = personalEmblemOwnedCardCopy(def, personalEmblemLevel(meta, def.id));
    if (copy) cards.push({ def, copy });
  }
  return cards;
}
