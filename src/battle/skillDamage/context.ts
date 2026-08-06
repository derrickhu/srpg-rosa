import type { UnitArchetypeDef, UnitDef, UnitKind, UnitState } from '../types';
import type { SkillSpec } from '@/data/skillCatalog';
import type { TerrainGrid } from '../grid';

/** 计算「对某一目标」的技能伤害时传入的上下文（多目标技能会多次调用） */
export interface SkillDamageContext {
  self: UnitState;
  target: UnitState;
  /** 施法者本场合并面板 `effectiveUnitDef(self)` */
  casterDef: UnitDef;
  /** 目标本场合并面板 */
  targetDef: UnitDef;
  spec: SkillSpec;
  terrain: TerrainGrid;
  defs: Record<UnitKind, UnitArchetypeDef>;
}
