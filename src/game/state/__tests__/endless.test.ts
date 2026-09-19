import { describe, expect, it } from 'vitest';
import {
  ENDLESS_DUNGEON_ID,
  ENDLESS_MILESTONE_EVERY,
  ENDLESS_MILESTONE_SOUL,
  endlessRecordBonus,
  endlessWaveVictorySoul,
} from '@/data/endlessCatalog';
import type { UnitState } from '@/battle/types';
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
import { buildBattleUnits } from '../DeployManager';
import { createInitialState, type MvpGameState } from '../GameState';

function newEndless(): MvpGameState {
  const s = createInitialState();
  startRun(s, ENDLESS_DUNGEON_ID, s.meta.roster.slice(0, 3).map((m) => m.rosterId));
  return s;
}

function dummyUnit(rosterId: string, hp = 20): UnitState {
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
  it('开局是无尽 run，不能扫荡，也没有通关终局', () => {
    const s = newEndless();
    expect(isEndlessRun(s)).toBe(true);
    expect(s.run?.endless).toEqual({ wave: 1, clearedCurrent: false, carry: null });
    expect(canSweepChapter(s, ENDLESS_DUNGEON_ID)).toBe(false);
    expect(isRunComplete(s)).toBe(false);
    expect(endlessWavesCleared(s)).toBe(0);
  });

  it('清一波当场给层数魂晶并掷三选一，离开时破纪录另奖', () => {
    const s = newEndless();
    const waveSoul = endlessWaveVictorySoul(1);
    applyEndlessWaveVictory(s);
    expect(s.meta.metaCurrency).toBe(waveSoul);
    expect(s.run!.lastVictory?.soul).toBe(waveSoul);
    expect(s.run!.pendingLoot?.length).toBe(3);
    expect(endlessWavesCleared(s)).toBe(1);
    expect(isRunComplete(s)).toBe(false);

    const rid = s.run!.partyRosterIds[0]!;
    continueEndlessWave(s, [dummyUnit(rid, 12)]);
    expect(s.run!.endless?.wave).toBe(2);
    expect(s.run!.endless?.clearedCurrent).toBe(false);
    expect(s.run!.endless?.carry?.[0]?.hp).toBe(12);
    expect(s.run!.pendingLoot).toBeNull();

    const bonus = finishEndlessRun(s);
    expect(bonus).toBe(endlessRecordBonus(0, 1));
    expect(s.meta.endlessBestFloor).toBe(1);
    expect(s.meta.metaCurrency).toBe(waveSoul + bonus);
    expect(s.run).toBeNull();
  });

  it('第 10 波通关仍继续，当场发层数 + 里程碑，离开才结算破纪录', () => {
    const s = newEndless();
    s.run!.endless = { wave: ENDLESS_MILESTONE_EVERY, clearedCurrent: false, carry: null };
    applyEndlessWaveVictory(s);
    expect(isRunComplete(s)).toBe(false);
    expect(s.run!.pendingLoot?.length).toBe(3);
    const granted = endlessWaveVictorySoul(ENDLESS_MILESTONE_EVERY);
    expect(granted).toBe(5 + ENDLESS_MILESTONE_SOUL);
    expect(s.meta.metaCurrency).toBe(granted);
    expect(s.run!.lastVictory?.soul).toBe(granted);

    const bonus = finishEndlessRun(s);
    expect(bonus).toBe(ENDLESS_MILESTONE_EVERY);
    expect(s.meta.metaCurrency).toBe(granted + bonus);
    expect(s.meta.endlessBestFloor).toBe(ENDLESS_MILESTONE_EVERY);
  });

  it('没破纪录离开不加魂晶', () => {
    const s = newEndless();
    s.meta.endlessBestFloor = 8;
    s.run!.endless = { wave: 4, clearedCurrent: true, carry: null };
    const before = s.meta.metaCurrency;
    const bonus = finishEndlessRun(s);
    expect(bonus).toBe(0);
    expect(s.meta.metaCurrency).toBe(before);
    expect(s.meta.endlessBestFloor).toBe(8);
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

  it('没捡的药带到下一波，不会在换波时清掉', () => {
    const s = newEndless();
    const rid = s.run!.partyRosterIds[0]!;
    s.run!.endless = {
      wave: 2,
      clearedCurrent: true,
      carry: [{ rosterId: rid, uid: 'keep', hp: 9, pos: { x: 1, y: 5 }, skillCd: 0 }],
      groundDrops: [{ pos: { x: 3, y: 2 }, potionId: 'heal' }],
    };
    s.run!.placements = [{ uid: 'keep', rosterId: rid, pos: { x: 1, y: 5 } }];
    continueEndlessWave(s, [dummyUnit(rid, 9)]);
    expect(s.run!.endless?.groundDrops).toEqual([{ pos: { x: 3, y: 2 }, potionId: 'heal' }]);
  });

  it('下一波刷怪不踩还在地上的药', () => {
    const s = newEndless();
    const rid = s.run!.partyRosterIds[0]!;
    const drop = { pos: { x: 3, y: 1 }, potionId: 'heal' as const };
    s.run!.placements = [{ uid: 'p1', rosterId: rid, pos: { x: 1, y: 7 } }];
    s.run!.endless = {
      wave: 2,
      clearedCurrent: false,
      carry: [{ rosterId: rid, uid: 'p1', hp: 20, pos: { x: 1, y: 7 }, skillCd: 0 }],
      groundDrops: [drop],
    };
    const enemies = buildBattleUnits(s).filter((u) => u.faction === 'enemy');
    expect(enemies.length).toBeGreaterThan(0);
    expect(enemies.some((e) => e.pos.x === drop.pos.x && e.pos.y === drop.pos.y)).toBe(false);
  });
});
