/** 兵种标识（盾卫不参与三角克制） */
export type UnitKind = 'sword' | 'bow' | 'cavalry' | 'shield';

export type Faction = 'player' | 'enemy';

export interface Vec2 {
  x: number;
  y: number;
}

export type SkillKind = 'whirlwind' | 'lineShot' | 'singleBash' | 'passiveCharge';

export interface SkillDef {
  id: string;
  name: string;
  /** 释放后冷却：每回合开始 -1，至 0 可再放 */
  cooldown: number;
  kind: SkillKind;
}

/** 兵种 / 人物「基础」面板（精华等只应加成此项） */
export interface UnitBaseBlock {
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
}

/**
 * 战斗内限时效果（技能施放、将来道具等）。
 * `roundsLeft` 在战局每轮开始（engine 里 `round` 事件前）统一 -1，至 0 移除。
 */
export type TimedBattleEffect =
  | { kind: 'taunt'; roundsLeft: number }
  | { kind: 'atkBonus'; addAtk: number; roundsLeft: number }
  | { kind: 'atkDown'; subAtk: number; roundsLeft: number }
  | { kind: 'spdDown'; subSpd: number; roundsLeft: number }
  | { kind: 'spdBonus'; addSpd: number; roundsLeft: number };

/** 普攻相关（射程、远程规则、普攻嘲讽）；与 `SkillSpec.shape` 无关 */
export interface UnitStrikeBlock {
  range: number;
  isRanged: boolean;
  taunt: boolean;
}

/** 兵种表一行：基础 + 普攻拆分 */
export interface UnitArchetypeDef {
  id: UnitKind;
  name: string;
  base: UnitBaseBlock;
  strike: UnitStrikeBlock;
}

/** 战斗用合并面板（由 `effectiveUnitDef` 从 archetype + 状态算出） */
export interface UnitDef {
  id: UnitKind;
  name: string;
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
  range: number;
  isRanged: boolean;
  /** AI 索敌用：普攻 `strike.taunt` 或限时 `taunt` 效果，见 `effectiveUnitDef` */
  taunt: boolean;
  skill?: SkillDef;
}

export interface UnitState {
  uid: string;
  defId: UnitKind;
  faction: Faction;
  hp: number;
  pos: Vec2;
  /** 技能剩余冷却，0 表示可用 */
  skillCd: number;
  /** 本回合是否已沿路径移动过（骑兵普攻加成） */
  movedInTurn: boolean;
  /** 本场覆盖兵种表上的技能（商店解锁 + 布阵配置） */
  battleSkill?: SkillDef;
  /** 药剂等一次性加成：造成伤害乘数 */
  tempAtkMul?: number;
  /** 精华等：仅加成「基础」atk/spd/move（部署累计） */
  bonusAtk?: number;
  bonusSpd?: number;
  bonusMove?: number;
  /** 佣兵系统：稳定 id / 显示名 */
  rosterId?: string;
  displayName?: string;
  /** 覆盖兵种基础面板 */
  mercMaxHp?: number;
  mercAtk?: number;
  mercSpd?: number;
  mercMove?: number;
  /** 覆盖普攻面板 */
  mercRange?: number;
  mercIsRanged?: boolean;
  mercTaunt?: boolean;
  /** 战斗中限时 buff/debuff（含技能施放产生的嘲讽等） */
  timedBattleEffects?: TimedBattleEffect[];
}

export type TerrainId = 'plain' | 'high' | 'forest' | 'river' | 'swamp' | 'wall' | 'abyss';

export interface CellTerrain {
  terrain: TerrainId;
}

export type SkillHit = { target: string; damage: number; hpLeft: number };

export type BattleEvent =
  | { type: 'round'; round: number }
  /** 移动前：本回合单位可达格（与 AI 相同 BFS 规则） */
  | { type: 'moveRange'; uid: string; cells: Vec2[] }
  | { type: 'moveStep'; uid: string; from: Vec2; to: Vec2 }
  | {
      type: 'skillCast';
      uid: string;
      skillId: string;
      skillName: string;
      kind: SkillKind;
      /** 施放前展示的技能作用/瞄准范围（格子坐标） */
      rangeCells: Vec2[];
      hits: SkillHit[];
    }
  | {
      type: 'attack';
      attacker: string;
      target: string;
      damage: number;
      hpLeft: number;
      /** 回放/UI 用，如「普攻」；缺省仍可按普攻处理 */
      attackLabel?: string;
    }
  | { type: 'death'; uid: string }
  | { type: 'end'; winner: Faction };

export interface BattleReport {
  events: BattleEvent[];
  winner: Faction;
  rounds: number;
}
