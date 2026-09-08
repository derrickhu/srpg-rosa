import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import {
  ELITE_ENEMY_SCALE,
  ELITE_REPEAT_SOUL,
  applyEliteTempSkillBoost,
  eliteDungeonOf,
  isEliteDungeon,
  listEliteDungeons,
  officialDungeonIdOfElite,
} from '@/data/eliteCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { adventureChapterList } from '@/data/sandboxLab';
import {
  NODE_FIRST_CLEAR_SOUL,
  applyChapterSweep,
  applyDungeonClearUnlocks,
  applyVictory,
  canSweepChapter,
  hydrateChapterProgress,
  startRun,
} from '@/game/state/ProgressManager';
import { createInitialMeta, createInitialState } from '@/game/state/GameState';

const ELITE_DUNGEON_DEFS = listEliteDungeons(DUNGEON_DEFS);

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

  it('getDungeonDef 认得精英 id，节点与主线同图同序', () => {
    expect(ELITE_DUNGEON_DEFS).toHaveLength(DUNGEON_DEFS.length);
    for (const official of DUNGEON_DEFS) {
      const elite = eliteDungeonOf(official);
      expect(elite, official.id).toBeDefined();
      expect(getDungeonDef(elite!.id)?.id).toBe(elite!.id);
      expect(officialDungeonIdOfElite(elite!.id)).toBe(official.id);
      expect(elite!.nodes).toHaveLength(official.nodes.length);
      elite!.nodes.forEach((n, i) => {
        const src = official.nodes[i]!;
        expect(n.kind, `${elite!.id}/${i}`).toBe(src.kind);
        expect(n.stageIndex, `${elite!.id}/${i}`).toBe(src.stageIndex);
        if (n.kind === 'shop') return;
        expect(n.enemyScale, `${elite!.id}/${i}`).toBeCloseTo((src.enemyScale ?? 1) * ELITE_ENEMY_SCALE);
      });
    }
  });

  it('三星与 metaReward 跟主线走，不另开一套', () => {
    for (const official of DUNGEON_DEFS) {
      const elite = eliteDungeonOf(official)!;
      expect(elite.metaReward, elite.id).toBe(official.metaReward);
      expect(elite.stars, elite.id).toEqual(official.stars);
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

  it('精英首通跟主线一样当场 +2，不走旧的一场 +8', () => {
    const s = createInitialState();
    applyDungeonClearUnlocks(s.meta, 'dungeon_grassland');
    startRun(s, 'elite_grassland', s.meta.roster.slice(0, 2).map((m) => m.rosterId));
    applyVictory(s);
    expect(s.run!.lastVictory?.firstClear).toBe(true);
    expect(s.run!.lastVictory?.soul).toBe(NODE_FIRST_CLEAR_SOUL);
    expect(s.meta.metaCurrency).toBe(NODE_FIRST_CLEAR_SOUL);
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
    expect(meta.clearedNodesByDungeonId.elite_swamp ?? 0).toBe(0);
  });
});

describe('精英局第二技能加压', () => {
  it('控制更狠更久，治疗抬一档，输出招倍率更高', () => {
    const snare = applyEliteTempSkillBoost(getSkillSpec('temp_gl_snare')!);
    expect(snare.onCastFoeEffects?.[0]).toMatchObject({ kind: 'spdDown', subSpd: 6, rounds: 3 });

    const salve = applyEliteTempSkillBoost(getSkillSpec('temp_gl_salve')!);
    expect(salve.onCastAllyEffects?.[0]).toMatchObject({ kind: 'heal', amount: 18 });

    const ram = applyEliteTempSkillBoost(getSkillSpec('temp_ft_ram')!);
    expect(ram.damage).toMatchObject({ kind: 'scaledAtk', atkMul: 0.75 });

    const bark = applyEliteTempSkillBoost(getSkillSpec('temp_fo_bark')!);
    expect(bark.onCastAllyEffects?.[0]).toMatchObject({ kind: 'guard', reduceRatio: 0.45, rounds: 3 });
  });
});
