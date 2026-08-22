/**
 * 统一后端访问层（CloudBase HTTP 访问服务）
 *
 * - 微信走 wx.login code，H5 走本地匿名 ID；userId 形如 `wx:{openid}` / `anon:{id}`
 * - Token：服务端签发 JWT，客户端缓存在本地；过期或 401 自动重新 login
 */

import {
  BACKEND_ANON_ID_KEY,
  BACKEND_BASE_URL,
  BACKEND_LOGIN_PATH,
  BACKEND_PULL_PATH,
  BACKEND_PUSH_PATH,
  BACKEND_REQUEST_TIMEOUT_MS,
  BACKEND_TOKEN_KEY,
} from '@/config/CloudConfig';
import { Platform } from '@/platform/wxPlatform';

export interface BackendPullResult {
  userId: string;
  platform: string;
  exists: boolean;
  schemaVersion: number;
  updatedAt: number;
  payload: Record<string, string>;
  payloadKeys: string[];
  clientFingerprint?: string;
}

export interface BackendPushPayload {
  schemaVersion: number;
  updatedAt: number;
  baseRemoteUpdatedAt: number;
  clientFingerprint: string;
  payload: Record<string, string>;
}

export interface BackendPushResult {
  userId: string;
  updatedAt: number;
  savedAt: number;
  mode: 'insert' | 'update';
  sizeBytes: number;
}

interface StoredToken {
  token: string;
  userId: string;
  platform: string;
  expiresAt: number;
}

export class BackendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data?: unknown;
  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

class BackendServiceClass {
  private _stored: StoredToken | null = null;
  private _loginInflight: Promise<StoredToken> | null = null;

  get available(): boolean {
    return Platform.canUseBackend;
  }

  get userId(): string {
    return this._stored?.userId || '';
  }

  get platform(): string {
    return this._stored?.platform || '';
  }

  async ensureToken(): Promise<StoredToken> {
    if (this._stored && this._stored.expiresAt - Date.now() > 60_000) {
      return this._stored;
    }
    const cached = this._loadTokenFromStorage();
    if (cached && cached.expiresAt - Date.now() > 60_000) {
      this._stored = cached;
      return cached;
    }
    if (this._loginInflight) return this._loginInflight;

    this._loginInflight = this._login()
      .then((t) => {
        this._loginInflight = null;
        return t;
      })
      .catch((e) => {
        this._loginInflight = null;
        throw e;
      });
    return this._loginInflight;
  }

  async pullSave(): Promise<BackendPullResult> {
    return this._callWithAuth<BackendPullResult>(BACKEND_PULL_PATH, {});
  }

  async pushSave(snapshot: BackendPushPayload): Promise<BackendPushResult> {
    return this._callWithAuth<BackendPushResult>(BACKEND_PUSH_PATH, snapshot);
  }

  clearToken(): void {
    this._stored = null;
    try {
      Platform.removeStorageSync(BACKEND_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  private async _login(): Promise<StoredToken> {
    const body = await this._buildLoginBody();
    const { status, data } = await this._request(BACKEND_LOGIN_PATH, body, undefined);

    if (status !== 200 || !data || data.ok !== true || !data.data?.token) {
      const code = data?.code || 'LOGIN_FAIL';
      const msg = data?.error || `login failed (status=${status})`;
      throw new BackendError(status, code, msg, data?.data);
    }

    const stored: StoredToken = {
      token: String(data.data.token),
      userId: String(data.data.userId || ''),
      platform: String(data.data.platform || body.platform),
      expiresAt: Number(data.data.expiresAt || 0),
    };
    this._stored = stored;
    this._saveTokenToStorage(stored);
    console.log(`[Backend] login ok userId=${stored.userId}`);
    return stored;
  }

  private async _buildLoginBody(): Promise<{ platform: string; code?: string; anonId?: string }> {
    if (Platform.isWechat) {
      const code = await Platform.loginCode();
      if (!code) throw new BackendError(0, 'NO_WX_CODE', 'wx.login 未返回 code');
      return { platform: 'wx', code };
    }
    const anonId = this._getOrCreateAnonId();
    return { platform: 'anon', anonId };
  }

  private _getOrCreateAnonId(): string {
    let id = '';
    try {
      id = Platform.getStorageSync(BACKEND_ANON_ID_KEY) || '';
    } catch {
      /* ignore */
    }
    if (id) return id;
    id = 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    try {
      Platform.setStorageSync(BACKEND_ANON_ID_KEY, id);
    } catch {
      /* ignore */
    }
    return id;
  }

  private async _callWithAuth<T>(path: string, body: unknown): Promise<T> {
    const token = await this.ensureToken();
    const { status, data } = await this._request(path, body, token.token);

    if (status === 401) {
      this.clearToken();
      const retryToken = await this.ensureToken();
      const res2 = await this._request(path, body, retryToken.token);
      return this._unwrap<T>(res2.status, res2.data);
    }

    return this._unwrap<T>(status, data);
  }

  private _unwrap<T>(status: number, data: any): T {
    if (status === 200 && data && data.ok === true) {
      return data.data as T;
    }
    const code = data?.code || `HTTP_${status}`;
    const msg = data?.error || `request failed status=${status}`;
    throw new BackendError(status, code, msg, data?.data);
  }

  private async _request(
    path: string,
    body: unknown,
    token: string | undefined,
  ): Promise<{ status: number; data: any }> {
    const url = BACKEND_BASE_URL + path;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await Platform.request({
      url,
      method: 'POST',
      data: body || {},
      headers,
      timeoutMs: BACKEND_REQUEST_TIMEOUT_MS,
    });
    return { status: res.statusCode, data: res.data };
  }

  private _loadTokenFromStorage(): StoredToken | null {
    try {
      const raw = Platform.getStorageSync(BACKEND_TOKEN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.token !== 'string' || !parsed.token) return null;
      if (parsed.platform && parsed.platform !== Platform.backendPlatformCode) {
        console.warn(
          `[Backend] 丢弃平台不匹配的 token: stored=${parsed.platform}, current=${Platform.backendPlatformCode}`,
        );
        return null;
      }
      return {
        token: parsed.token,
        userId: parsed.userId || '',
        platform: parsed.platform || '',
        expiresAt: Number(parsed.expiresAt || 0),
      };
    } catch {
      return null;
    }
  }

  private _saveTokenToStorage(stored: StoredToken): void {
    try {
      Platform.setStorageSync(BACKEND_TOKEN_KEY, JSON.stringify(stored));
    } catch {
      /* ignore */
    }
  }
}

export const BackendService = new BackendServiceClass();
