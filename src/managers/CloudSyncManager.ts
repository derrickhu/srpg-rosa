/**
 * 云同步管理器 —— HTTP 版（对齐花花妙屋）
 *
 *   - 启动时拉云端 + 本地合并（updatedAt 比较决定上/下行）
 *   - 本地脏标记订阅 + 防抖
 *   - 连续失败指数退避 / 低频重试
 */

import {
  CLOUD_SYNC_BASE_DELAY_MS,
  CLOUD_SYNC_DEBOUNCE_MS,
  CLOUD_SYNC_LOG_THRESHOLD,
  CLOUD_SYNC_MAX_BACKOFF_MS,
  CLOUD_SYNC_MAX_FAIL_COUNT,
  CLOUD_SYNC_RETRY_INTERVAL_MS,
  CLOUD_SYNC_STARTUP_TIMEOUT_MS,
} from '@/config/CloudConfig';
import { BackendError, BackendService } from '@/core/BackendService';
import { PersistService } from '@/core/PersistService';
import { Platform } from '@/platform/wxPlatform';

export type CloudAuthorityState = 'disabled' | 'unknown' | 'confirmedRemote' | 'cacheOnly';

export interface CloudStartupSyncResult {
  status: 'disabled' | 'confirmed' | 'remote-applied' | 'cache-only';
  reason: string;
}

class CloudSyncManagerClass {
  private _initPromise: Promise<void> | null = null;
  private _startupPromise: Promise<void> | null = null;
  private _cloudReady = false;
  private _initDone = false;
  private _syncTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryTimer: ReturnType<typeof setInterval> | null = null;
  private _syncFailCount = 0;
  private _syncDisabled = false;
  private _syncing = false;
  private _syncPending = false;
  private _authorityState: CloudAuthorityState = this.enabled ? 'unknown' : 'disabled';
  private _lastStartupRemoteApplied = false;

  constructor() {
    PersistService.subscribe((changedKeys) => {
      if (changedKeys.length === 0) return;
      this.scheduleSync(`dirty:${changedKeys.length}`);
    });
  }

  get enabled(): boolean {
    return BackendService.available;
  }

  get ready(): boolean {
    return this._cloudReady;
  }

  get authorityState(): CloudAuthorityState {
    return this._authorityState;
  }

  get cacheOnly(): boolean {
    return this._authorityState === 'cacheOnly';
  }

  get userId(): string {
    return BackendService.userId;
  }

  prewarm(): void {
    if (!this.enabled) {
      console.log('[CloudSync] prewarm 跳过: enabled=false, platform=', Platform.name);
      return;
    }
    if (!this._startupPromise) {
      console.log('[CloudSync] prewarm 开始初始化');
      this._startupPromise = this._initialize();
    }
  }

  async awaitStartupSync(timeoutMs = CLOUD_SYNC_STARTUP_TIMEOUT_MS): Promise<CloudStartupSyncResult> {
    if (!this.enabled) {
      this._authorityState = 'disabled';
      return { status: 'disabled', reason: 'backend-disabled' };
    }
    this.prewarm();
    if (!this._startupPromise) return { status: 'disabled', reason: 'startup-missing' };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const result = await Promise.race([
      this._startupPromise
        .then(() => 'done' as const)
        .catch(() => 'done' as const),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }).then(() => 'timeout' as const),
    ]);
    if (timer) clearTimeout(timer);

    if (result === 'timeout') {
      this._enterCacheOnly('startup-timeout');
      return { status: 'cache-only', reason: 'startup-timeout' };
    }

    if (this._authorityState === 'cacheOnly') {
      return { status: 'cache-only', reason: 'startup-pull-failed' };
    }
    return {
      status: this._lastStartupRemoteApplied ? 'remote-applied' : 'confirmed',
      reason: this._lastStartupRemoteApplied ? 'remote-imported' : 'cloud-confirmed',
    };
  }

  scheduleSync(reason = 'debounce'): void {
    if (!this.enabled) return;

    this.prewarm();

    if (this._authorityState === 'cacheOnly') {
      this._syncPending = true;
      console.warn(`[CloudSync] cacheOnly 禁止上行，已暂存同步请求 reason=${reason}`);
      return;
    }

    if (!this._initDone) {
      this._syncPending = true;
      return;
    }

    if (!this._cloudReady || this._syncDisabled) return;

    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
    }

    const delay = this._syncFailCount > 0
      ? Math.min(CLOUD_SYNC_BASE_DELAY_MS * Math.pow(2, this._syncFailCount - 1), CLOUD_SYNC_MAX_BACKOFF_MS)
      : CLOUD_SYNC_DEBOUNCE_MS;

    this._syncTimer = setTimeout(() => {
      this._syncTimer = null;
      void this._syncToCloud(reason);
    }, delay);
  }

  async flushNow(reason = 'manual'): Promise<void> {
    if (!this.enabled) return;

    this.prewarm();

    if (this._startupPromise) {
      try {
        await this._startupPromise;
      } catch {
        /* ignore */
      }
    }

    if (this._authorityState === 'cacheOnly') {
      console.warn(`[CloudSync] cacheOnly 跳过立即上行 reason=${reason}`);
      return;
    }

    if (!this._cloudReady) return;

    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }

    await this._syncToCloud(reason, true);
  }

  private async _initialize(): Promise<void> {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        console.log('[CloudSync] 初始化中... platform:', Platform.name);
        await BackendService.ensureToken();
        this._cloudReady = !!BackendService.userId;

        if (!this._cloudReady) {
          console.warn('[CloudSync] 未能获取 token/userId，继续使用本地存档');
          this._enterCacheOnly('no-user-id');
          return;
        }

        console.log('[CloudSync] 云同步就绪! userId:', BackendService.userId);
        await this._pullFromCloudOnStartup();
      } catch (e) {
        console.warn('[CloudSync] 初始化失败，继续使用本地存档:', e);
        this._enterCacheOnly('init-failed');
      } finally {
        this._initDone = true;
        if (this._syncPending && this._cloudReady) {
          this._syncPending = false;
          this.scheduleSync('pending-after-init');
        }
      }
    })();

    return this._initPromise;
  }

  private async _pullFromCloudOnStartup(): Promise<void> {
    let remote;
    try {
      remote = await BackendService.pullSave();
    } catch (e) {
      console.warn('[CloudSync] 启动拉取失败，保持本地存档:', e);
      this._enterCacheOnly('startup-pull-failed');
      return;
    }

    const localSnapshot = PersistService.exportCloudSnapshot();
    const localMeta = PersistService.getCloudSyncMeta();

    if (!remote.exists) {
      // 本游戏第一次接云存档：已有本地进度必须保留并上行，不能按「云端权威」清空。
      this._confirmRemoteBaseline(0, 'startup-no-remote-doc');
      if (localSnapshot.payloadKeys.length > 0) {
        PersistService.touchCloudMeta();
        this.scheduleSync('startup-seed-remote');
        console.log(`[CloudSync] 云端无存档，保留本地 ${localSnapshot.payloadKeys.length} 个 key 并准备上行`);
      }
      return;
    }

    const remoteUpdatedAt = Number(remote.updatedAt) || 0;
    const remotePayloadKeys = Array.isArray(remote.payloadKeys)
      ? remote.payloadKeys
      : Object.keys(remote.payload || {});

    if (remotePayloadKeys.length === 0) {
      if (localSnapshot.payloadKeys.length > 0) {
        console.warn(
          `[CloudSync] 云端为空存档，按云端权威清空本地缓存 keys=${localSnapshot.payloadKeys.length}`,
        );
      }
      PersistService.importCloudSnapshot({
        updatedAt: remoteUpdatedAt,
        payload: {},
        reason: this._authorityState === 'cacheOnly' ? 'startup-late' : 'startup',
      });
      this._confirmRemoteBaseline(remoteUpdatedAt, 'startup-empty-remote-doc');
      this._lastStartupRemoteApplied = localSnapshot.payloadKeys.length > 0;
      return;
    }

    const hasKnownRemoteBaseline = localMeta.remoteUpdatedAt > 0;
    const shouldApplyRemote = remotePayloadKeys.length > 0
      && (
        localSnapshot.payloadKeys.length === 0
        || !hasKnownRemoteBaseline
        || remoteUpdatedAt > localMeta.remoteUpdatedAt
      );

    if (shouldApplyRemote) {
      PersistService.importCloudSnapshot({
        updatedAt: remoteUpdatedAt,
        payload: remote.payload || {},
        reason: this._authorityState === 'cacheOnly' ? 'startup-late' : 'startup',
      });
      this._confirmRemoteBaseline(remoteUpdatedAt, 'startup-remote-imported');
      this._lastStartupRemoteApplied = true;
      console.log(`[CloudSync] 启动期已从云端恢复 ${remotePayloadKeys.length} 个 key`);
      if (PersistService.isCloudDirty()) {
        this.scheduleSync('startup-preserved-local-assets');
      }
      return;
    }

    this._confirmRemoteBaseline(remoteUpdatedAt, 'startup-remote-confirmed');

    if (PersistService.isCloudDirty()) {
      this.scheduleSync('startup-local-dirty');
    }
  }

  private async _syncToCloud(reason: string, force = false): Promise<void> {
    if (!this._cloudReady) return;
    if (!force && this._syncDisabled) return;
    if (this._authorityState === 'cacheOnly') {
      this._syncPending = true;
      console.warn(`[CloudSync] cacheOnly 拦截上行 reason=${reason}`);
      return;
    }

    if (this._syncing) {
      this._syncPending = true;
      return;
    }

    this._syncing = true;

    try {
      const snapshot = PersistService.exportCloudSnapshot();
      const hasDirty = PersistService.isCloudDirty();

      if (!hasDirty) return;
      if (snapshot.payloadKeys.length === 0) return;

      if (snapshot.updatedAt <= 0) {
        PersistService.touchCloudMeta();
      }

      const finalSnapshot = PersistService.exportCloudSnapshot();

      try {
        const res = await BackendService.pushSave({
          schemaVersion: finalSnapshot.schemaVersion,
          updatedAt: finalSnapshot.updatedAt,
          baseRemoteUpdatedAt: finalSnapshot.baseRemoteUpdatedAt,
          clientFingerprint: this._buildClientFingerprint(),
          payload: finalSnapshot.payload,
        });

        PersistService.markCloudSynced(res.updatedAt || finalSnapshot.updatedAt);
        this._confirmRemoteBaseline(res.updatedAt || finalSnapshot.updatedAt, 'push-ok');

        if (this._syncFailCount > 0) {
          console.log('[CloudSync] 云同步恢复成功');
        }
        console.log(
          `[CloudSync] 云端已同步 reason=${reason}, keys=${finalSnapshot.payloadKeys.length}, size=${res.sizeBytes ?? finalSnapshot.sizeBytes}B`,
        );

        this._syncFailCount = 0;
        this._syncDisabled = false;
        if (this._retryTimer) {
          clearInterval(this._retryTimer);
          this._retryTimer = null;
        }
      } catch (e) {
        if (e instanceof BackendError && e.code === 'STALE_UPDATE' && e.data && typeof e.data === 'object') {
          const remote = (e.data as { remote?: { updatedAt?: number; payload?: Record<string, string> } }).remote;
          console.warn('[CloudSync] 服务端版本更新，改为下行覆盖本地');
          PersistService.importCloudSnapshot({
            updatedAt: Number(remote?.updatedAt) || Date.now(),
            payload: remote?.payload || {},
            reason: 'stale-update',
          });
          this._confirmRemoteBaseline(Number(remote?.updatedAt) || Date.now(), 'stale-update');
          this._syncFailCount = 0;
          this._syncDisabled = false;
          return;
        }
        throw e;
      }
    } catch (e: any) {
      this._syncFailCount += 1;
      if (this._syncFailCount <= CLOUD_SYNC_LOG_THRESHOLD) {
        console.warn(
          `[CloudSync] 云同步失败(${this._syncFailCount}/${CLOUD_SYNC_MAX_FAIL_COUNT}):`,
          e?.message || e,
        );
      }

      if (this._syncFailCount >= CLOUD_SYNC_MAX_FAIL_COUNT) {
        this._syncDisabled = true;
        if (!this._retryTimer) {
          console.warn('[CloudSync] 连续失败，进入低频重试模式（本地存档仍正常可用）');
          this._retryTimer = setInterval(() => {
            if (!this._syncing && PersistService.isCloudDirty()) {
              void this._syncToCloud('retry-interval', true);
            }
          }, CLOUD_SYNC_RETRY_INTERVAL_MS);
        }
      } else if (PersistService.isCloudDirty()) {
        this.scheduleSync(`retry-after-fail:${reason}`);
      }
    } finally {
      this._syncing = false;
      if (this._syncPending && !this._syncDisabled) {
        this._syncPending = false;
        this.scheduleSync('pending-resume');
      }
    }
  }

  private _buildClientFingerprint(): string {
    const info = Platform.getSystemInfoSync() || {};
    return [
      Platform.name,
      info.brand,
      info.model,
      info.platform,
      info.version,
    ]
      .filter(Boolean)
      .join('|')
      .slice(0, 160);
  }

  private _enterCacheOnly(reason: string): void {
    if (this._authorityState === 'cacheOnly') return;
    this._authorityState = 'cacheOnly';
    console.warn(`[CloudSync] 进入 cacheOnly，本地仅作缓存，禁止上行 reason=${reason}`);
  }

  private _confirmRemoteBaseline(remoteUpdatedAt: number, reason: string): void {
    this._authorityState = 'confirmedRemote';
    console.log(`[CloudSync] 云端基准已确认 reason=${reason}, remoteUpdatedAt=${remoteUpdatedAt}`);
  }
}

export const CloudSyncManager = new CloudSyncManagerClass();
