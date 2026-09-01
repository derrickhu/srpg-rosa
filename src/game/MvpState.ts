/**
 * Barrel re-export — 两层玩法状态拆分：
 *   state/GameState.ts      – MetaState / RunState / 聚合类型与访问器
 *   state/DeployManager.ts  – 部署、地形、构建战斗单位
 *   state/ShopManager.ts    – 局内 roguelike 商店
 *   state/ProgressManager.ts – 节点推进、通关结算、战利品、解锁
 *   state/MetaManager.ts    – 局外养成（升级 / 学技能 / 装配 / meta 解锁）
 */

export {
  type GamePhase,
  type ShopOffer,
  type LootOption,
  type PlacementEntry,
  type TerrainOverlayCell,
  type MetaState,
  type RunState,
  type EndlessCarry,
  type EndlessRunState,
  type MvpGameState,
  type BuyShopContext,
  META_VERSION,
  createInitialState,
  createInitialMeta,
  createRunState,
  requireRun,
  getCharacter,
  partyCharacters,
  deployedCharacters,
  benchCharacters,
  currentDungeon,
  currentNode,
  currentStage,
  currentEnemyScale,
  nodesUntilBoss,
  battleTerrain,
  shuffle,
  nextPid,
  resetPid,
} from './state/GameState';

export {
  canPlaceAt,
  canPlaceTerrain,
  terrainChargesTotal,
  placeTerrainCell,
  placeCharacter,
  removePlacement,
  cycleSkillForRoster,
  cycleTempSkillForRoster,
  effectiveOwnedSkillIds,
  signatureSkillId,
  activeSkillIdForRun,
  tempSkillIdForRoster,
  buildBattleUnits,
  undoDeployForRetry,
  getMaxDeploy,
} from './state/DeployManager';

export {
  rosterEligibleForTempSkill,
  rollShop,
  buyShopOffer,
} from './state/ShopManager';

export {
  NODE_FIRST_CLEAR_SOUL,
  BOSS_FIRST_CLEAR_SOUL,
  DUNGEON_REPEAT_SOUL,
  startRun,
  applyVictory,
  SWEEP_ROUNDS_PER_DAY,
  sweepQuota,
  sweepUsedToday,
  sweepLeftToday,
  canSweepChapter,
  chapterClearedForSweep,
  nodeClearedBefore,
  consumeSweep,
  applyChapterSweep,
  rollLoot,
  claimLoot,
  skipLoot,
  advanceNode,
  isRunComplete,
  finishRunVictory,
  type FinishRunResult,
  type ChapterClearPreview,
  dungeonClearSoul,
  previewChapterClear,
  recordRunBattleStats,
  recordRunPotionUse,
  recordRunShopBuy,
  chapterStarMask,
  hydrateChapterStars,
  abandonRun,
  applyDungeonClearUnlocks,
  isEndlessRun,
  endlessWavesCleared,
  applyEndlessWaveVictory,
  snapshotEndlessCarry,
  continueEndlessWave,
  finishEndlessRun,
} from './state/ProgressManager';

export {
  MAX_CHARACTER_LEVEL,
  levelUpCharacter,
  unlockCharacterWithMeta,
  unlockDungeonWithMeta,
  isDungeonUnlocked,
} from './state/MetaManager';

export {
  gmUnlockAllCharacters,
  gmAddSoul,
  gmPrepareSandboxRoster,
} from './state/gmCheats';
