import { describe, expect, it } from 'vitest';
import { getCharacterDef } from '@/data/characterCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import { characterSheetStats } from '@/game/characterFactory';
import {
  applyVictory,
  advanceNode,
  finishRunVictory,
  isRunComplete,
  previewChapterClear,
  startRun,
} from '../ProgressManager';
import { createInitialState, type MvpGameState } from '../GameState';

function party(state: MvpGameState): string[] {
  return state.meta.roster.slice(0, 2).map((m) => m.rosterId);
}

function winThrough(state: MvpGameState, dungeonId: string): void {
  startRun(state, dungeonId, party(state));
  while (!isRunComplete(state)) {
    applyVictory(state);
    advanceNode(state);
  }
  applyVictory(state);
}

describe('章节首通发跟人纹章', () => {
  it('草原首通给雷恩「草原开辟」，重复通关不再给', () => {
    const s = createInitialState();
    const preview = previewChapterClear(s, 'dungeon_grassland');
    expect(preview.firstClear).toBe(true);
    expect(preview.grantedEmblemIds).toEqual(['pe_ray_grassland']);
    expect(preview.unlockedRosterIds).toContain('hero_mage_aoli');

    winThrough(s, 'dungeon_grassland');
    const r = finishRunVictory(s);
    expect(r.grantedEmblemIds).toEqual(['pe_ray_grassland']);
    expect(s.meta.claimedPersonalEmblemIds).toContain('pe_ray_grassland');
    const ray = s.meta.roster.find((m) => m.rosterId === 'hero_sword_ray')!;
    const base = instantiateCharacter(getCharacterDef(ray.rosterId)!);
    base.level = ray.level;
    expect(characterSheetStats(ray, s.meta).atk).toBeGreaterThan(characterSheetStats(base, {
      claimedPersonalEmblemIds: [],
    }).atk);

    winThrough(s, 'dungeon_grassland');
    const again = finishRunVictory(s);
    expect(again.grantedEmblemIds).toEqual([]);
    expect(previewChapterClear(s, 'dungeon_grassland').grantedEmblemIds).toEqual([]);
  });

  it('通关结算预览和入账的解锁清单一致', () => {
    const s = createInitialState();
    winThrough(s, 'dungeon_grassland');
    const preview = previewChapterClear(s, 'dungeon_grassland');
    const r = finishRunVictory(s);
    expect(r.unlockedRosterIds).toEqual(preview.unlockedRosterIds);
    expect(r.grantedEmblemIds).toEqual(preview.grantedEmblemIds);
    expect(r.unlockedDungeonIds).toEqual(preview.unlockedDungeonIds);
    expect(r.unlockedDungeonIds).toEqual(expect.arrayContaining([
      'dungeon_forest',
      'elite_grassland',
    ]));
  });

  it('草原精英首通把「草原开辟」升到 2 级', () => {
    const s = createInitialState();
    winThrough(s, 'dungeon_grassland');
    finishRunVictory(s);
    expect(s.meta.personalEmblemLevelById?.pe_ray_grassland).toBe(1);
    const atkL1 = characterSheetStats(
      s.meta.roster.find((m) => m.rosterId === 'hero_sword_ray')!,
      s.meta,
    ).atk;

    winThrough(s, 'elite_grassland');
    const preview = previewChapterClear(s, 'elite_grassland');
    expect(preview.grantedEmblemIds).toEqual(['pe_ray_grassland']);
    expect(preview.grantedEmblemLevelById.pe_ray_grassland).toBe(2);
    const r = finishRunVictory(s);
    expect(r.grantedEmblemIds).toEqual(['pe_ray_grassland']);
    expect(r.grantedEmblemLevelById.pe_ray_grassland).toBe(2);
    expect(s.meta.personalEmblemLevelById?.pe_ray_grassland).toBe(2);
    const atkL2 = characterSheetStats(
      s.meta.roster.find((m) => m.rosterId === 'hero_sword_ray')!,
      s.meta,
    ).atk;
    expect(atkL2).toBe(atkL1 + 2);

    winThrough(s, 'elite_grassland');
    expect(finishRunVictory(s).grantedEmblemIds).toEqual([]);
  });
});
