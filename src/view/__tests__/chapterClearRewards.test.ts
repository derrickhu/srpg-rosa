import { describe, expect, it } from 'vitest';
import type { ChapterClearPreview } from '@/game/state/ProgressManager';
import { chapterClearRewardEntries } from '@/view/battle/chapterClearRewards';

const EMPTY: ChapterClearPreview = {
  soul: 0,
  firstClear: false,
  newStars: [],
  labels: [],
  starMask: 0,
  starBeats: [],
  unlockedRosterIds: [],
  grantedEmblemIds: [],
  grantedEmblemLevelById: {},
  unlockedDungeonIds: [],
};

describe('通关奖励格拆开', () => {
  it('首通只出魂晶和纹章，入队与解锁不进这屏', () => {
    const entries = chapterClearRewardEntries({
      ...EMPTY,
      soul: 10,
      firstClear: true,
      newStars: [1, 2, 3],
      labels: ['成功通关', '48 回合内通关', '无人伤亡'],
      unlockedRosterIds: ['hero_mage_aoli'],
      grantedEmblemIds: ['pe_ray_grassland'],
      grantedEmblemLevelById: { pe_ray_grassland: 1 },
      unlockedDungeonIds: ['dungeon_forest', 'elite_grassland'],
    }, '草原战线');
    expect(entries.map((e) => e.name)).toEqual(['魂晶', '草原开辟']);
    expect(entries.find((e) => e.name === '草原开辟')).toMatchObject({
      badge: '永久纹章',
      whoRosterId: 'hero_sword_ray',
      quality: '雷恩',
    });
  });

  it('精英首通把同一枚写成 2 级', () => {
    const entries = chapterClearRewardEntries({
      ...EMPTY,
      soul: 5,
      firstClear: true,
      grantedEmblemIds: ['pe_ray_grassland'],
      grantedEmblemLevelById: { pe_ray_grassland: 2 },
    }, '草原战线 · 精英');
    const tile = entries.find((e) => e.name.includes('草原开辟'));
    expect(tile?.name).toBe('草原开辟 · 2级');
    expect(tile?.quality).toContain('2级');
    expect(tile?.whoRosterId).toBe('hero_sword_ray');
    expect(tile?.desc).toContain('攻击 +4');
  });

  it('重复通关只剩魂晶，不再冒已经拿过的人', () => {
    const entries = chapterClearRewardEntries({
      ...EMPTY,
      soul: 3,
      firstClear: false,
    }, '草原战线');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: '魂晶', amount: 3 });
  });
});
