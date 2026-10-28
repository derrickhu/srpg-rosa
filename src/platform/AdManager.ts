import { analytics } from '@/analytics/gpAnalytics';
import { detectMinigamePlatform } from '@/platform/platformDetect';
import { hasWx, hostApi, AdConfigKeys } from './wxPlatform';

export type AdScenario =
  | 'lootRefresh'
  | 'shopRefresh'
  | 'extraDeploy'
  | 'revive'
  | 'emblemRelease'
  | 'recruitCharacter';

const SCENARIO_AD_UNIT: Record<AdScenario, string> = {
  lootRefresh: AdConfigKeys.rewardLootRefresh,
  shopRefresh: AdConfigKeys.rewardShopRefresh,
  extraDeploy: AdConfigKeys.rewardExtraDeploy,
  revive: AdConfigKeys.rewardRevive,
  emblemRelease: AdConfigKeys.rewardEmblemRelease,
  recruitCharacter: AdConfigKeys.rewardRecruitCharacter,
};

/**
 * 抖音广告位。空字符串表示还没在抖音流量主创建。
 * 空位直接不发奖，也不拿微信的 adunit 去抖音创建广告。
 */
const DOUYIN_AD_UNIT: Record<AdScenario, string> = {
  lootRefresh: '',
  shopRefresh: '',
  extraDeploy: '',
  revive: '',
  emblemRelease: '',
  recruitCharacter: '',
};

let rewardedCache: Map<string, any> = new Map();
let interstitialInstance: any = null;
let showing = false;

export function adUnitIdFor(scenario: AdScenario): string {
  if (detectMinigamePlatform() === 'douyin') return DOUYIN_AD_UNIT[scenario];
  return SCENARIO_AD_UNIT[scenario];
}

/** 微信激励视频默认全局单例，只绑第一次的 adUnitId。多广告位必须 multiton。抖音不传这个字段。 */
export function rewardedVideoCreateOptions(
  adUnitId: string,
  platform: 'wechat' | 'douyin' = 'wechat',
): { adUnitId: string; multiton?: true } {
  if (platform === 'douyin') return { adUnitId };
  return { adUnitId, multiton: true };
}

function getRewardedAd(adUnitId: string): any {
  const api = hostApi();
  if (!api || typeof api.createRewardedVideoAd !== 'function') return null;
  if (rewardedCache.has(adUnitId)) return rewardedCache.get(adUnitId);
  try {
    const platform = detectMinigamePlatform() === 'douyin' ? 'douyin' : 'wechat';
    const ad = api.createRewardedVideoAd(rewardedVideoCreateOptions(adUnitId, platform));
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
 * 浏览器 / 单测直接发奖，方便把刷新 / 复活整条链路跑通。
 * 微信、抖音真机只在看完激励视频（`isEnded === true`）后发奖。抖音广告位还没配时不发奖。
 */
export const AdManager = {
  showRewarded(scenario: AdScenario): Promise<boolean> {
    const platform = detectMinigamePlatform();
    const adUnitId = adUnitIdFor(scenario);
    if (platform === 'web') {
      analytics.trackAdShow(scenario, { ad_unit_id: adUnitId, mock: true });
      analytics.trackAdClose(scenario, true, { ad_unit_id: adUnitId, mock: true });
      return Promise.resolve(true);
    }
    if (!adUnitId) {
      console.warn('[AdManager] 当前平台没有广告位，不发奖', platform, scenario);
      return Promise.resolve(false);
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
    const api = hostApi();
    if (!api || typeof api.createInterstitialAd !== 'function') return;
    try {
      if (!interstitialInstance) {
        interstitialInstance = api.createInterstitialAd({
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
