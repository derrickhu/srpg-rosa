import { describe, expect, it } from 'vitest';
import {
  bossFirstKillDropLabel,
  previewBossFirstKillDrops,
  shouldPresentBossFirstKill,
} from '@/view/battle/bossFirstKill';
import { claimPersonalEmblemsForDungeon } from '@/data/personalEmblemCatalog';

describe('Boss 首杀掉落与专页', () => {
  it('只有 Boss 节点、且还没领过，才掉永久纹章', () => {
    const meta = { claimedPersonalEmblemIds: [] as string[] };
    const drops = previewBossFirstKillDrops(meta, 'dungeon_grassland', 'boss');
    expect(drops).toEqual([expect.objectContaining({
      emblemId: 'pe_ray_grassland',
      iconKey: 'emblem_pe_grassland',
      name: '草原开辟',
      level: 1,
      rosterId: 'hero_sword_ray',
    })]);
    expect(previewBossFirstKillDrops(meta, 'dungeon_grassland', 'battle')).toEqual([]);
  });

  it('已经铭刻的再打 Boss 不再掉', () => {
    const meta = { claimedPersonalEmblemIds: [] as string[], personalEmblemLevelById: {} };
    claimPersonalEmblemsForDungeon(meta, 'dungeon_grassland');
    expect(previewBossFirstKillDrops(meta, 'dungeon_grassland', 'boss')).toEqual([]);
  });

  it('精英首通掉同一枚，标成 2 级', () => {
    const meta = { claimedPersonalEmblemIds: [] as string[], personalEmblemLevelById: {} };
    claimPersonalEmblemsForDungeon(meta, 'dungeon_grassland');
    const drops = previewBossFirstKillDrops(meta, 'elite_grassland', 'boss');
    expect(drops).toEqual([expect.objectContaining({
      emblemId: 'pe_ray_grassland',
      level: 2,
    })]);
    expect(bossFirstKillDropLabel(drops[0]!)).toBe('草原开辟 · 2级');
  });

  it('只有整章打完且真有发放才出首杀专页', () => {
    expect(shouldPresentBossFirstKill(true, 1)).toBe(true);
    expect(shouldPresentBossFirstKill(false, 1)).toBe(false);
    expect(shouldPresentBossFirstKill(true, 0)).toBe(false);
  });
});
