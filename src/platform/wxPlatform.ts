/**
 * 微信 / H5 平台能力：本地存储、登录、HTTP。
 * 广告位 ID 请仅在公众平台创建后填入，勿提交真实线上 ID 到公开仓库。
 */
declare const wx: any;

export const AdConfigKeys = {
  rewardRevive: 'WX_REWARD_ADUNIT_REVIVE',
  rewardShopRefresh: 'WX_REWARD_ADUNIT_SHOP_REFRESH',
} as const;

export function hasWx(): boolean {
  return typeof wx !== 'undefined';
}

function isWxDevtools(): boolean {
  if (!hasWx()) return false;
  try {
    const info = wx.getSystemInfoSync?.();
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

class PlatformClass {
  get name(): 'wechat' | 'web' {
    return hasWx() ? 'wechat' : 'web';
  }

  get isWechat(): boolean {
    return hasWx();
  }

  get isMinigame(): boolean {
    return hasWx();
  }

  get isDevtools(): boolean {
    return isWxDevtools();
  }

  get canUseBackend(): boolean {
    if (hasWx() && typeof wx.request === 'function') return true;
    return typeof fetch === 'function';
  }

  get backendPlatformCode(): 'wx' | 'anon' {
    return this.isWechat ? 'wx' : 'anon';
  }

  getStorageSync(key: string): string | null {
    if (hasWx()) {
      try {
        const v = wx.getStorageSync(key);
        if (v === undefined || v === null || v === '') return null;
        return String(v);
      } catch {
        return null;
      }
    }
    return localStoreGet(key);
  }

  setStorageSync(key: string, value: string): void {
    if (hasWx()) {
      try {
        wx.setStorageSync(key, value);
      } catch {
        /* ignore */
      }
      return;
    }
    localStoreSet(key, value);
  }

  removeStorageSync(key: string): void {
    if (hasWx()) {
      try {
        wx.removeStorageSync(key);
      } catch {
        /* ignore */
      }
      return;
    }
    localStoreRemove(key);
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

    if (isWxDevtools() && typeof fetch === 'function') {
      return requestViaFetch(opts.url, method, opts.data, headers, timeoutMs);
    }
    if (hasWx() && typeof wx.request === 'function') {
      return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error(`request timeout after ${timeoutMs}ms: ${opts.url}`));
        }, timeoutMs);
        try {
          wx.request({
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
              reject(new Error(err?.errMsg || String(err) || 'wx.request failed'));
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

  loginCode(): Promise<string> {
    return new Promise((resolve) => {
      if (!hasWx() || typeof wx.login !== 'function') {
        resolve('');
        return;
      }
      try {
        wx.login({
          success: (res: any) => resolve(res?.code || ''),
          fail: () => resolve(''),
        });
      } catch {
        resolve('');
      }
    });
  }

  getSystemInfoSync(): Record<string, unknown> | null {
    if (!hasWx()) return null;
    try {
      return wx.getSystemInfoSync?.() || null;
    } catch {
      return null;
    }
  }

  onHide(handler: () => void): void {
    if (hasWx() && typeof wx.onHide === 'function') {
      wx.onHide(handler);
      return;
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') handler();
      });
    }
  }

  onShow(handler: () => void): void {
    if (hasWx() && typeof wx.onShow === 'function') {
      wx.onShow(handler);
      return;
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') handler();
      });
    }
  }
}

export const Platform = new PlatformClass();
