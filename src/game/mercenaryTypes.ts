import type { UnitKind } from '@/battle/types';

/** 佣兵「基础」面板（精华等只加成此项） */
export interface MercenaryBaseStats {
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
}

/** 佣兵普攻面板（射程、远程规则、普攻嘲讽） */
export interface MercenaryStrikeStats {
  range: number;
  isRanged: boolean;
  taunt: boolean;
}

/** 单个佣兵：独立姓名、基础/普攻与技能池，职业用于克制与 AI 分类 */
export interface Mercenary {
  /** 来自 `mercenaryCatalog` 的固定卡 id；无则视为旧数据/占位 */
  catalogId?: string;
  rosterId: string;
  name: string;
  profession: UnitKind;
  base: MercenaryBaseStats;
  strike: MercenaryStrikeStats;
  /** 已解锁技能 id（含初始） */
  ownedSkillIds: string[];
  /** 当前携带技能 */
  activeSkillId: string;
}
