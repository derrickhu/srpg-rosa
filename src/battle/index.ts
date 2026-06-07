export type {
  BattleEvent,
  BattleReport,
  Faction,
  TerrainId,
  TimedBattleEffect,
  UnitDef,
  UnitKind,
  UnitState,
  Vec2,
} from './types';
export { MAX_BATTLE_ROUNDS, playerDeployRowRange, COUNTER_STRONG, COUNTER_WEAK, HIGH_GROUND_ATK_MUL } from './constants';
export { runBattle } from './engine';
export { effectiveUnitDef } from './effectiveUnit';
export type { SkillDamageContext } from './skillDamage';
export {
  computeSkillHitDamage,
  computeSkillHitDamageWithSpec,
  registerSkillDamageCalculator,
  unregisterSkillDamageCalculator,
} from './skillDamage';
export type { SkillDamageSpec } from '@/data/skillCatalog';
export { emptyTerrain, gridSize, inBounds, mergeTerrainOverlay, neighbors4 } from './grid';
export type { TerrainGrid } from './grid';
