import type { UnitKind } from '@/battle/types';

/** 角色「基础」面板（精华等只加成此项） */
export interface CharacterBaseStats {
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
}

/** 角色普攻面板（射程、远程规则、普攻嘲讽） */
export interface CharacterStrikeStats {
  range: number;
  isRanged: boolean;
  taunt: boolean;
}

/** 名册中的角色实例：来自 `characterCatalog` 的静态定义 + meta 等级/技能进度 */
export interface Character {
  /** 来自 `characterCatalog` 的固定角色 id（= rosterId） */
  catalogId?: string;
  rosterId: string;
  name: string;
  profession: UnitKind;
  /** meta 等级（≥1），决定成长后的有效面板 */
  level: number;
  /** 1 级基础面板（成长在其上叠加，见 characterStatsAtLevel） */
  base: CharacterBaseStats;
  strike: CharacterStrikeStats;
}

/**
 * 这里**刻意没有**技能字段。
 *
 * 曾经有 `ownedSkillIds` / `activeSkillId` 两个：前者记买过哪些招，后者记当前装配的。
 * 一人一招之后招牌技能由 `CharacterDef.defaultSkillId` 唯一决定，
 * 存一份可变副本只会制造两个真相——老档里那份副本正好是当年学过的越界技能，
 * 而它不会自己失效，只会让那个角色的纹章莫名休眠。
 *
 * 需要「这个人打哪一招」时走 `signatureSkillId` / `resolveBattleSkillIdForCharacter`。
 */
