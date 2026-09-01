import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { emptyRunStarStats } from '@/data/chapterStars';
import {
  DUNGEON_REPEAT_SOUL,
  applyVictory,
  advanceNode,
  finishRunVictory,
  hydrateChapterStars,
  isRunComplete,
  previewChapterClear,
  recordRunBattleStats,
  recordRunPotionUse,
  recordRunShopBuy,
  startRun,
} from '../ProgressManager';
import { createInitialState, type MvpGameState } from '../GameState';

const DUNGEON = DUNGEON_DEFS[0]!;

function party(state: MvpGameState): string[] {
  return state.meta.roster.slice(0, 2).map((m) => m.rosterId);
}

function winThrough(state: MvpGameState): void {
  startRun(state, DUNGEON.id, party(state));
  while (!isRunComplete(state)) {
    applyVictory(state);
    advanceNode(state);
  }
  applyVictory(state);
}

describe('整章按星发奖', () => {
  it('伤亡超标的首通只领第 1 星，不把整笔 metaReward 一次发完', () => {
    const s = createInitialState();
    startRun(s, DUNGEON.id, party(s));
    recordRunBattleStats(s.run!, { rounds: 999, allyDeaths: 2 });
    while (!isRunComplete(s)) {
      applyVictory(s);
      advanceNode(s);
    }
    applyVictory(s);
    const r = finishRunVictory(s);
    expect(r.newStars).toEqual([1]);
    expect(r.soul).toBe(DUNGEON.stars![0]!.soul);
    expect(s.meta.chapterStarsByDungeonId?.[DUNGEON.id]).toBe(0b001);
  });

  it('再打一趟完美通关：补领剩下的星，外加本关重复奖', () => {
    const s = createInitialState();
    startRun(s, DUNGEON.id, party(s));
    recordRunBattleStats(s.run!, { rounds: 999, allyDeaths: 2 });
    while (!isRunComplete(s)) {
      applyVictory(s);
      advanceNode(s);
    }
    applyVictory(s);
    finishRunVictory(s);

    winThrough(s);
    const r = finishRunVictory(s);
    expect(r.newStars).toEqual([2, 3]);
    expect(r.soul).toBe(
      DUNGEON.stars![1]!.soul + DUNGEON.stars![2]!.soul + DUNGEON_REPEAT_SOUL,
    );
    expect(s.meta.chapterStarsByDungeonId?.[DUNGEON.id]).toBe(0b111);
  });

  it('用药会挡住密林的第 3 星', () => {
    const forest = DUNGEON_DEFS.find((d) => d.id === 'dungeon_forest')!;
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON.id);
    s.meta.unlockedDungeonIds.push(forest.id);
    startRun(s, forest.id, party(s));
    recordRunPotionUse(s.run!);
    while (!isRunComplete(s)) {
      applyVictory(s);
      advanceNode(s);
    }
    applyVictory(s);
    const r = finishRunVictory(s);
    expect(r.newStars).not.toContain(3);
    expect(r.starMask & 0b100).toBe(0);
    expect(r.newStars).toEqual([1, 2]);
  });

  it('老档已通关补满三星，预览不再发通关奖', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON.id);
    const beforeHydrate = previewChapterClear(s, DUNGEON.id);
    expect(beforeHydrate.newStars).toEqual([]);
    expect(beforeHydrate.soul).toBe(DUNGEON_REPEAT_SOUL);
    hydrateChapterStars(s.meta);
    expect(s.meta.chapterStarsByDungeonId?.[DUNGEON.id]).toBe(0b111);
    const p = previewChapterClear(s, DUNGEON.id);
    expect(p.firstClear).toBe(false);
    expect(p.newStars).toEqual([]);
    expect(p.soul).toBe(DUNGEON_REPEAT_SOUL);
  });

  it('商店购买计入 noShop', () => {
    const s = createInitialState();
    startRun(s, DUNGEON.id, party(s));
    recordRunShopBuy(s.run!);
    expect(s.run!.starStats.shopBuys).toBe(1);
    recordRunBattleStats(s.run!, { rounds: 3, allyDeaths: 0 });
    expect(s.run!.starStats.battleRounds).toBe(3);
  });
});

describe('空统计', () => {
  it('emptyRunStarStats 四项都是 0', () => {
    expect(emptyRunStarStats()).toEqual({
      battleRounds: 0,
      allyDeaths: 0,
      potionsUsed: 0,
      shopBuys: 0,
    });
  });
});
