import { getCharacterDef } from '@/data/characterCatalog';
import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import { eliteIdOf, isEliteDungeon, officialDungeonIdOfElite } from '@/data/eliteCatalog';
import type { CharacterBaseStats } from '@/game/characterTypes';

/**
 * 跟人的永久专属纹章。
 *
 * 和局内三选一纹章（`skillModCatalog`）不是一类东西：
 * - 局内纹章挂技能、改 `SkillSpec`、出副本即弃，还要考虑「这枚能不能装在这招上」；
 * - 这里每一枚在表里就写死给谁，效果是这个人的永久被动，不进技能兼容层。
 *
 * 每个人两枚，和角色一起设计。等级现在封顶 2，改 `PERSONAL_EMBLEM_MAX_LEVEL` 就能再打开。
 * 2 级曲线写死在 2 这一档（固定值 ×2，百分比 ×1.6），不跟封顶绑在一起，
 * 免得以后把封顶调高时，2 级反而算回 1 级的数。再往上要另补曲线。
 * 前六章各送第一枚：主线首通 1 级，同章精英首通升到 2 级。还没通关前不能花纹玉提前买。
 * 第七章起改送纹玉，在已拥有角色的页面上花掉，用来激活还没有的一枚，或把已有的升 1 级。
 * 看完广告可以把任意一枚已激活的收回：1 级退 1 枚，2 级退 2 枚。收回后精英不再补送。
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
  | { kind: 'healGivenMul'; mul: number }
  /** 这个人施加的中毒，每回合再多扣这么多。2 级按固定值翻倍。 */
  | { kind: 'poisonTick'; add: number };

export interface PersonalEmblemDef {
  id: string;
  name: string;
  /** 一句身份，不写数字；数字由 `describePersonalEmblem` 从效果现算 */
  blurb: string;
  rosterId: string;
  /**
   * 绑定的主线章。精英首通升同一枚，不另开 id。
   * 没有这栏的是第二枚，或魂晶角色的两枚：只靠纹玉激活。
   */
  dungeonId?: string;
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
  {
    id: 'pe_ray_mist',
    name: '雾行',
    blurb: '走过浓雾的人，脚步不再被雾拖住。',
    rosterId: 'hero_sword_ray',
    icon: 'emblem_pe_mist',
    effects: [
      { kind: 'stat', spd: 1, maxHp: 8 },
      { kind: 'takenMul', mul: 0.95 },
    ],
  },
  {
    id: 'pe_hill_shade',
    name: '背林',
    blurb: '站在林子后面，挨打也轻一些。',
    rosterId: 'hero_bow_hill',
    icon: 'emblem_pe_shade',
    effects: [
      { kind: 'stat', maxHp: 8 },
      { kind: 'takenMul', mul: 0.95 },
    ],
  },
  {
    id: 'pe_gron_gate',
    name: '镇门',
    blurb: '守门的那一击，离开城墙也还在。',
    rosterId: 'hero_shield_gron',
    icon: 'emblem_pe_gate',
    effects: [
      { kind: 'stat', atk: 2 },
      { kind: 'skillDealtMul', mul: 1.05 },
    ],
  },
  {
    id: 'pe_aoli_ember',
    name: '余烬',
    blurb: '火还没灭的时候，人先站得住。',
    rosterId: 'hero_mage_aoli',
    icon: 'emblem_pe_ember',
    effects: [
      { kind: 'stat', maxHp: 10 },
      { kind: 'takenMul', mul: 0.95 },
    ],
  },
  {
    id: 'pe_floe_mail',
    name: '寒甲',
    blurb: '霜结在身上，打出去也更沉。',
    rosterId: 'hero_mage_floe',
    icon: 'emblem_pe_mail',
    effects: [
      { kind: 'stat', atk: 2 },
      { kind: 'takenMul', mul: 0.95 },
    ],
  },
  {
    id: 'pe_mir_aegis',
    name: '庇佑',
    blurb: '先把自己护住，才救得了别人。',
    rosterId: 'hero_healer_mir',
    icon: 'emblem_pe_aegis',
    effects: [
      { kind: 'stat', maxHp: 8 },
      { kind: 'takenMul', mul: 0.95 },
    ],
  },
  {
    id: 'pe_lance_drive',
    name: '长驱',
    blurb: '这一枪穿过人墙。',
    rosterId: 'hero_cav_lance',
    icon: 'emblem_pe_drive',
    effects: [
      { kind: 'stat', atk: 2 },
      { kind: 'skillDealtMul', mul: 1.05 },
    ],
  },
  {
    id: 'pe_lance_flank',
    name: '绕后',
    blurb: '绕到背后还能站得住。',
    rosterId: 'hero_cav_lance',
    icon: 'emblem_pe_flank',
    effects: [
      { kind: 'stat', maxHp: 10 },
      { kind: 'takenMul', mul: 0.95 },
    ],
  },
  {
    id: 'pe_luoling_blight',
    name: '咒毒',
    blurb: '咒上的毒再深一截。',
    rosterId: 'hero_bow_luoling',
    icon: 'emblem_pe_blight',
    effects: [{ kind: 'poisonTick', add: 2 }],
  },
  {
    id: 'pe_luoling_ward',
    name: '护铃',
    blurb: '下咒的人自己也得留在场上。',
    rosterId: 'hero_bow_luoling',
    icon: 'emblem_pe_ward',
    effects: [
      { kind: 'stat', maxHp: 8 },
      { kind: 'takenMul', mul: 0.95 },
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
  claimedPersonalEmblemIds?: readonly string[];
  personalEmblemLevelById?: Record<string, number>;
  clearedDungeonIds?: readonly string[];
  /** 看广告收回过的纹章。精英和读档补领都不再把这一枚送回来。 */
  personalEmblemReleasedIds?: readonly string[];
  universalEmblemTokens?: number;
  /** 已经发过纹玉的章节 id（普通和精英分开记） */
  universalEmblemPaidDungeonIds?: readonly string[];
  roster?: readonly { rosterId: string }[];
};

/** 玩家看见的名字。存档字段仍是 `universalEmblemTokens`。 */
export const UNIVERSAL_EMBLEM_NAME = '纹玉';
export const UNIVERSAL_EMBLEM_ICON = 'icon_universal_emblem';
/** 激活或升级一次花掉的枚数。 */
export const UNIVERSAL_EMBLEM_SPEND = 1;

/** 目录里从第 7 章（下标 6）起，首通改发纹玉，不再送某一个人。 */
export const UNIVERSAL_EMBLEM_FROM_CHAPTER = 6;
export const UNIVERSAL_EMBLEM_CLEAR_COUNT = 2;
export const UNIVERSAL_EMBLEM_ELITE_COUNT = 1;

export interface PersonalEmblemGrant {
  def: PersonalEmblemDef;
  level: number;
}

/** 精英本回落到对应主线章，找同一枚纹章 */
export function officialDungeonIdForEmblem(dungeonId: string): string {
  return (isEliteDungeon(dungeonId) ? officialDungeonIdOfElite(dungeonId) : undefined) ?? dungeonId;
}

/** 精英首通升到的等级。封顶再抬高时，这一档仍是 2，不跟着跳。 */
const PERSONAL_EMBLEM_ELITE_LEVEL = 2;

export function targetPersonalEmblemLevel(dungeonId: string): number {
  const eliteLevel = Math.min(PERSONAL_EMBLEM_MAX_LEVEL, PERSONAL_EMBLEM_ELITE_LEVEL);
  return isEliteDungeon(dungeonId) ? eliteLevel : 1;
}

/**
 * 这一枚还会被章节白送。收回过的不再算：精英和主线都不会再补，只能花纹玉买回来。
 */
export function personalEmblemChapterGiftPending(
  meta: PersonalEmblemSave,
  emblemId: string,
): boolean {
  const def = getPersonalEmblem(emblemId);
  if (!def?.dungeonId) return false;
  if ((meta.personalEmblemReleasedIds ?? []).includes(emblemId)) return false;
  if (personalEmblemLevel(meta, emblemId) > 0) return false;
  return !(meta.clearedDungeonIds ?? []).includes(def.dungeonId);
}

export function personalEmblemChapterGiftLabel(
  meta: PersonalEmblemSave,
  emblemId: string,
): string | null {
  if (!personalEmblemChapterGiftPending(meta, emblemId)) return null;
  const def = getPersonalEmblem(emblemId);
  const name = def?.dungeonId ? getDungeonDef(def.dungeonId)?.name : undefined;
  return `通关「${name ?? '这一章'}」后获得`;
}

/** 1 级还在，精英还没打过，也没收回过：下一场精英首通会免费升到 2 级。 */
export function personalEmblemEliteUpgradePending(
  meta: PersonalEmblemSave,
  emblemId: string,
): boolean {
  const def = getPersonalEmblem(emblemId);
  if (!def?.dungeonId) return false;
  if ((meta.personalEmblemReleasedIds ?? []).includes(emblemId)) return false;
  const level = personalEmblemLevel(meta, emblemId);
  if (level <= 0 || level >= PERSONAL_EMBLEM_MAX_LEVEL) return false;
  const eliteId = eliteIdOf(def.dungeonId);
  if (!eliteId) return false;
  return !(meta.clearedDungeonIds ?? []).includes(eliteId);
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
  const released = new Set(meta.personalEmblemReleasedIds ?? []);
  return personalEmblemsForDungeon(dungeonId)
    .filter((d) => !released.has(d.id) && personalEmblemLevel(meta, d.id) < target)
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
 * 收回过的不补。第七章及以后已通关的，按首通数量补纹玉，只补一次。
 */
export function hydratePersonalEmblems(meta: PersonalEmblemSave & {
  clearedDungeonIds: readonly string[];
}): void {
  const released = new Set(meta.personalEmblemReleasedIds ?? []);
  const levels = { ...(meta.personalEmblemLevelById ?? {}) };
  for (const id of meta.claimedPersonalEmblemIds ?? []) {
    if (released.has(id)) continue;
    if ((levels[id] ?? 0) < 1) levels[id] = 1;
  }
  for (const id of meta.clearedDungeonIds ?? []) {
    const target = targetPersonalEmblemLevel(id);
    for (const e of personalEmblemsForDungeon(id)) {
      if (released.has(e.id)) continue;
      if ((levels[e.id] ?? 0) < target) levels[e.id] = target;
    }
    claimUniversalEmblemsForDungeon(meta, id);
  }
  meta.personalEmblemLevelById = levels;
  meta.claimedPersonalEmblemIds = Object.entries(levels)
    .filter(([, lv]) => (lv ?? 0) > 0)
    .map(([id]) => id);
}

export function universalEmblemGrantForClear(dungeonId: string): number {
  const official = officialDungeonIdForEmblem(dungeonId);
  const idx = DUNGEON_DEFS.findIndex((d) => d.id === official);
  if (idx < UNIVERSAL_EMBLEM_FROM_CHAPTER) return 0;
  return isEliteDungeon(dungeonId) ? UNIVERSAL_EMBLEM_ELITE_COUNT : UNIVERSAL_EMBLEM_CLEAR_COUNT;
}

/** 这一章若还没发过纹玉，就入账并记成已发。重复调用是 0。 */
export function claimUniversalEmblemsForDungeon(meta: PersonalEmblemSave, dungeonId: string): number {
  const n = universalEmblemGrantForClear(dungeonId);
  if (n <= 0) return 0;
  const paid = new Set(meta.universalEmblemPaidDungeonIds ?? []);
  if (paid.has(dungeonId)) return 0;
  paid.add(dungeonId);
  meta.universalEmblemPaidDungeonIds = [...paid];
  meta.universalEmblemTokens = (meta.universalEmblemTokens ?? 0) + n;
  return n;
}

/** 结算预览。已经通关或已经入账过的章是 0，避免和入账各算一次。 */
export function previewUniversalEmblemGrant(meta: PersonalEmblemSave, dungeonId: string): number {
  if ((meta.universalEmblemPaidDungeonIds ?? []).includes(dungeonId)) return 0;
  if ((meta.clearedDungeonIds ?? []).includes(dungeonId)) return 0;
  return universalEmblemGrantForClear(dungeonId);
}

function rosterOwns(meta: PersonalEmblemSave, rosterId: string): boolean {
  return (meta.roster ?? []).some((m) => m.rosterId === rosterId);
}

export function universalEmblemRefundForLevel(level: number): number {
  return Math.max(0, Math.floor(level));
}

/**
 * 这个人还有能花纹玉的纹章：没激活且不是待赠送的，或已激活但没到顶。
 * 纹玉不够时是 false。
 */
export function personalEmblemSpendAvailable(meta: PersonalEmblemSave, rosterId: string): boolean {
  if ((meta.universalEmblemTokens ?? 0) < UNIVERSAL_EMBLEM_SPEND) return false;
  return personalEmblemsForRoster(rosterId).some((def) => {
    const level = personalEmblemLevel(meta, def.id);
    if (level <= 0) return !personalEmblemChapterGiftPending(meta, def.id);
    return level < PERSONAL_EMBLEM_MAX_LEVEL;
  });
}

/** 花 1 枚纹玉激活这个人还没有的一枚，得到 1 级。人必须已经在名册里。 */
export function activatePersonalEmblem(
  meta: PersonalEmblemSave,
  rosterId: string,
  emblemId: string,
): boolean {
  const def = getPersonalEmblem(emblemId);
  if (!def || def.rosterId !== rosterId) return false;
  if (!rosterOwns(meta, rosterId)) return false;
  if (personalEmblemLevel(meta, emblemId) > 0) return false;
  if (personalEmblemChapterGiftPending(meta, emblemId)) return false;
  if ((meta.universalEmblemTokens ?? 0) < UNIVERSAL_EMBLEM_SPEND) return false;
  meta.universalEmblemTokens = (meta.universalEmblemTokens ?? 0) - UNIVERSAL_EMBLEM_SPEND;
  writeEmblemLevel(meta, emblemId, 1);
  return true;
}

/** 花 1 枚纹玉把已激活的升 1 级。封顶之后返回 false，不扣。 */
export function upgradePersonalEmblem(
  meta: PersonalEmblemSave,
  rosterId: string,
  emblemId: string,
): boolean {
  const def = getPersonalEmblem(emblemId);
  if (!def || def.rosterId !== rosterId) return false;
  if (!rosterOwns(meta, rosterId)) return false;
  const level = personalEmblemLevel(meta, emblemId);
  if (level <= 0 || level >= PERSONAL_EMBLEM_MAX_LEVEL) return false;
  if ((meta.universalEmblemTokens ?? 0) < UNIVERSAL_EMBLEM_SPEND) return false;
  meta.universalEmblemTokens = (meta.universalEmblemTokens ?? 0) - UNIVERSAL_EMBLEM_SPEND;
  writeEmblemLevel(meta, emblemId, level + 1);
  return true;
}

export interface PersonalEmblemReleasePrompt {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
}

/**
 * 看广告收回前的一句。没激活的返回 null。
 * 只说退回几枚，以及这几枚可以拿去给别人铭刻。
 */
export function personalEmblemReleasePrompt(
  meta: PersonalEmblemSave,
  emblemId: string,
): PersonalEmblemReleasePrompt | null {
  const def = getPersonalEmblem(emblemId);
  const level = personalEmblemLevel(meta, emblemId);
  if (!def || level <= 0) return null;
  const refund = universalEmblemRefundForLevel(level);
  return {
    title: '收回纹章',
    body: `收回「${def.name}」，退回 ${refund} 枚${UNIVERSAL_EMBLEM_NAME}。可用于其他角色的永久纹章铭刻。`,
    cancelLabel: '取消',
    confirmLabel: '看广告',
  };
}

/**
 * 收回这一枚，按等级退纹玉，并记成「精英不再补送」。
 * 返回退回的枚数。没激活的是 0，不改存档。
 */
export function releasePersonalEmblem(meta: PersonalEmblemSave, emblemId: string): number {
  const level = personalEmblemLevel(meta, emblemId);
  if (level <= 0) return 0;
  const refund = universalEmblemRefundForLevel(level);
  writeEmblemLevel(meta, emblemId, 0);
  const released = new Set(meta.personalEmblemReleasedIds ?? []);
  released.add(emblemId);
  meta.personalEmblemReleasedIds = [...released];
  meta.universalEmblemTokens = (meta.universalEmblemTokens ?? 0) + refund;
  return refund;
}

export interface PersonalEmblemCombatMods {
  stats: CharacterBaseStats;
  skillDealtMul: number;
  basicDealtMul: number;
  takenMul: number;
  healGivenMul: number;
  poisonTickAdd: number;
}

const ZERO_STATS: CharacterBaseStats = { maxHp: 0, atk: 0, spd: 0, move: 0 };

export function emptyPersonalEmblemCombatMods(): PersonalEmblemCombatMods {
  return {
    stats: { ...ZERO_STATS },
    skillDealtMul: 1,
    basicDealtMul: 1,
    takenMul: 1,
    healGivenMul: 1,
    poisonTickAdd: 0,
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
  return lv >= PERSONAL_EMBLEM_ELITE_LEVEL ? n * LEVEL2_STAT_MUL : n;
}

function scaleMul(mul: number, level: number): number {
  const lv = Math.max(1, clampPersonalEmblemLevel(level));
  if (lv < PERSONAL_EMBLEM_ELITE_LEVEL) return mul;
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
    if (e.kind === 'poisonTick') {
      return { kind: 'poisonTick', add: scaleStat(e.add, lv) ?? e.add };
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
    else if (e.kind === 'healGivenMul') out.healGivenMul *= e.mul;
    else out.poisonTickAdd += e.add;
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

/** 一条一条的效果，给首杀专页排在图框下。数字仍由等级现算 */
export function personalEmblemEffectLines(def: PersonalEmblemDef, level = 1): string[] {
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
    else if (e.kind === 'healGivenMul') parts.push(`技能治疗 ${fmtMul(e.mul)}`);
    else parts.push(`中毒每回合 +${e.add}`);
  }
  return parts;
}

/** 效果文案从数值现算，改表不用改两处字 */
export function describePersonalEmblem(def: PersonalEmblemDef, level = 1): string {
  const parts = personalEmblemEffectLines(def, level);
  return parts.join('。') + (parts.length > 0 ? '。' : '');
}

export function personalEmblemSourceLabel(def: PersonalEmblemDef, level = 1): string {
  const dungeon = def.dungeonId ? getDungeonDef(def.dungeonId) : undefined;
  const who = getCharacterDef(def.rosterId);
  if (!def.dungeonId) return who?.name ?? def.rosterId;
  const chapter = dungeon?.name ?? def.dungeonId;
  const name = who?.name ?? def.rosterId;
  if (level >= PERSONAL_EMBLEM_MAX_LEVEL) {
    return `首次通关「${chapter} · 精英」· ${name}`;
  }
  return `首次通关「${chapter}」· ${name}`;
}

/** 前六章里还没配白送纹章的。第七章起本来就没有。 */
export function officialChaptersMissingEmblem(): string[] {
  return DUNGEON_DEFS
    .filter((d, i) => i < UNIVERSAL_EMBLEM_FROM_CHAPTER && personalEmblemsForDungeon(d.id).length === 0)
    .map((d) => d.id);
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
