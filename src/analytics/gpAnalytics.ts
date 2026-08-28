/**
 * 经分埋点：@gp/analytics-sdk 初始化 + 业务门面（对齐村口 / 小厨）
 *
 * gameKey 必须用 GAME_KEY（wujin_wenzhang），不要硬编码其它 key。
 */
import {
  Analytics,
  EVENT_NAMES,
  type DeviceInfo,
  type EventParamValue,
  type PlatformName,
} from '@gp/analytics-sdk';

import { GAME_KEY } from '@/config/gameKey';
import { Platform } from '@/platform/wxPlatform';

export { EVENT_NAMES, GAME_KEY };

export type AnalyticsParams = Record<string, EventParamValue>;

/** 经分 ingest 端点（与村口 / 小厨共用 CloudBase 环境） */
export const ANALYTICS_ENDPOINT =
  'https://rosa-env-d7grf78r5dbd37323.service.tcloudbase.com/analytics-ingest/track';

let inited = false;

function sdkTrack(eventName: string, params: AnalyticsParams = {}): void {
  if (!inited) return;
  try {
    Analytics.track(eventName, params);
  } catch {
    /* SDK 未就绪或上报失败不挡玩 */
  }
}

/** SDK 初始化：资源首批发完再调，失败不挡进游戏 */
export function initAnalytics(opts?: { endpoint?: string; userId?: string; debug?: boolean }): void {
  if (inited) return;
  try {
    Analytics.init({
      endpoint: opts?.endpoint || ANALYTICS_ENDPOINT,
      gameKey: GAME_KEY,
      appVersion: '0.1.0',
      platform: mapPlatform(),
      deviceInfo: buildDeviceInfo(),
      initialUserId: opts?.userId,
      transport: { request: Platform.request.bind(Platform) },
      storage: {
        get: Platform.getStorageSync.bind(Platform),
        set: Platform.setStorageSync.bind(Platform),
        remove: Platform.removeStorageSync.bind(Platform),
      },
      lifecycle: {
        onHide: Platform.onHide.bind(Platform),
        onShow: Platform.onShow.bind(Platform),
      },
      debug: opts?.debug ?? Platform.isDevtools,
    });
    inited = true;
    console.log(`[analytics] init gameKey=${GAME_KEY} platform=${mapPlatform()}`);
  } catch (e) {
    console.warn('[analytics] init 失败，本局不打点:', e);
  }
}

/** 登录拿到 userId 后调用；SDK 内部自动 track login + flush */
export function setAnalyticsUserId(userId: string): void {
  if (!inited) return;
  Analytics.setUserId(userId || '');
  if (userId) {
    console.log(`[analytics] setUserId userId=${userId}`);
  } else {
    console.warn('[analytics] setUserId skipped: empty userId');
  }
}

export const analytics = {
  track: sdkTrack,

  trackSessionStart(params: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.SESSION_START, {
      entry: 'main',
      with_user_id: false,
      ...params,
    });
  },

  trackSessionEnd(reasonOrParams: string | AnalyticsParams = 'app-hide'): void {
    const params = typeof reasonOrParams === 'string'
      ? { reason: reasonOrParams }
      : reasonOrParams;
    sdkTrack(EVENT_NAMES.SESSION_END, params);
  },

  trackAppShow(params: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.APP_SHOW, params);
  },

  trackAppError(error: unknown, extra: AnalyticsParams = {}): void {
    const err = error as { message?: string; errMsg?: string; stack?: string; errCode?: number };
    sdkTrack(EVENT_NAMES.APP_ERROR, {
      err_msg: String(err?.message || err?.errMsg || error || 'unknown').slice(0, 240),
      err_code: err?.errCode == null ? -1 : Number(err.errCode),
      stack: err?.stack ? String(err.stack).slice(0, 500) : '',
      ...extra,
    });
  },

  trackAdShow(scene: string, extra: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.AD_SHOW, { scene, ad_type: 'reward', ...extra });
  },

  trackAdClose(scene: string, completed: boolean, extra: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.AD_CLOSE, { scene, ad_type: 'reward', completed, ...extra });
  },
};

function mapPlatform(): PlatformName {
  if (Platform.name === 'wechat') return 'wechat';
  return 'h5';
}

function buildDeviceInfo(): DeviceInfo {
  const sys = Platform.getSystemInfoSync() || {};
  return {
    brand: String(sys.brand || ''),
    model: String(sys.model || ''),
    system: String(sys.system || sys.platform || ''),
    sdkVersion: String(sys.SDKVersion || sys.sdkVersion || ''),
    screenWidth: Number(sys.screenWidth) || 0,
    screenHeight: Number(sys.screenHeight) || 0,
    network: 'unknown',
  };
}
