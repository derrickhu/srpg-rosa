import type { UnitKind, UnitStrikeBlock } from '@/battle/types';
import {
  canProfessionEquipSkill,
  defaultSkillId,
  getSkillSpec,
  type SkillRole,
} from '@/data/skillCatalog';

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
  /**
   * 技能路线：这个角色的**全部**技能（默认 + 可学）必须都是这个定位。
   * 由 `characterCatalog.test.ts` 守着。
   *
   * 这条约束是拿来解一个具体矛盾的：词条按人存、按当前主技能判定生效，
   * 而主技能在布阵页随时能免费换。三者组合的结果是「换一次主技能，
   * 攒了一路的词条批量静默休眠」——玩家读到的是投入白费，而且只有背包页
   * 一行压暗小字提示。给玩家弹确认、或者锁死切换按钮，都只是给矛盾打补丁。
   *
   * 路线内定位一致之后，换主技能永远在同一定位内换，锋锐这类词条换过去照样
   * 有东西可乘，休眠根本不会发生。于是布阵页那个切换按钮回归它本该有的意思：
   * 一个纯战术选择，而不是会废掉投入的陷阱。
   *
   * **路线属于角色，不属于职业。** 同职业的两个角色可以是两条路线——
   * 「另一个战士，走的是控制」是合法且期待中的扩展方式，玩家玩的是角色。
   * 第一章六个角色全是 `damage`，所以还看不出区别；控制 / 辅助路线的角色上线时
   * 直接给他们配 `reserved` 的那几招（破甲咒 / 盾墙震慑 / 战场祝福）。
   */
  skillRoute: SkillRole;
  /** 默认携带（且初始已解锁）的技能 */
  defaultSkillId: string;
  /**
   * 可通过 meta 魂晶学习的技能。定位必须等于 `skillRoute`，
   * 且不能是 `reserved` 的技能（那些在等对应路线的角色）。
   */
  unlockableSkillIds: string[];
  unlock: CharacterUnlock;
}

const sid = (k: UnitKind) => defaultSkillId(k);

export const CHARACTER_DEFS: CharacterDef[] = [
  {
    id: 'hero_sword_ray',
    name: '雷恩',
    profession: 'sword',
    skillRoute: 'damage',
    base: { maxHp: 98, atk: 19, spd: 5, move: 3 },
    growth: { maxHp: 8, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('sword'),
    unlockableSkillIds: ['cleave', 'blade_rush'],
    unlock: { kind: 'starter' },
  },
  {
    id: 'hero_bow_hill',
    name: '希尔',
    profession: 'bow',
    skillRoute: 'damage',
    base: { maxHp: 58, atk: 23, spd: 8, move: 2 },
    growth: { maxHp: 5, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('bow'),
    unlockableSkillIds: ['snap'],
    unlock: { kind: 'starter' },
  },
  {
    id: 'hero_shield_gron',
    name: '格隆',
    profession: 'shield',
    skillRoute: 'damage',
    base: { maxHp: 148, atk: 11, spd: 3, move: 2 },
    growth: { maxHp: 12, atk: 1, spd: 0, move: 0 },
    defaultSkillId: sid('shield'),
    unlockableSkillIds: ['hammer'],
    unlock: { kind: 'starter' },
  },
  {
    id: 'hero_cav_lance',
    name: '岚骑',
    profession: 'cavalry',
    skillRoute: 'damage',
    base: { maxHp: 88, atk: 21, spd: 9, move: 4 },
    growth: { maxHp: 7, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('cavalry'),
    unlockableSkillIds: ['lance_thrust', 'trample'],
    unlock: { kind: 'meta', cost: 12 },
  },
  {
    id: 'hero_sword_kael',
    name: '凯尔',
    profession: 'sword',
    skillRoute: 'damage',
    base: { maxHp: 105, atk: 20, spd: 5, move: 3 },
    growth: { maxHp: 9, atk: 2, spd: 0, move: 0 },
    defaultSkillId: sid('sword'),
    unlockableSkillIds: ['cleave', 'blade_rush'],
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_grassland' },
  },
  {
    id: 'hero_bow_wynn',
    name: '薇恩',
    profession: 'bow',
    skillRoute: 'damage',
    base: { maxHp: 62, atk: 24, spd: 7, move: 2 },
    growth: { maxHp: 5, atk: 3, spd: 0, move: 0 },
    defaultSkillId: sid('bow'),
    unlockableSkillIds: ['snap'],
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

/**
 * 这个角色带得动这一招吗：在他的技能路线上，且不是预留技能。
 *
 * 存在的理由是**老存档**。可学列表收紧后（比如把辅助向的战场祝福从输出路线角色那里
 * 撤掉），已经存进 `ownedSkillIds` 的越界技能不会自己消失，仍然装得上、带得上场，
 * 于是路线约束在老档上等于没有——而这种漏法不报错，只会让那个角色的词条莫名休眠。
 *
 * 所以「能不能带」只认这一个判断，`effectiveOwnedSkillIds`（布阵页轮换 + 战前烘焙）
 * 和 `equipSkill`（局外装配）都走它，`ownedSkillIds` 只当历史记录。
 */
export function canCharacterUseSkill(def: CharacterDef, skillId: string): boolean {
  const spec = getSkillSpec(skillId);
  if (!spec || spec.reserved) return false;
  if (!canProfessionEquipSkill(def.profession, skillId)) return false;
  return spec.role === def.skillRoute;
}

/**
 * 能进**主槽**的全部技能 id：各角色的默认技能 + 可学技能的并集。
 *
 * 单开一个入口是因为「主槽 / 临时槽」这条线现在有规则挂在上面——**词条只强化主技能**
 * （见 `unitSkillSpec`），所以「每一招都要配专属词条」这条纪律的范围是这里，
 * 不是 `allPlayerSkillSpecs()`。后者还包含只在商店卖、只进临时槽的 `temp_gl_*`，
 * 给它们配专属词条就是写了永远发不出来的内容。
 */
export function mainSlotSkillIds(): string[] {
  const ids = new Set<string>();
  for (const c of CHARACTER_DEFS) {
    ids.add(c.defaultSkillId);
    for (const id of c.unlockableSkillIds) ids.add(id);
  }
  return [...ids];
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
