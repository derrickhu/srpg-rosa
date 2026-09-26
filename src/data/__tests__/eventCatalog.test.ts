import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { STAGES_MVP } from '@/data/stagesMvp';
import {
  HUNT_PACK_TOTAL,
  bossRushEnemyScale,
  bossRushMonthKey,
  bossRushStageIndexes,
  chapterCapstoneStageIndex,
  eventClaimLabel,
  generateHuntPackSpawns,
  grassHuntWeekKey,
  huntHowlDue,
  huntHowlHeal,
  huntPackCount,
  huntPackScale,
} from '@/data/eventCatalog';
import { endlessTerrain } from '@/data/endlessCatalog';
import { createInitialMeta } from '@/game/state/GameState';

describe('限时活动窗口', () => {
  const saturday = new Date(2026, 8, 26);
  const sunday = new Date(2026, 8, 27);
  const monday = new Date(2026, 8, 28);

  it('周六和周日共用同一个周末键', () => {
    expect(grassHuntWeekKey(saturday)).toBe('2026-09-26');
    expect(grassHuntWeekKey(sunday)).toBe('2026-09-26');
    expect(grassHuntWeekKey(monday)).toBeNull();
  });

  it('连战只在每月 1 日至 7 日', () => {
    expect(bossRushMonthKey(new Date(2026, 8, 1))).toBe('2026-09');
    expect(bossRushMonthKey(new Date(2026, 8, 7))).toBe('2026-09');
    expect(bossRushMonthKey(new Date(2026, 8, 8))).toBeNull();
  });

  it('领过的窗口在卡片上写出来', () => {
    const meta = createInitialMeta();
    meta.eventClaims = { grassHuntWeek: '2026-09-26', bossRushMonth: '2026-09' };
    expect(eventClaimLabel('event_grass_hunt', meta, saturday)).toBe('本周已领');
    expect(eventClaimLabel('event_grass_hunt', meta, monday)).toBeNull();
    expect(eventClaimLabel('event_boss_rush', meta, new Date(2026, 8, 3))).toBe('本月已领');
    expect(eventClaimLabel('event_boss_rush', meta, new Date(2026, 8, 9))).toBeNull();
  });
});

describe('草原围猎编队', () => {
  it('五群人数递增，头狼在第一只', () => {
    expect(huntPackCount(1)).toBe(4);
    expect(huntPackCount(5)).toBe(6);
    expect(huntPackScale(1)).toBe(1);
    expect(huntPackScale(5)).toBeCloseTo(1.48);
    const pack = generateHuntPackSpawns(3, endlessTerrain(), [], 7);
    expect(pack).toHaveLength(5);
    expect(pack[0]!.name).toBe('头狼');
    expect(pack[0]!.boss).toBe(true);
    expect(pack[0]!.uid).toBe('hunt_3_0');
  });

  it('头狼活过六回合，下一回合开始才吼', () => {
    expect(huntHowlDue(1, 6, false, true)).toBe(false);
    expect(huntHowlDue(1, 7, false, true)).toBe(true);
    expect(huntHowlDue(1, 7, true, true)).toBe(false);
    expect(huntHowlDue(1, 7, false, false)).toBe(false);
    expect(huntHowlDue(7, 12, false, true)).toBe(false);
    expect(huntHowlDue(7, 13, false, true)).toBe(true);
    expect(huntHowlHeal(100)).toBe(15);
    expect(huntHowlHeal(10)).toBe(8);
  });
});

describe('首领连战选关', () => {
  it('不够三章没有对手', () => {
    const meta = createInitialMeta();
    meta.clearedDungeonIds.push(DUNGEON_DEFS[0]!.id, DUNGEON_DEFS[1]!.id);
    expect(bossRushStageIndexes(meta)).toEqual([]);
  });

  it('取已通关里最高的三章，从弱到强', () => {
    const meta = createInitialMeta();
    meta.clearedDungeonIds.push(
      DUNGEON_DEFS[0]!.id,
      DUNGEON_DEFS[2]!.id,
      DUNGEON_DEFS[4]!.id,
      DUNGEON_DEFS[5]!.id,
    );
    const stages = bossRushStageIndexes(meta);
    expect(stages).toEqual([
      chapterCapstoneStageIndex(2),
      chapterCapstoneStageIndex(4),
      chapterCapstoneStageIndex(5),
    ]);
    expect(STAGES_MVP[stages[0]!]!.isBoss).toBe(true);
    expect(bossRushEnemyScale(stages[0]!)).toBeGreaterThan(1);
  });

  it('草原收尾战不是首领关，缩放不加 1.1', () => {
    const si = chapterCapstoneStageIndex(0);
    expect(STAGES_MVP[si]!.isBoss).toBeFalsy();
    expect(bossRushEnemyScale(si)).toBe(1);
    expect(HUNT_PACK_TOTAL).toBe(5);
  });
});
