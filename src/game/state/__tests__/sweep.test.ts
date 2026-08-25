import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { ENDLESS_DUNGEON_ID } from '@/data/endlessCatalog';
import { SANDBOX_DUNGEON_ID } from '@/data/sandboxLab';
import {
  DUNGEON_REPEAT_SOUL,
  applyChapterSweep,
  canSweepChapter,
  chapterClearedForSweep,
  consumeSweep,
  startRun,
  sweepLeftToday,
  sweepQuota,
  sweepUsedToday,
} from '../ProgressManager';
import { createInitialState, type MvpGameState } from '../GameState';

const DUNGEON = DUNGEON_DEFS[0]!;

function fresh(): MvpGameState {
  return createInitialState();
}

function markChapterCleared(s: MvpGameState, dungeonId = DUNGEON.id): void {
  if (!s.meta.clearedDungeonIds.includes(dungeonId)) {
    s.meta.clearedDungeonIds.push(dungeonId);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('整章扫荡资格', () => {
  it('没通关不能扫：扫荡是兑现已有结果，不是白送通关', () => {
    const s = fresh();
    expect(chapterClearedForSweep(s.meta, DUNGEON.id)).toBe(false);
    expect(canSweepChapter(s, DUNGEON.id)).toBe(false);
  });

  it('整章通关后可以扫', () => {
    const s = fresh();
    markChapterCleared(s);
    expect(canSweepChapter(s, DUNGEON.id)).toBe(true);
  });

  it('进行中的冒险不能同时扫荡', () => {
    const s = fresh();
    markChapterCleared(s);
    startRun(s, DUNGEON.id, s.meta.roster.slice(0, 3).map((m) => m.rosterId));
    expect(canSweepChapter(s, DUNGEON.id)).toBe(false);
  });

  it('无尽和试炼场没有整章扫荡', () => {
    const s = fresh();
    s.meta.clearedDungeonIds.push(ENDLESS_DUNGEON_ID, SANDBOX_DUNGEON_ID);
    expect(canSweepChapter(s, ENDLESS_DUNGEON_ID)).toBe(false);
    expect(canSweepChapter(s, SANDBOX_DUNGEON_ID)).toBe(false);
  });
});

describe('每日扫荡配额', () => {
  it('配额按整章轮次给，每章每天一轮', () => {
    expect(sweepQuota(DUNGEON.id)).toBe(1);
    for (const d of DUNGEON_DEFS) {
      expect(sweepQuota(d.id), `${d.name} 每天应能扫一整章`).toBe(1);
    }
  });

  it('扫完一轮当天就扫不动了', () => {
    const s = fresh();
    markChapterCleared(s);
    expect(applyChapterSweep(s, DUNGEON.id).soul).toBe(DUNGEON_REPEAT_SOUL);
    expect(sweepLeftToday(s.meta, DUNGEON.id)).toBe(0);
    expect(canSweepChapter(s, DUNGEON.id)).toBe(false);
    expect(applyChapterSweep(s, DUNGEON.id).soul).toBe(0);
  });

  it('配额按副本分开算：草原扫空了，密林还是满的', () => {
    const s = fresh();
    markChapterCleared(s);
    consumeSweep(s, DUNGEON.id);
    const other = DUNGEON_DEFS[1]!;
    expect(sweepUsedToday(s.meta, DUNGEON.id)).toBe(1);
    expect(sweepUsedToday(s.meta, other.id)).toBe(0);
    expect(sweepLeftToday(s.meta, other.id)).toBe(sweepQuota(other.id));
  });

  it('跨天恢复', () => {
    const s = fresh();
    markChapterCleared(s);
    consumeSweep(s, DUNGEON.id);
    expect(sweepUsedToday(s.meta, DUNGEON.id)).toBe(1);

    vi.setSystemTime(new Date(2026, 7, 15, 0, 30, 0));
    expect(sweepUsedToday(s.meta, DUNGEON.id)).toBe(0);
    expect(canSweepChapter(s, DUNGEON.id)).toBe(true);
  });

  it('时钟回拨也当作新的一天，不会把玩家锁在零次上', () => {
    const s = fresh();
    markChapterCleared(s);
    consumeSweep(s, DUNGEON.id);
    expect(canSweepChapter(s, DUNGEON.id)).toBe(false);

    vi.setSystemTime(new Date(2026, 7, 13, 12, 0, 0));
    expect(canSweepChapter(s, DUNGEON.id)).toBe(true);
  });
});

describe('整章扫荡的奖励', () => {
  it('和手打重复通关拿同一笔魂晶，不另开一局', () => {
    const s = fresh();
    markChapterCleared(s);
    const before = s.meta.metaCurrency;
    const gained = applyChapterSweep(s, DUNGEON.id);
    expect(gained.soul).toBe(DUNGEON_REPEAT_SOUL);
    expect(s.meta.metaCurrency).toBe(before + DUNGEON_REPEAT_SOUL);
    expect(s.run).toBeNull();
  });
});
