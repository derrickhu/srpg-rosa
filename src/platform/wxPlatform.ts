/**
 * 微信能力封装占位：激励视频 / 插屏 / 本地存储等。
 * 广告位 ID 请仅在公众平台创建后填入，勿提交真实线上 ID 到公开仓库（可用本地 private 配置覆盖）。
 */
declare const wx: any;

export const AdConfigKeys = {
  /** 激励视频：战败复活（示例键名，与 BUILD.md 一致） */
  rewardRevive: 'WX_REWARD_ADUNIT_REVIVE',
  /** 激励视频：商店免费刷新 */
  rewardShopRefresh: 'WX_REWARD_ADUNIT_SHOP_REFRESH',
} as const;

export function hasWx(): boolean {
  return typeof wx !== 'undefined';
}

export function safeStorageGet(key: string): string | null {
  if (!hasWx()) return null;
  try {
    return wx.getStorageSync(key) as string;
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): void {
  if (!hasWx()) return;
  try {
    wx.setStorageSync(key, value);
  } catch {
    /* ignore */
  }
}
