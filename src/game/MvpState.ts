/**
 * Barrel re-export — all game-state logic is now split across:
 *   state/GameState.ts      – types, creation, basic accessors
 *   state/DeployManager.ts  – placement, terrain, build-battle-units
 *   state/ShopManager.ts    – shop roll / buy / skill-bind
 *   state/ProgressManager.ts – victory, stage advance, run reset
 */

export {
  type GamePhase,
  type ShopOffer,
  type StatBonus,
  type PlacementEntry,
  type TerrainOverlayCell,
  type MvpGameState,
  type BuyShopContext,
  ZERO_STAT,
  addStatBonus,
  createInitialState,
  getMercenary,
  benchMercenaries,
  currentStage,
  battleTerrain,
  shuffle,
  nextPid,
  resetPid,
} from './state/GameState';

export {
  canPlaceAt,
  canPlaceTerrain,
  placeTerrainCell,
  placeMercenary,
  removePlacement,
  attachStatPotionToPlacement,
  attachPotionToPlacement,
  cycleSkillForRoster,
  buildBattleUnits,
  undoDeployForRetry,
  getMaxDeploy,
} from './state/DeployManager';

export {
  rosterEligibleForSkillBind,
  rollShop,
  buyShopOffer,
  buyShopItem,
} from './state/ShopManager';

export {
  applyVictory,
  advanceStage,
  resetRun,
} from './state/ProgressManager';
