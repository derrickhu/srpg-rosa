import {
  CLOUD_SYNC_ALLOWLIST,
  CLOUD_SYNC_META_KEY,
  CLOUD_SYNC_SCHEMA_VERSION,
} from '@/config/CloudConfig';
import { Platform } from '@/platform/wxPlatform';

export interface CloudSyncMeta {
  updatedAt: number;
  dirty: boolean;
  lastSyncAt: number;
  remoteUpdatedAt: number;
}

export interface PersistSnapshot {
  schemaVersion: number;
  updatedAt: number;
  baseRemoteUpdatedAt: number;
  payload: Record<string, string>;
  payloadKeys: string[];
  sizeBytes: number;
}

type DirtyListener = (changedKeys: string[]) => void;
export type CloudImportReason = 'startup' | 'startup-late' | 'stale-update' | 'manual';
export interface CloudImportInfo {
  reason: CloudImportReason;
  updatedAt: number;
  changedKeys: string[];
  payloadKeys: string[];
}
export type CloudImportListener = (info: CloudImportInfo) => void;

interface WriteOptions {
  markDirty?: boolean;
}

class PersistServiceClass {
  private readonly _allowlist = new Set<string>(CLOUD_SYNC_ALLOWLIST);
  private readonly _listeners = new Set<DirtyListener>();
  private readonly _importListeners = new Set<CloudImportListener>();
  private _dirtyTrackingSuspended = 0;

  getAllowlistKeys(): readonly string[] {
    return CLOUD_SYNC_ALLOWLIST;
  }

  isCloudSyncKey(key: string): boolean {
    return this._allowlist.has(key);
  }

  readRaw(key: string): string | null {
    return Platform.getStorageSync(key);
  }

  readJSON<T>(key: string): T | null {
    const raw = this.readRaw(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn(`[Persist] JSON 读取失败 key=${key}:`, e);
      return null;
    }
  }

  writeRaw(key: string, value: string, options: WriteOptions = {}): void {
    Platform.setStorageSync(key, value);
    if (options.markDirty !== false) {
      this._onDataChanged([key]);
    }
  }

  writeJSON(key: string, value: unknown, options: WriteOptions = {}): void {
    this.writeRaw(key, JSON.stringify(value), options);
  }

  remove(key: string, options: WriteOptions = {}): void {
    Platform.removeStorageSync(key);
    if (options.markDirty !== false) {
      this._onDataChanged([key]);
    }
  }

  subscribe(listener: DirtyListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  subscribeCloudImport(listener: CloudImportListener): () => void {
    this._importListeners.add(listener);
    return () => this._importListeners.delete(listener);
  }

  withSuppressedDirtyTracking<T>(runner: () => T): T {
    this._dirtyTrackingSuspended++;
    try {
      return runner();
    } finally {
      this._dirtyTrackingSuspended = Math.max(0, this._dirtyTrackingSuspended - 1);
    }
  }

  getCloudSyncMeta(): CloudSyncMeta {
    const parsed = this.readJSON<Partial<CloudSyncMeta>>(CLOUD_SYNC_META_KEY);
    if (parsed && typeof parsed.updatedAt === 'number') {
      return {
        updatedAt: parsed.updatedAt,
        dirty: !!parsed.dirty,
        lastSyncAt: typeof parsed.lastSyncAt === 'number' ? parsed.lastSyncAt : 0,
        remoteUpdatedAt: typeof parsed.remoteUpdatedAt === 'number' ? parsed.remoteUpdatedAt : 0,
      };
    }

    return {
      updatedAt: this._inferInitialUpdatedAt(),
      dirty: false,
      lastSyncAt: 0,
      remoteUpdatedAt: 0,
    };
  }

  isCloudDirty(): boolean {
    return this.getCloudSyncMeta().dirty;
  }

  touchCloudMeta(updatedAt = Date.now()): CloudSyncMeta {
    const prev = this.getCloudSyncMeta();
    const next: CloudSyncMeta = {
      updatedAt,
      dirty: true,
      lastSyncAt: prev.lastSyncAt,
      remoteUpdatedAt: prev.remoteUpdatedAt,
    };
    this._writeMeta(next);
    return next;
  }

  markCloudSynced(updatedAt: number): void {
    const prev = this.getCloudSyncMeta();
    this._writeMeta({
      updatedAt: updatedAt > 0 ? updatedAt : prev.updatedAt,
      dirty: false,
      lastSyncAt: Date.now(),
      remoteUpdatedAt: updatedAt > 0 ? updatedAt : prev.remoteUpdatedAt,
    });
  }

  exportCloudSnapshot(): PersistSnapshot {
    const meta = this.getCloudSyncMeta();
    const payload: Record<string, string> = {};
    let sizeBytes = 0;

    for (const key of CLOUD_SYNC_ALLOWLIST) {
      const raw = this.readRaw(key);
      if (raw === null) continue;
      payload[key] = raw;
      sizeBytes += raw.length;
    }

    const payloadKeys = Object.keys(payload);

    return {
      schemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
      updatedAt: meta.updatedAt,
      baseRemoteUpdatedAt: meta.remoteUpdatedAt,
      payload,
      payloadKeys,
      sizeBytes,
    };
  }

  importCloudSnapshot(snapshot: {
    updatedAt?: number;
    payload?: Record<string, unknown>;
    reason?: CloudImportReason;
    replaceMissingKeys?: boolean;
  }): void {
    const payload = snapshot.payload || {};
    const payloadKeyCount = Object.keys(payload).length;
    const replaceMissingKeys = snapshot.replaceMissingKeys ?? (payloadKeyCount === 0);
    const updatedAt = typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : Date.now();
    const changedKeys: string[] = [];
    const preservedLocalKeys: string[] = [];

    this.withSuppressedDirtyTracking(() => {
      for (const key of CLOUD_SYNC_ALLOWLIST) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          const value = payload[key];
          if (value === undefined || value === null) {
            if (this.readRaw(key) !== null) changedKeys.push(key);
            Platform.removeStorageSync(key);
          } else {
            const raw = typeof value === 'string' ? value : JSON.stringify(value);
            if (this.readRaw(key) !== raw) changedKeys.push(key);
            Platform.setStorageSync(key, raw);
          }
        } else if (replaceMissingKeys) {
          if (this.readRaw(key) !== null) changedKeys.push(key);
          Platform.removeStorageSync(key);
        } else if (this.readRaw(key) !== null) {
          preservedLocalKeys.push(key);
        }
      }

      this._writeMeta({
        updatedAt,
        dirty: preservedLocalKeys.length > 0,
        lastSyncAt: Date.now(),
        remoteUpdatedAt: updatedAt,
      });
    });

    if (preservedLocalKeys.length > 0) {
      console.warn(
        `[Persist] 云端档缺少本地 key，已保留并标记待上行: ${preservedLocalKeys.join(', ')}`,
      );
    }

    const payloadKeys = Object.keys(payload);
    for (const listener of this._importListeners) {
      try {
        listener({
          reason: snapshot.reason || 'manual',
          updatedAt,
          changedKeys,
          payloadKeys,
        });
      } catch (e) {
        console.warn('[Persist] cloud import listener 执行失败:', e);
      }
    }
  }

  private _onDataChanged(changedKeys: string[]): void {
    if (this._dirtyTrackingSuspended > 0) return;

    const syncKeys = changedKeys.filter((key) => this.isCloudSyncKey(key));
    if (syncKeys.length === 0) return;

    const updatedAt = Date.now();
    const prev = this.getCloudSyncMeta();
    this._writeMeta({
      updatedAt,
      dirty: true,
      lastSyncAt: prev.lastSyncAt,
      remoteUpdatedAt: prev.remoteUpdatedAt,
    });

    for (const listener of this._listeners) {
      try {
        listener(syncKeys);
      } catch (e) {
        console.warn('[Persist] dirty listener 执行失败:', e);
      }
    }
  }

  private _inferInitialUpdatedAt(): number {
    for (const key of CLOUD_SYNC_ALLOWLIST) {
      const raw = this.readRaw(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { savedAt?: number };
        if (typeof parsed.savedAt === 'number') return parsed.savedAt;
      } catch {
        /* ignore */
      }
    }
    return 0;
  }

  private _writeMeta(meta: CloudSyncMeta): void {
    this.withSuppressedDirtyTracking(() => {
      Platform.setStorageSync(CLOUD_SYNC_META_KEY, JSON.stringify(meta));
    });
  }
}

export const PersistService = new PersistServiceClass();
