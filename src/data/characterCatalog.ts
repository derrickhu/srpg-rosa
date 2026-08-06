import type { UnitKind, UnitStrikeBlock } from '@/battle/types';
import { defaultSkillId } from '@/data/skillCatalog';

/**
 * 固定角色名册（两层玩法的 meta 层）。
 * 角色与职业固定，长期变化来自 meta 等级成长 + 持久技能装配，
 * 不再通过商店随机招募。`unlock` 决定如何获得该角色。
 */

export interface CharacterStatBlock {
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
}

export type CharacterUnlock =
  | { kind: 'starter' }
  /** 在大厅用 meta 货币（魂晶）解锁 */
  | { kind: 'meta'; cost: number }
  /** 通关指定副本后解锁 */
  | { kind: 'clearDungeon'; dungeonId: string };

export interface CharacterDef {
  /** 全表唯一，既作 catalogId 也作角色 id */
  id: string;
  name: string;
  profession: UnitKind;
  /** 1 级基础面板（精华/成长在其上叠加） */
  base: CharacterStatBlock;
  /** 每升 1 级的固定成长 */
  growth: CharacterStatBlock;
  /** 覆盖兵种默认普攻面板；缺省字段来自 `UNIT_DEFS[profession].strike` */
  strike?: Partial<UnitStrikeBlock>;
  /** 默认携带（且初始已解锁）的技能 */
  defaultSkillId: string;
  /** 可通过 meta 装配解锁的技能（职业可携带者） */
  unlockableSkillIds: string[];
  unlock: CharacterUnlock;
}

const sid = (k: UnitKind) => defaultSkillId(k);

export const CHARACTER_DEFS: CharacterDef[] = [
  {
    id: 'hero_sword_ray',
    name: '雷恩',
    profession: 'sword',
    base: { maxHp: 98, atk: 19, spd: 5, move: 3 },
    growth: { maxHp: 8, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('sword'),
    unlockableSkillIds: ['cleave', 'blade_rush', 'war_shout', 'field_bless'],
    unlock: { kind: 'starter' },
  },
  {
    id: 'hero_bow_hill',
    name: '希尔',
    profession: 'bow',
    base: { maxHp: 58, atk: 23, spd: 8, move: 2 },
    growth: { maxHp: 5, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('bow'),
    unlockableSkillIds: ['snap', 'hex_mark', 'war_shout', 'field_bless'],
    unlock: { kind: 'starter' },
  },
  {
    id: 'hero_shield_gron',
    name: '格隆',
    profession: 'shield',
    base: { maxHp: 148, atk: 11, spd: 3, move: 2 },
    growth: { maxHp: 12, atk: 1, spd: 0, move: 0 },
    defaultSkillId: sid('shield'),
    unlockableSkillIds: ['hammer', 'shield_wall', 'war_shout', 'field_bless'],
    unlock: { kind: 'starter' },
  },
  {
    id: 'hero_cav_lance',
    name: '岚骑',
    profession: 'cavalry',
    base: { maxHp: 88, atk: 21, spd: 9, move: 4 },
    growth: { maxHp: 7, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('cavalry'),
    unlockableSkillIds: ['lance_thrust', 'trample', 'war_shout', 'field_bless'],
    unlock: { kind: 'meta', cost: 12 },
  },
  {
    id: 'hero_sword_kael',
    name: '凯尔',
    profession: 'sword',
    base: { maxHp: 105, atk: 20, spd: 5, move: 3 },
    growth: { maxHp: 9, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('sword'),
    unlockableSkillIds: ['cleave', 'blade_rush', 'war_shout', 'field_bless'],
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_grassland' },
  },
  {
    id: 'hero_bow_wynn',
    name: '薇恩',
    profession: 'bow',
    base: { maxHp: 62, atk: 24, spd: 7, move: 2 },
    growth: { maxHp: 5, atk: 3, spd: 0, move: 0 },
    defaultSkillId: sid('bow'),
    unlockableSkillIds: ['snap', 'hex_mark', 'war_shout', 'field_bless'],
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_forest' },
  },
];

const BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  CHARACTER_DEFS.map((c) => [c.id, c]),
);

/** 开局即拥有的角色 id（顺序即默认上阵顺序） */
export const STARTER_CHARACTER_IDS: readonly string[] = CHARACTER_DEFS.filter(
  (c) => c.unlock.kind === 'starter',
).map((c) => c.id);

export function getCharacterDef(id: string): CharacterDef | undefined {
  return BY_ID[id];
}

/** 升至 `level` 级时的有效基础面板（含成长，未含精华/局内加成） */
export function characterStatsAtLevel(def: CharacterDef, level: number): CharacterStatBlock {
  const n = Math.max(0, level - 1);
  return {
    maxHp: def.base.maxHp + def.growth.maxHp * n,
    atk: def.base.atk + def.growth.atk * n,
    spd: def.base.spd + def.growth.spd * n,
    move: def.base.move + def.growth.move * n,
  };
}

/** 角色升 `level` 级累计消耗的 meta 货币（用于大厅升级按钮） */
export function levelUpCost(currentLevel: number): number {
  return 3 + currentLevel * 2;
}
