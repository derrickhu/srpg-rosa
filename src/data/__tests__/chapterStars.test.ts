import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import {
  CHAPTER_STAR_COUNT,
  evaluateChapterStars,
  starCondLabel,
  starBitMask,
  countStarBits,
  emptyRunStarStats,
} from '@/data/chapterStars';

describe('章节三星配置', () => {
  it('正式章节恰好 3 星，第 1 条是通关，魂晶之和等于 metaReward', () => {
    expect(DUNGEON_DEFS.length).toBeGreaterThan(0);
    for (const d of DUNGEON_DEFS) {
      expect(d.stars, d.id).toBeDefined();
      expect(d.stars!.length, d.id).toBe(CHAPTER_STAR_COUNT);
      expect(d.stars![0]!.cond.kind, d.id).toBe('clear');
      const sum = d.stars!.reduce((n, s) => n + s.soul, 0);
      expect(sum, d.id).toBe(d.metaReward);
    }
  });

  it('文案由 kind 生成，不另写一份', () => {
    expect(starCondLabel({ kind: 'clear' })).toBe('成功通关');
    expect(starCondLabel({ kind: 'maxRounds', max: 48 })).toBe('48 回合内通关');
    expect(starCondLabel({ kind: 'maxDeaths', max: 0 })).toBe('无人伤亡');
    expect(starCondLabel({ kind: 'maxDeaths', max: 2 })).toBe('伤亡 2 人以内');
    expect(starCondLabel({ kind: 'noPotion' })).toBe('不使用药剂');
    expect(starCondLabel({ kind: 'noShop' })).toBe('不购买补给');
  });
});

describe('评星判定', () => {
  const grassland = DUNGEON_DEFS[0]!.stars!;

  it('通关时第 1 星恒真；0 统计在草原能拿满三星', () => {
    const got = evaluateChapterStars(grassland, emptyRunStarStats());
    expect(got).toEqual([true, true, true]);
    expect(countStarBits(starBitMask(got))).toBe(3);
  });

  it('回合或伤亡超标就掉对应的星', () => {
    const slow = evaluateChapterStars(grassland, {
      ...emptyRunStarStats(),
      battleRounds: 999,
      allyDeaths: 1,
    });
    expect(slow).toEqual([true, false, false]);
  });
});
