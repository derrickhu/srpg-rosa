/**
 * 抖音侧边栏每日魂晶、添加到桌面一次魂晶。微信不走这里。
 */
import type { MetaState } from '@/game/state/GameState';

/** 和整章重复通关同一量级，避免侧边栏变成刷魂晶的口子 */
export const DOUYIN_SIDEBAR_SOUL = 5;
export const DOUYIN_DESKTOP_SOUL = 10;

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sidebarClaimedToday(meta: MetaState, today = localDateKey()): boolean {
  return meta.douyinSidebarRewardDate === today;
}

export function claimSidebarReward(
  meta: MetaState,
  fromSidebar: boolean,
  today = localDateKey(),
): boolean {
  if (!fromSidebar || sidebarClaimedToday(meta, today)) return false;
  meta.metaCurrency += DOUYIN_SIDEBAR_SOUL;
  meta.douyinSidebarRewardDate = today;
  return true;
}

export function claimDesktopReward(meta: MetaState): boolean {
  if (meta.douyinDesktopRewardClaimed) return false;
  meta.metaCurrency += DOUYIN_DESKTOP_SOUL;
  meta.douyinDesktopRewardClaimed = true;
  return true;
}
