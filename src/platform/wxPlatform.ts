/**
 * 微信 / 抖音 / 浏览器平台能力：本地存储、登录、HTTP。
 * 抖音只走 tt。抖音里的 wx 是兼容层，不能拿来登录或存档。
 */
import { scopeStorageKey } from '@/config/gameKeyScope';
import {
  detectMinigamePlatform,
  getNativePlatformApi,
  toBackendPlatformCode,
  type BackendPlatformCode,
  type PlatformName,
} from '@/platform/platformDetect';

export const AdConfigKeys = {
  /** 三选一刷新 */
  rewardLootRefresh: 'adunit-e4b32e99968edcea',
  /** 补给点刷新 */
  rewardShopRefresh: 'adunit-acf6a35bbf1db91b',
  /** 布阵多上阵一人 */
  rewardExtraDeploy: 'adunit-d38d1888866177c1',
  /** 局内复活指定队员 */
  rewardRevive: 'adunit-75d725546bf4aacd',
  // 收回永久纹章。公众平台还没单开广告位，先和三选一刷新共用，看完才发奖。
  rewardEmblemRelease: 'adunit-e4b32e99968edcea',
  /** 招募页看广告解锁角色 */
  rewardRecruitCharacter: 'adunit-fef31ada9aa01c07',
} as const;

/** 当前是微信宿主。抖音即使注入了 wx 也不算。 */
export function hasWx(): boolean {
  return detectMinigamePlatform() === 'wechat';
}

export function hasMinigameHost(): boolean {
  return detectMinigamePlatform() !== 'web';
}

/** 抖音返回 tt，微信返回 wx。 */
export function hostApi(): any | null {
  return getNativePlatformApi();
}

function isHostDevtools(): boolean {
  const api = hostApi();
  if (!api) return false;
  try {
    const info = api.getSystemInfoSync?.();
    return !!(info && (
      info.brand === 'devtools'
      || info.environment === 'devtools'
      || info.platform === 'devtools'
    ));
  } catch {
    return false;
  }
}

function localStoreGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStoreSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function localStoreRemove(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function safeStorageGet(key: string): string | null {
  return Platform.getStorageSync(key);
}

export function safeStorageSet(key: string, value: string): void {
  if (!value) {
    Platform.removeStorageSync(key);
    return;
  }
  Platform.setStorageSync(key, value);
}

function requestViaFetch(
  url: string,
  method: string,
  data: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ statusCode: number; data: any }> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
  const body = data === undefined || data === null
    ? undefined
    : typeof data === 'string'
      ? data
      : JSON.stringify(data);
  return fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : body,
    signal: ctrl?.signal,
  }).then(async (res) => {
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { statusCode: res.status, data: parsed };
  }).finally(() => {
    clearTimeout(timer);
  });
}

export interface LoginCredentials {
  code: string;
  anonymousCode: string;
}

class PlatformClass {
  get name(): PlatformName {
    return detectMinigamePlatform();
  }

  get isWechat(): boolean {
    return this.name === 'wechat';
  }

  get isDouyin(): boolean {
    return this.name === 'douyin';
  }

  get isMinigame(): boolean {
    return this.name !== 'web';
  }

  get isDevtools(): boolean {
    return isHostDevtools();
  }

  /**
   * GM 工具：跳过战斗、特效试炼、作弊钮。
   * 只给微信开发者工具；抖音和真机玩家看不到。
   */
  get isGmTools(): boolean {
    return this.isWechat && this.isDevtools;
  }

  get canUseBackend(): boolean {
    const api = hostApi();
    if (api && typeof api.request === 'function') return true;
    return typeof fetch === 'function';
  }

  get backendPlatformCode(): BackendPlatformCode {
    return toBackendPlatformCode(this.name);
  }

  private storageKey(key: string): string {
    return scopeStorageKey(key, this.name);
  }

  getStorageSync(key: string): string | null {
    const scoped = this.storageKey(key);
    const api = hostApi();
    if (api && typeof api.getStorageSync === 'function') {
      try {
        const v = api.getStorageSync(scoped);
        if (v === undefined || v === null || v === '') return null;
        return String(v);
      } catch {
        return null;
      }
    }
    return localStoreGet(scoped);
  }

  setStorageSync(key: string, value: string): void {
    const scoped = this.storageKey(key);
    const api = hostApi();
    if (api && typeof api.setStorageSync === 'function') {
      try {
        api.setStorageSync(scoped, value);
      } catch {
        /* ignore */
      }
      return;
    }
    localStoreSet(scoped, value);
  }

  removeStorageSync(key: string): void {
    const scoped = this.storageKey(key);
    const api = hostApi();
    if (api && typeof api.removeStorageSync === 'function') {
      try {
        api.removeStorageSync(scoped);
      } catch {
        /* ignore */
      }
      return;
    }
    localStoreRemove(scoped);
  }

  request(opts: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ statusCode: number; data: any }> {
    const method = (opts.method || 'POST').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(opts.headers || {}),
    };
    const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 10000;
    const api = hostApi();

    // 只有微信开发者工具走 fetch。抖音开发者工具的 fetch 经常登录失败，必须 tt.request。
    if (this.isWechat && this.isDevtools && typeof fetch === 'function') {
      return requestViaFetch(opts.url, method, opts.data, headers, timeoutMs);
    }
    if (api && typeof api.request === 'function') {
      return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error(`request timeout after ${timeoutMs}ms: ${opts.url}`));
        }, timeoutMs);
        try {
          api.request({
            url: opts.url,
            method,
            data: opts.data === undefined || typeof opts.data === 'string'
              ? opts.data
              : JSON.stringify(opts.data),
            header: headers,
            timeout: timeoutMs,
            success: (res: any) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve({ statusCode: Number(res?.statusCode) || 0, data: res?.data });
            },
            fail: (err: any) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              reject(new Error(err?.errMsg || String(err) || 'request failed'));
            },
          });
        } catch (e) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(e);
          }
        }
      });
    }
    if (typeof fetch === 'function') {
      return requestViaFetch(opts.url, method, opts.data, headers, timeoutMs);
    }
    return Promise.reject(new Error('no http transport available'));
  }

  /**
   * 微信 wx.login → code。
   * 抖音 tt.login({ force: true }) → code，未登录时可能只有 anonymousCode。
   */
  loginCredentials(): Promise<LoginCredentials> {
    return new Promise((resolve) => {
      const empty: LoginCredentials = { code: '', anonymousCode: '' };
      const api = hostApi();
      if (!api || typeof api.login !== 'function') {
        resolve(empty);
        return;
      }
      let settled = false;
      const finish = (creds: LoginCredentials): void => {
        if (settled) return;
        settled = true;
        resolve(creds);
      };
      const timer = setTimeout(() => {
        console.warn(`[Platform] ${this.name}.login timed out, skip cloud login`);
        finish(empty);
      }, 4000);
      try {
        const opts: {
          force?: boolean;
          success: (res: any) => void;
          fail: () => void;
        } = {
          success: (res: any) => {
            clearTimeout(timer);
            finish({
              code: String(res?.code || ''),
              anonymousCode: String(res?.anonymousCode || ''),
            });
          },
          fail: () => {
            clearTimeout(timer);
            finish(empty);
          },
        };
        if (this.isDouyin) opts.force = true;
        api.login(opts);
      } catch {
        clearTimeout(timer);
        finish(empty);
      }
    });
  }

  loginCode(): Promise<string> {
    return this.loginCredentials().then((creds) => creds.code || creds.anonymousCode);
  }

  getSystemInfoSync(): Record<string, unknown> | null {
    const api = hostApi();
    if (!api) return null;
    try {
      return api.getSystemInfoSync?.() || null;
    } catch {
      return null;
    }
  }

  onHide(handler: () => void): void {
    const api = hostApi();
    if (api && typeof api.onHide === 'function') {
      api.onHide(handler);
      return;
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') handler();
      });
    }
  }

  onShow(handler: () => void): void {
    const api = hostApi();
    if (api && typeof api.onShow === 'function') {
      api.onShow(handler);
      return;
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') handler();
      });
    }
  }

  /** 抖音侧边栏：宿主是否支持该场景 */
  checkScene(opts: {
    scene: string;
    success?: (res: { isExist?: boolean }) => void;
    fail?: (err?: unknown) => void;
  }): void {
    const api = hostApi();
    if (typeof api?.checkScene === 'function') api.checkScene(opts);
    else opts.fail?.({ errMsg: 'checkScene not supported' });
  }

  /** 必须在点击回调里同步调用 */
  navigateToScene(opts: {
    scene: string;
    success?: () => void;
    fail?: (err?: { errMsg?: string }) => void;
  }): void {
    const api = hostApi();
    if (typeof api?.navigateToScene === 'function') api.navigateToScene(opts);
    else opts.fail?.({ errMsg: 'navigateToScene not supported' });
  }

  checkShortcut(opts: {
    success?: (res: { status?: { exist?: boolean; needUpdate?: boolean } }) => void;
    fail?: (err?: unknown) => void;
  }): void {
    const api = hostApi();
    if (typeof api?.checkShortcut === 'function') api.checkShortcut(opts);
    else opts.fail?.({ errMsg: 'checkShortcut not supported' });
  }

  /** 必须在点击回调里同步调用 */
  addShortcut(opts: {
    success?: () => void;
    fail?: (err?: { errMsg?: string }) => void;
  }): void {
    const api = hostApi();
    if (typeof api?.addShortcut === 'function') api.addShortcut(opts);
    else opts.fail?.({ errMsg: 'addShortcut not supported' });
  }
}

export const Platform = new PlatformClass();
