import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { ENDLESS_DUNGEON_ID } from '@/data/endlessCatalog';
import {
  activateRunLane,
  adventureRunOf,
  challengeRunOf,
  createInitialState,
} from '../GameState';
import { abandonRun, canSweepChapter, finishEndlessRun, startRun } from '../ProgressManager';

const CHAPTER = DUNGEON_DEFS[0]!;

function party(s: ReturnType<typeof createInitialState>): string[] {
  return s.meta.roster.slice(0, 3).map((m) => m.rosterId);
}

describe('冒险 / 副本两条线互不覆盖', () => {
  it('冒险进行中开无尽：冒险停到 parked，无尽成为当前局', () => {
    const s = createInitialState();
    startRun(s, CHAPTER.id, party(s));
    s.run!.nodeIndex = 2;
    startRun(s, ENDLESS_DUNGEON_ID, party(s));
    expect(s.run?.dungeonId).toBe(ENDLESS_DUNGEON_ID);
    expect(s.parkedRun?.dungeonId).toBe(CHAPTER.id);
    expect(s.parkedRun?.nodeIndex).toBe(2);
    expect(adventureRunOf(s)?.nodeIndex).toBe(2);
    expect(challengeRunOf(s)?.dungeonId).toBe(ENDLESS_DUNGEON_ID);
  });

  it('无尽打完后冒险进度还在，可以切回继续', () => {
    const s = createInitialState();
    startRun(s, CHAPTER.id, party(s));
    s.run!.gold = 12;
    startRun(s, ENDLESS_DUNGEON_ID, party(s));
    finishEndlessRun(s);
    expect(s.run).toBeNull();
    expect(adventureRunOf(s)?.gold).toBe(12);
    expect(activateRunLane(s, 'adventure')).toBe(true);
    expect(s.run?.dungeonId).toBe(CHAPTER.id);
    expect(s.run?.gold).toBe(12);
    expect(s.parkedRun).toBeNull();
  });

  it('进行中的无尽不挡章节扫荡；进行中的冒险仍挡', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(CHAPTER.id);
    startRun(s, ENDLESS_DUNGEON_ID, party(s));
    expect(canSweepChapter(s, CHAPTER.id)).toBe(true);

    startRun(s, CHAPTER.id, party(s));
    expect(canSweepChapter(s, CHAPTER.id)).toBe(false);

    startRun(s, ENDLESS_DUNGEON_ID, party(s));
    expect(canSweepChapter(s, CHAPTER.id), '冒险停在另一条线时也不能扫').toBe(false);
  });

  it('放弃冒险只丢掉冒险，挂起的无尽还在', () => {
    const s = createInitialState();
    startRun(s, ENDLESS_DUNGEON_ID, party(s));
    s.run!.endless = { wave: 3, clearedCurrent: false, carry: null };
    startRun(s, CHAPTER.id, party(s));
    abandonRun(s);
    expect(s.run).toBeNull();
    expect(challengeRunOf(s)?.endless?.wave).toBe(3);
    expect(activateRunLane(s, 'challenge')).toBe(true);
    expect(s.run?.dungeonId).toBe(ENDLESS_DUNGEON_ID);
  });
});
