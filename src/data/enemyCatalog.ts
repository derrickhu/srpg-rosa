import type { UnitKind } from '@/battle/types';

/**
 * 敌方单位数值表（与 `characterCatalog` 对称的敌方数据源）。
 * 关卡蓝图 `stagesMvp` 的 spawn 以 `UnitKind` 引用此表；
 * 实际面板 = 本表 base × 副本/节点缩放（见 `buildBattleUnits`）。
 * 兵种通用元数据（名称 / 普攻面板）仍在 `unitDefs`，本表只管数值强度。
 */

export interface EnemyStatBlock {
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
}

export const ENEMY_DEFS: Record<UnitKind, { id: UnitKind; base: EnemyStatBlock }> = {
  sword: { id: 'sword', base: { maxHp: 100, atk: 18, spd: 5, move: 3 } },
  bow: { id: 'bow', base: { maxHp: 60, atk: 22, spd: 7, move: 2 } },
  cavalry: { id: 'cavalry', base: { maxHp: 90, atk: 20, spd: 8, move: 4 } },
  shield: { id: 'shield', base: { maxHp: 150, atk: 10, spd: 3, move: 2 } },
};

export function enemyBaseStats(kind: UnitKind): EnemyStatBlock {
  return ENEMY_DEFS[kind].base;
}
