import { describe, expect, it } from 'vitest';
import {
  ENDLESS_CLEAR_BONUS,
  ENDLESS_DUNGEON_ID,
  ENDLESS_MAX_WAVES,
  ENDLESS_WAVE_SOUL,
} from '@/data/endlessCatalog';
import type { UnitState } from '@/battle/types';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  applyEndlessWaveVictory,
  canSweepChapter,
  continueEndlessWave,
  endlessWavesCleared,
  finishEndlessRun,
  isEndlessRun,
  isRunComplete,
  startRun,
} from '../ProgressManager';
import { createInitialState, type MvpGameState } from '../GameState';

function newEndless(): MvpGameState {
  const s = createInitialState();
  startRun(s, ENDLESS_DUNGEON_ID, s.meta.roster.slice(0, 3).map((m) => m.rosterId));
  return s;
}

function dummyUnit(rosterId: string, hp = 20): UnitState {
  const d = UNIT_DEFS.sword;
  return {
    uid: `u_${rosterId}`,
    defId: 'sword',
    faction: 'player',
    hp,
    pos: { x: 2, y: 6 },
    skillCd: 0,
    movedInTurn: false,
    rosterId,
  };
}

describe('无尽试炼结算', () => {
  it('开局是无尽 run，不能扫荡', () => {
    const s = newEndless();
    expect(isEndlessRun(s)).toBe(true);
    expect(s.run?.endless).toEqual({ wave: 1, clearedCurrent: false, carry: null });
    expect(canSweepChapter(s, ENDLESS_DUNGEON_ID)).toBe(false);
    expect(isRunComplete(s)).toBe(false);
    expect(endlessWavesCleared(s)).toBe(0);
  });

  it('清一波当场给魂晶并掷三选一，最高波在离开时更新', () => {
    const s = newEndless();
    applyEndlessWaveVictory(s);
    expect(s.meta.metaCurrency).toBe(ENDLESS_WAVE_SOUL);
    expect(s.run!.lastVictory?.soul).toBe(ENDLESS_WAVE_SOUL);
    expect(s.run!.pendingLoot?.length).toBe(3);
    expect(endlessWavesCleared(s)).toBe(1);
    expect(isRunComplete(s)).toBe(false);

    const rid = s.run!.partyRosterIds[0]!;
    continueEndlessWave(s, [dummyUnit(rid, 12)]);
    expect(s.run!.endless?.wave).toBe(2);
    expect(s.run!.endless?.clearedCurrent).toBe(false);
    expect(s.run!.endless?.carry?.[0]?.hp).toBe(12);
    expect(s.run!.pendingLoot).toBeNull();

    const waves = finishEndlessRun(s);
    expect(waves).toBe(0);
    expect(s.meta.endlessBestFloor).toBe(1);
    expect(s.run).toBeNull();
  });

  it('打完第 10 波才算通关，离开时再给通关奖', () => {
    const s = newEndless();
    s.run!.endless = { wave: ENDLESS_MAX_WAVES, clearedCurrent: false, carry: null };
    applyEndlessWaveVictory(s);
    expect(isRunComplete(s)).toBe(true);
    expect(s.run!.pendingLoot).toBeNull();
    expect(s.meta.metaCurrency).toBe(ENDLESS_WAVE_SOUL);

    const bonus = finishEndlessRun(s);
    expect(bonus).toBe(ENDLESS_CLEAR_BONUS);
    expect(s.meta.metaCurrency).toBe(ENDLESS_WAVE_SOUL + ENDLESS_CLEAR_BONUS);
    expect(s.meta.endlessBestFloor).toBe(ENDLESS_MAX_WAVES);
  });

  it('没有新快照时沿用已存的 carry，避免断线后下一波空场', () => {
    const s = newEndless();
    const rid = s.run!.partyRosterIds[0]!;
    s.run!.endless = {
      wave: 3,
      clearedCurrent: true,
      carry: [{ rosterId: rid, uid: 'keep', hp: 9, pos: { x: 1, y: 5 }, skillCd: 2 }],
    };
    s.run!.placements = [{ uid: 'old', rosterId: rid, pos: { x: 0, y: 7 } }];
    continueEndlessWave(s, []);
    expect(s.run!.endless?.wave).toBe(4);
    expect(s.run!.endless?.carry?.[0]).toMatchObject({ uid: 'keep', hp: 9, pos: { x: 1, y: 5 } });
    expect(s.run!.placements[0]).toMatchObject({ pos: { x: 1, y: 5 }, uid: 'keep' });
  });
});
