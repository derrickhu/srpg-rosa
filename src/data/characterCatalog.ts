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
   * 技能路线：这个角色的招牌技能是什么定位。由 `characterCatalog.test.ts` 守着。
   *
   * 一人一招之后它不再是「一组技能的共同定位」，而是**角色的身份标签**：
   * 决定他吃哪一类纹章、在队伍里占哪个位置。词条投放读的是主技能的 `role`，
   * 这个字段负责让数据表和技能表对不上时立刻报错。
   *
   * **路线属于角色，不属于职业。** 同职业的两个角色可以是两条路线——
   * 「另一个战士，走的是控制」是合法且期待中的扩展方式，玩家玩的是角色。
   * 输出路线占大多数，弥尔走 `support`。
   * 控制路线的角色上线时再接 `reserved` 的那几招（破甲咒 / 盾墙震慑 / 战吼）。
   */
  skillRoute: SkillRole;
  /**
   * 这个角色的**招牌技能**，一人一招，不可更换。
   *
   * 曾经每个角色还有一条「可学技能列表」，用魂晶买、在布阵页免费轮换。那套东西
   * 和纹章系统有一个解不开的矛盾：纹章按**角色**存、按**当前主技能**判定生效，
   * 于是中途换一次主技能就会让攒了一路的专属纹章批量静默休眠。
   * 曾经用「同一路线内定位必须一致」去压这个矛盾，但压不住——专属纹章咬的是
   * 具体机制（AoE 才有横扫、点杀才有处决），同定位的两招照样互不兼容。
   *
   * 一人一招之后，角色等级、纹章解锁链、招牌技能三者串成一条线：
   * 练这个人就是在加深这一招。多出来的招没有作废，去向见各自的
   * `reserved` / `enemyOnly` 注释。
   */
  defaultSkillId: string;
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
    unlock: { kind: 'meta', cost: 12 },
  },
  {
    id: 'hero_mage_aoli',
    name: '奥莉',
    profession: 'mage',
    skillRoute: 'damage',
    base: { maxHp: 50, atk: 25, spd: 6, move: 2 },
    growth: { maxHp: 4, atk: 3, spd: 0, move: 0 },
    defaultSkillId: sid('mage'),
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_grassland' },
  },
  {
    id: 'hero_healer_mir',
    name: '弥尔',
    profession: 'healer',
    skillRoute: 'support',
    base: { maxHp: 74, atk: 13, spd: 4, move: 2 },
    growth: { maxHp: 6, atk: 1, spd: 0, move: 0 },
    defaultSkillId: sid('healer'),
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_forest' },
  },
  {
    id: 'hero_mage_floe',
    name: '芙洛',
    profession: 'mage',
    skillRoute: 'damage',
    base: { maxHp: 54, atk: 23, spd: 5, move: 2 },
    growth: { maxHp: 4, atk: 3, spd: 0, move: 0 },
    defaultSkillId: 'frost_ring',
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_fortress' },
  },
];

/** 老档里凯尔 / 薇恩换成法师奥莉 / 祭司弥尔 */
export const LEGACY_CHARACTER_IDS: Readonly<Record<string, string>> = {
  hero_sword_kael: 'hero_mage_aoli',
  hero_bow_wynn: 'hero_healer_mir',
};

export function remapLegacyCharacterId(id: string): string {
  return LEGACY_CHARACTER_IDS[id] ?? id;
}

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
 * 这个角色带得动这一招吗：正是他的招牌技能，或至少在同一条路线上且不是预留技能。
 *
 * 一人一招之后主槽已经没有选择余地，这个判断留着是给**老存档**兜底：
 * 存档里 `activeSkillId` 可能是撤销前学到的招（比如格隆的铁锤），
 * 只查 `ownedSkillIds` 的话它照样装得上、带得上场，而这种漏法不报错，
 * 只会让那个角色的纹章莫名休眠。`resolveBattleSkillIdForCharacter` 走它来判死。
 */
export function canCharacterUseSkill(def: CharacterDef, skillId: string): boolean {
  const spec = getSkillSpec(skillId);
  if (!spec || spec.reserved || spec.enemyOnly) return false;
  if (!canProfessionEquipSkill(def.profession, skillId)) return false;
  return spec.role === def.skillRoute;
}

/**
 * 能进**主槽**的全部技能 id，一人一招之后就是六个角色的招牌技能。
 *
 * 单开一个入口是因为「主槽 / 临时槽」这条线有规则挂在上面——**纹章只强化主技能**
 * （见 `unitSkillSpec`），所以「每一招都要配专属纹章」这条纪律的范围是这里，
 * 不是 `allPlayerSkillSpecs()`。后者还包含只在商店卖、只进临时槽的 `temp_gl_*`，
 * 给它们配专属纹章就是写了永远发不出来的内容。
 */
export function mainSlotSkillIds(): string[] {
  return [...new Set(CHARACTER_DEFS.map((c) => c.defaultSkillId))];
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
