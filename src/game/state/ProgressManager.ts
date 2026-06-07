import { createStarterRoster, resetRosterIdCounter } from '@/game/mercenaryFactory';
import {
  addStatBonus,
  currentStage,
  resetPid,
  ZERO_STAT,
  type MvpGameState,
} from './GameState';

export function applyVictory(state: MvpGameState): void {
  state.gold += currentStage(state).goldReward;
}

export function advanceStage(state: MvpGameState): void {
  for (const p of state.placements) {
    state.offFieldStatByRosterId[p.rosterId] = addStatBonus(
      state.offFieldStatByRosterId[p.rosterId],
      p.statBonus ?? { ...ZERO_STAT },
    );
  }
  state.stageIndex += 1;
  state.placements = [];
  state.terrainOverlay = [];
  state.phase = 'deploy';
  state.adExtraSlot = 0;
}

export function resetRun(state: MvpGameState): void {
  resetPid();
  resetRosterIdCounter();
  state.stageIndex = 0;
  state.gold = 0;
  state.roster = createStarterRoster();
  state.placements = [];
  state.phase = 'deploy';
  state.lastReportWinner = null;
  state.terrainCharges = 0;
  state.terrainOverlay = [];
  state.potions = {};
  state.statPotions = {};
  state.offFieldStatByRosterId = {};
  state.adExtraSlot = 0;
}
