import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { GRASS_HUNT_DUNGEON_ID, BOSS_RUSH_DUNGEON_ID } from '@/data/eventCatalog';
import { getSkillMod } from '@/data/skillModCatalog';
import {
  adventureRunOf,
  challengeRunOf,
  createInitialState,
} from '@/game/state/GameState';
import {
  canSweepChapter,
  finishBossRush,
  finishGrassHunt,
  previewGrassHuntReward,
  rollRareOpeningLoot,
  startEventRun,
  startRun,
} from '@/game/state/ProgressManager';

const SAT = new Date(2026, 8, 26);
const MONTH = new Date(2026, 8, 3);
const MONDAY = new Date(2026, 8, 28);

describe('限时战结算', () => {
  it('围猎和冒险各占一条线，不能扫荡', () => {
    const s = createInitialState();
    const party = s.meta.roster.slice(0, 2).map((m) => m.rosterId);
    startRun(s, DUNGEON_DEFS[0]!.id, party);
    s.run!.nodeIndex = 1;
    startEventRun(s, GRASS_HUNT_DUNGEON_ID);
    expect(s.run?.dungeonId).toBe(GRASS_HUNT_DUNGEON_ID);
    expect(adventureRunOf(s)?.dungeonId).toBe(DUNGEON_DEFS[0]!.id);
    expect(adventureRunOf(s)?.nodeIndex).toBe(1);
    expect(challengeRunOf(s)?.dungeonId).toBe(GRASS_HUNT_DUNGEON_ID);
    expect(canSweepChapter(s, GRASS_HUNT_DUNGEON_ID)).toBe(false);
    expect(canSweepChapter(s, BOSS_RUSH_DUNGEON_ID)).toBe(false);
  });

  it('开局三选一只出稀有词条', () => {
    const s = createInitialState();
    startEventRun(s, GRASS_HUNT_DUNGEON_ID);
    const loot = rollRareOpeningLoot(s, () => 0.1);
    expect(loot.length).toBe(3);
    for (const opt of loot) {
      expect(opt.kind).toBe('skillMod');
      if (opt.kind === 'skillMod') expect(getSkillMod(opt.modId)?.rarity).toBe('rare');
    }
  });

  it('围猎周末通关给 10，无人阵亡再加 4，同一周末不发第二次', () => {
    const s = createInitialState();
    startEventRun(s, GRASS_HUNT_DUNGEON_ID);
    s.run!.event!.allyDeaths = 0;
    const first = finishGrassHunt(s, SAT);
    expect(first.soul).toBe(14);
    expect(first.cleanBonus).toBe(4);
    expect(first.jade).toBe(0);
    expect(s.meta.metaCurrency).toBe(14);
    expect(s.meta.eventClaims?.grassHuntWeek).toBe('2026-09-26');
    expect(s.run).toBeNull();

    startEventRun(s, GRASS_HUNT_DUNGEON_ID);
    s.run!.event!.allyDeaths = 0;
    expect(previewGrassHuntReward(s, SAT).alreadyClaimed).toBe(true);
    const again = finishGrassHunt(s, SAT);
    expect(again.soul).toBe(0);
    expect(s.meta.metaCurrency).toBe(14);
  });

  it('围猎有人阵亡就没有额外魂晶，窗口外通关不发奖', () => {
    const s = createInitialState();
    startEventRun(s, GRASS_HUNT_DUNGEON_ID);
    s.run!.event!.allyDeaths = 1;
    expect(finishGrassHunt(s, SAT).soul).toBe(10);

    startEventRun(s, GRASS_HUNT_DUNGEON_ID);
    s.run!.event!.allyDeaths = 0;
    const closed = finishGrassHunt(s, MONDAY);
    expect(closed.inWindow).toBe(false);
    expect(closed.soul).toBe(0);
    expect(s.meta.metaCurrency).toBe(10);
  });

  it('连战每月给 18 魂晶和 1 纹玉，不记进章节首通', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON_DEFS[0]!.id, DUNGEON_DEFS[1]!.id, DUNGEON_DEFS[2]!.id);
    startEventRun(s, BOSS_RUSH_DUNGEON_ID);
    expect(s.run?.event?.bossStageIndices?.length).toBe(3);
    const paid = s.meta.universalEmblemPaidDungeonIds ?? [];
    const reward = finishBossRush(s, MONTH);
    expect(reward.soul).toBe(18);
    expect(reward.jade).toBe(1);
    expect(s.meta.metaCurrency).toBe(18);
    expect(s.meta.universalEmblemTokens).toBe(1);
    expect(s.meta.universalEmblemPaidDungeonIds ?? []).toEqual(paid);

    startEventRun(s, BOSS_RUSH_DUNGEON_ID);
    expect(finishBossRush(s, MONTH).soul).toBe(0);
    expect(s.meta.universalEmblemTokens).toBe(1);
  });
});
