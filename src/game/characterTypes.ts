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
  /** 已解锁技能 id（含初始） */
  ownedSkillIds: string[];
  /** 当前持久装配技能 */
  activeSkillId: string;
}
