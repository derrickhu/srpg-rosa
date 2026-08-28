import { analytics } from '@/analytics/gpAnalytics';
import { hasWx, AdConfigKeys } from './wxPlatform';

declare const wx: any;

export type AdScenario =
  | 'revive'
  | 'shopRefresh'
  | 'freeUnit'
  | 'doubleStar'
  | 'dailyFreeRoll';

const SCENARIO_AD_UNIT: Record<AdScenario, string> = {
  revive: AdConfigKeys.rewardRevive,
  shopRefresh: AdConfigKeys.rewardShopRefresh,
  freeUnit: AdConfigKeys.rewardShopRefresh,
  doubleStar: AdConfigKeys.rewardRevive,
  dailyFreeRoll: AdConfigKeys.rewardShopRefresh,
};

let rewardedCache: Map<string, any> = new Map();
let interstitialInstance: any = null;

function getRewardedAd(adUnitId: string): any {
  if (!hasWx()) return null;
  if (rewardedCache.has(adUnitId)) return rewardedCache.get(adUnitId);
  try {
    const ad = wx.createRewardedVideoAd({ adUnitId });
    rewardedCache.set(adUnitId, ad);
    return ad;
  } catch (e) {
    console.warn('[AdManager] createRewardedVideoAd failed:', e);
    return null;
  }
}

export const AdManager = {
  /**
   * Show a rewarded video ad.  Returns a promise that resolves to `true`
   * if the user watched it to completion, or `false` / rejects on failure.
   */
  showRewarded(scenario: AdScenario): Promise<boolean> {
    const adUnitId = SCENARIO_AD_UNIT[scenario];
    const ad = getRewardedAd(adUnitId);
    if (!ad) {
      console.warn('[AdManager] No ad instance for', scenario);
      return Promise.resolve(false);
    }

    analytics.trackAdShow(scenario, { ad_unit_id: adUnitId });
    return new Promise<boolean>((resolve) => {
      const onClose = (res: { isEnded?: boolean }) => {
        ad.offClose(onClose);
        const completed = res?.isEnded !== false;
        analytics.trackAdClose(scenario, completed, { ad_unit_id: adUnitId });
        resolve(completed);
      };
      ad.onClose(onClose);

      ad.show().catch(() => {
        ad.load()
          .then(() => ad.show())
          .catch((err: any) => {
            console.warn('[AdManager] rewarded load+show failed:', err);
            ad.offClose(onClose);
            analytics.trackAdClose(scenario, false, { ad_unit_id: adUnitId, fail: true });
            resolve(false);
          });
      });
    });
  },

  /**
   * Show an interstitial ad (non-rewarded, between stages).
   * Fire and forget — does not block gameplay.
   */
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

  /** True when running inside WeChat and ad APIs are presumably available. */
  get isAvailable(): boolean {
    return hasWx();
  },

  /** Should show an interstitial? (every 3 stages, skipping early) */
  shouldShowInterstitial(stageIndex: number): boolean {
    return stageIndex >= 3 && stageIndex % 3 === 0;
  },

  destroy(): void {
    for (const ad of rewardedCache.values()) {
      try { ad.destroy?.(); } catch { /* */ }
    }
    rewardedCache.clear();
    interstitialInstance = null;
  },
};
