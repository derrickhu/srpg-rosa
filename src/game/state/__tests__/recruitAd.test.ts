import { describe, expect, it } from 'vitest';
import { createInitialState } from '@/game/state/GameState';
import { recordRecruitAdWatch, recruitAdSeen } from '@/game/state/MetaManager';

describe('招募页看广告解锁', () => {
  it('看满两次才入队，第一次只记进度', () => {
    const s = createInitialState();
    const before = s.meta.roster.length;
    expect(recordRecruitAdWatch(s, 'hero_shield_kelan')).toBe('progress');
    expect(recruitAdSeen(s.meta, 'hero_shield_kelan')).toBe(1);
    expect(s.meta.roster).toHaveLength(before);
    expect(recordRecruitAdWatch(s, 'hero_shield_kelan')).toBe('unlocked');
    expect(s.meta.roster.some((m) => m.rosterId === 'hero_shield_kelan')).toBe(true);
    expect(recruitAdSeen(s.meta, 'hero_shield_kelan')).toBe(0);
    expect(s.meta.metaCurrency).toBe(0);
  });

  it('魂晶角色不能靠广告白拿', () => {
    const s = createInitialState();
    expect(recordRecruitAdWatch(s, 'hero_cav_lance')).toBe('rejected');
    expect(s.meta.roster.some((m) => m.rosterId === 'hero_cav_lance')).toBe(false);
  });

  it('已经入队再看不加第二次', () => {
    const s = createInitialState();
    recordRecruitAdWatch(s, 'hero_shield_kelan');
    recordRecruitAdWatch(s, 'hero_shield_kelan');
    expect(recordRecruitAdWatch(s, 'hero_shield_kelan')).toBe('rejected');
    expect(s.meta.roster.filter((m) => m.rosterId === 'hero_shield_kelan')).toHaveLength(1);
  });
});
