import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import {
  ELITE_DUNGEON_DEFS,
  ELITE_FIRST_CLEAR_SOUL,
  ELITE_META_REWARD,
  ELITE_REPEAT_SOUL,
  eliteDungeonOf,
  isEliteDungeon,
  officialDungeonIdOfElite,
} from '@/data/eliteCatalog';
import { adventureChapterList } from '@/data/sandboxLab';
import { CHAPTER_STAGE_INDICES } from '@/data/stagesMvp';
import {
  applyChapterSweep,
  applyDungeonClearUnlocks,
  applyVictory,
  canSweepChapter,
  hydrateChapterProgress,
  startRun,
} from '@/game/state/ProgressManager';
import { createInitialMeta, createInitialState } from '@/game/state/GameState';

describe('精英本目录', () => {
  it('不进正式章节表，冒险页不会多滑出六张卡', () => {
    const officialIds = new Set(DUNGEON_DEFS.map((d) => d.id));
    for (const e of ELITE_DUNGEON_DEFS) {
      expect(officialIds.has(e.id), e.id).toBe(false);
      expect(isEliteDungeon(e.id)).toBe(true);
    }
    const list = adventureChapterList(DUNGEON_DEFS, true);
    expect(list.some((d) => isEliteDungeon(d.id))).toBe(false);
  });

  it('getDungeonDef 认得精英 id，和主线一对一', () => {
    expect(ELITE_DUNGEON_DEFS).toHaveLength(DUNGEON_DEFS.length);
    for (const official of DUNGEON_DEFS) {
      const elite = eliteDungeonOf(official.id);
      expect(elite, official.id).toBeDefined();
      expect(getDungeonDef(elite!.id)?.id).toBe(elite!.id);
      expect(officialDungeonIdOfElite(elite!.id)).toBe(official.id);
      expect(elite!.nodes).toHaveLength(1);
      expect(elite!.nodes[0]!.kind).toBe('battle');
    }
  });

  it('三星之和 = metaReward 12，不和主线串线', () => {
    for (const e of ELITE_DUNGEON_DEFS) {
      const sum = (e.stars ?? []).reduce((n, s) => n + s.soul, 0);
      expect(sum, e.id).toBe(ELITE_META_REWARD);
      expect(e.metaReward).toBe(ELITE_META_REWARD);
    }
  });

  it('精英关下标都在主线章之后', () => {
    const lastOfficial = Math.max(...CHAPTER_STAGE_INDICES.flat());
    for (const e of ELITE_DUNGEON_DEFS) {
      expect(e.nodes[0]!.stageIndex, e.id).toBeGreaterThan(lastOfficial);
    }
  });
});

describe('精英解锁与进度隔离', () => {
  it('通关主线章才解锁对应精英本', () => {
    const meta = createInitialMeta();
    const grassland = 'dungeon_grassland';
    expect(meta.unlockedDungeonIds.includes('elite_grassland')).toBe(false);
    applyDungeonClearUnlocks(meta, grassland);
    expect(meta.unlockedDungeonIds).toContain('elite_grassland');
    expect(meta.clearedDungeonIds).toContain(grassland);
    expect(meta.clearedDungeonIds.includes('elite_grassland')).toBe(false);
  });

  it('主线通关进度不写进精英本', () => {
    const s = createInitialState();
    applyDungeonClearUnlocks(s.meta, 'dungeon_grassland');
    s.meta.clearedNodesByDungeonId.dungeon_grassland = 99;
    expect(s.meta.clearedNodesByDungeonId.elite_grassland ?? 0).toBe(0);
  });

  it('精英首通当场 +8，不走普通节点 +2', () => {
    const s = createInitialState();
    applyDungeonClearUnlocks(s.meta, 'dungeon_grassland');
    startRun(s, 'elite_grassland', s.meta.roster.slice(0, 2).map((m) => m.rosterId));
    applyVictory(s);
    expect(s.run!.lastVictory?.firstClear).toBe(true);
    expect(s.run!.lastVictory?.soul).toBe(ELITE_FIRST_CLEAR_SOUL);
    expect(s.meta.metaCurrency).toBe(ELITE_FIRST_CLEAR_SOUL);
  });
});

describe('精英扫荡', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('通关后每日可扫 1 次，奖 5 魂晶', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push('elite_grassland');
    expect(canSweepChapter(s, 'elite_grassland')).toBe(true);
    expect(applyChapterSweep(s, 'elite_grassland').soul).toBe(ELITE_REPEAT_SOUL);
    expect(canSweepChapter(s, 'elite_grassland')).toBe(false);
    expect(applyChapterSweep(s, 'elite_grassland').soul).toBe(0);
  });
});

describe('老档 hydrate', () => {
  it('已通关的章把新节点算作已首通，并解锁精英本', () => {
    const meta = createInitialMeta();
    const swamp = DUNGEON_DEFS.find((d) => d.id === 'dungeon_swamp')!;
    meta.clearedDungeonIds.push(swamp.id);
    meta.clearedNodesByDungeonId[swamp.id] = 10;
    hydrateChapterProgress(meta);
    expect(meta.clearedNodesByDungeonId[swamp.id]).toBe(swamp.nodes.length);
    expect(meta.unlockedDungeonIds).toContain('elite_swamp');
    expect(meta.clearedDungeonIds.includes('elite_swamp')).toBe(false);
  });
});
