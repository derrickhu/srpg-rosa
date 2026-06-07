import { safeStorageGet, safeStorageSet } from '@/platform/wxPlatform';
import type { MvpGameState } from '@/game/state/GameState';
import { createInitialState } from '@/game/state/GameState';

const SAVE_KEY = 'srpg_save_v1';

export interface SavePayload {
  version: 1;
  state: MvpGameState;
  savedAt: number;
}

export const SaveManager = {
  save(state: MvpGameState): boolean {
    const payload: SavePayload = {
      version: 1,
      state,
      savedAt: Date.now(),
    };
    try {
      const json = JSON.stringify(payload);
      safeStorageSet(SAVE_KEY, json);
      return true;
    } catch (e) {
      console.warn('[SaveManager] save failed:', e);
      return false;
    }
  },

  load(): MvpGameState | null {
    try {
      const raw = safeStorageGet(SAVE_KEY);
      if (!raw) return null;
      const payload: SavePayload = JSON.parse(raw);
      if (payload.version !== 1) return null;
      if (!payload.state || typeof payload.state.stageIndex !== 'number') return null;
      return payload.state;
    } catch (e) {
      console.warn('[SaveManager] load failed:', e);
      return null;
    }
  },

  clear(): void {
    safeStorageSet(SAVE_KEY, '');
  },

  /** Load saved state, falling back to a fresh initial state. */
  loadOrCreate(): MvpGameState {
    return SaveManager.load() ?? createInitialState();
  },
};
