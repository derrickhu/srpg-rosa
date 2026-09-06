import { analytics } from '@/analytics/gpAnalytics';
import { hasWx, AdConfigKeys } from './wxPlatform';

declare const wx: any;

export type AdScenario = 'lootRefresh' | 'shopRefresh' | 'extraDeploy' | 'revive';

const SCENARIO_AD_UNIT: Record<AdScenario, string> = {
  lootRefresh: AdConfigKeys.rewardLootRefresh,
  shopRefresh: AdConfigKeys.rewardShopRefresh,
  extraDeploy: AdConfigKeys.rewardExtraDeploy,
  revive: AdConfigKeys.rewardRevive,
};

let rewardedCache: Map<string, any> = new Map();
let interstitialInstance: any = null;
let showing = false;

export function adUnitIdFor(scenario: AdScenario): string {
  return SCENARIO_AD_UNIT[scenario];
}

function getRewardedAd(adUnitId: string): any {
  if (!hasWx() || typeof wx.createRewardedVideoAd !== 'function') return null;
  if (rewardedCache.has(adUnitId)) return rewardedCache.get(adUnitId);
  try {
    const ad = wx.createRewardedVideoAd({ adUnitId });
    ad.onError?.((err: unknown) => {
      console.warn('[AdManager] rewarded error:', err);
    });
    rewardedCache.set(adUnitId, ad);
    return ad;
  } catch (e) {
    console.warn('[AdManager] createRewardedVideoAd failed:', e);
    return null;
  }
}

/**
 * 非微信环境（浏览器 / 单测）直接发奖，方便把刷新 / 复活整条链路跑通。
 * 真机只在看完激励视频（`isEnded === true`）后发奖。
 */
export const AdManager = {
  showRewarded(scenario: AdScenario): Promise<boolean> {
    const adUnitId = SCENARIO_AD_UNIT[scenario];
    if (!hasWx()) {
      analytics.trackAdShow(scenario, { ad_unit_id: adUnitId, mock: true });
      analytics.trackAdClose(scenario, true, { ad_unit_id: adUnitId, mock: true });
      return Promise.resolve(true);
    }

    const ad = getRewardedAd(adUnitId);
    if (!ad) {
      console.warn('[AdManager] No ad instance for', scenario);
      return Promise.resolve(false);
    }
    if (showing) return Promise.resolve(false);
    showing = true;

    analytics.trackAdShow(scenario, { ad_unit_id: adUnitId });
    return new Promise<boolean>((resolve) => {
      const finish = (completed: boolean, extra: Record<string, unknown> = {}): void => {
        showing = false;
        analytics.trackAdClose(scenario, completed, { ad_unit_id: adUnitId, ...extra });
        resolve(completed);
      };
      const onClose = (res: { isEnded?: boolean }) => {
        ad.offClose?.(onClose);
        finish(res?.isEnded === true);
      };
      ad.onClose(onClose);

      ad.show().catch(() => {
        ad.load()
          .then(() => ad.show())
          .catch((err: any) => {
            console.warn('[AdManager] rewarded load+show failed:', err);
            ad.offClose?.(onClose);
            finish(false, { fail: true });
          });
      });
    });
  },

  showInterstitial(): void {
    if (!hasWx()) return;
    try {
      if (!interstitialInstance) {
        interstitialInstance = wx.createInterstitialAd({
          adUnitId: 'WX_INTERSTITIAL_ADUNIT',
        });
      }
      analytics.trackAdShow('interstitial', { ad_type: 'interstitial' });
      interstitialInstance.show().catch(() => {
        interstitialInstance.load()
          .then(() => interstitialInstance.show())
          .catch((e: any) => console.warn('[AdManager] interstitial failed:', e));
      });
    } catch (e) {
      console.warn('[AdManager] interstitial failed:', e);
    }
  },

  get isAvailable(): boolean {
    return true;
  },

  shouldShowInterstitial(stageIndex: number): boolean {
    return stageIndex >= 3 && stageIndex % 3 === 0;
  },

  destroy(): void {
    showing = false;
    for (const ad of rewardedCache.values()) {
      try { ad.destroy?.(); } catch { /* */ }
    }
    rewardedCache.clear();
    interstitialInstance = null;
  },
};
