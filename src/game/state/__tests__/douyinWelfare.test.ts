import { describe, expect, it } from 'vitest';
import {
  claimDesktopReward,
  claimSidebarReward,
  DOUYIN_DESKTOP_SOUL,
  DOUYIN_SIDEBAR_SOUL,
  sidebarClaimedToday,
} from '@/game/state/douyinWelfare';
import { isFromDouyinSidebar } from '@/platform/douyinEntry';
import type { MetaState } from '@/game/state/GameState';

function meta(soul = 0): MetaState {
  return { metaCurrency: soul } as MetaState;
}

describe('抖音福利奖励', () => {
  it('不是从侧边栏进来不能领', () => {
    const state = meta(1);
    expect(claimSidebarReward(state, false, '2026-10-28')).toBe(false);
    expect(state.metaCurrency).toBe(1);
    expect(state.douyinSidebarRewardDate).toBeUndefined();
  });

  it('侧边栏当天领一次魂晶，同一天再领失败', () => {
    const state = meta(2);
    expect(claimSidebarReward(state, true, '2026-10-28')).toBe(true);
    expect(state.metaCurrency).toBe(2 + DOUYIN_SIDEBAR_SOUL);
    expect(sidebarClaimedToday(state, '2026-10-28')).toBe(true);
    expect(claimSidebarReward(state, true, '2026-10-28')).toBe(false);
    expect(state.metaCurrency).toBe(2 + DOUYIN_SIDEBAR_SOUL);
  });

  it('第二天可以再领', () => {
    const state = meta(0);
    claimSidebarReward(state, true, '2026-10-28');
    expect(claimSidebarReward(state, true, '2026-10-29')).toBe(true);
    expect(state.metaCurrency).toBe(DOUYIN_SIDEBAR_SOUL * 2);
  });

  it('桌面奖励只发一次', () => {
    const state = meta(0);
    expect(claimDesktopReward(state)).toBe(true);
    expect(state.metaCurrency).toBe(DOUYIN_DESKTOP_SOUL);
    expect(state.douyinDesktopRewardClaimed).toBe(true);
    expect(claimDesktopReward(state)).toBe(false);
    expect(state.metaCurrency).toBe(DOUYIN_DESKTOP_SOUL);
  });

  it('侧边栏启动参数必须同时满足场景、来源和位置', () => {
    expect(isFromDouyinSidebar({
      scene: '021036',
      launch_from: 'homepage',
      location: 'sidebar_card',
    })).toBe(true);
    expect(isFromDouyinSidebar({
      scene: '021036',
      query: { launch_from: 'homepage', location: 'sidebar_card' },
    })).toBe(true);
    expect(isFromDouyinSidebar({
      scene: '021036',
      launch_from: 'homepage',
      location: 'desktop',
    })).toBe(false);
    expect(isFromDouyinSidebar(undefined)).toBe(false);
  });
});
