import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKEND_ANON_ID_KEY,
  BACKEND_TOKEN_KEY,
  CLOUD_SYNC_ALLOWLIST,
  CLOUD_SYNC_EXCLUDE_KEYS,
  CLOUD_SYNC_META_KEY,
  SAVE_META_KEY,
  SAVE_RUN_KEY,
} from '@/config/CloudConfig';
import { PersistService } from '@/core/PersistService';
import { SaveManager } from '@/core/SaveManager';
import { createInitialMeta } from '@/game/state/GameState';

const mem = new Map<string, string>();

const fakeStorage = {
  getItem(key: string) {
    return mem.has(key) ? mem.get(key)! : null;
  },
  setItem(key: string, value: string) {
    mem.set(key, String(value));
  },
  removeItem(key: string) {
    mem.delete(key);
  },
  clear() {
    mem.clear();
  },
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });
} else {
  Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });
}

afterEach(() => {
  mem.clear();
});

describe('云同步白名单', () => {
  it('只同步 meta / run，token 与 anonId 不上云', () => {
    expect([...CLOUD_SYNC_ALLOWLIST]).toEqual([SAVE_META_KEY, SAVE_RUN_KEY]);
    expect(CLOUD_SYNC_EXCLUDE_KEYS).toEqual(
      expect.arrayContaining([BACKEND_TOKEN_KEY, BACKEND_ANON_ID_KEY, CLOUD_SYNC_META_KEY]),
    );
    expect(CLOUD_SYNC_ALLOWLIST).not.toContain(BACKEND_TOKEN_KEY);
    expect(CLOUD_SYNC_ALLOWLIST).not.toContain(BACKEND_ANON_ID_KEY);
    expect(CLOUD_SYNC_ALLOWLIST).not.toContain(CLOUD_SYNC_META_KEY);
  });
});

describe('PersistService', () => {
  it('写白名单 key 会标 dirty，快照只含白名单', () => {
    PersistService.writeRaw(SAVE_META_KEY, '{"soul":1}');
    PersistService.writeRaw(BACKEND_TOKEN_KEY, '{"token":"nope"}');
    expect(PersistService.isCloudDirty()).toBe(true);
    const snap = PersistService.exportCloudSnapshot();
    expect(snap.payload[SAVE_META_KEY]).toBe('{"soul":1}');
    expect(snap.payload[BACKEND_TOKEN_KEY]).toBeUndefined();
    expect(snap.payloadKeys).toEqual([SAVE_META_KEY]);
  });

  it('下行合并时缺 key 默认保留本地并继续标 dirty', () => {
    PersistService.writeRaw(SAVE_META_KEY, '{"soul":1}');
    PersistService.writeRaw(SAVE_RUN_KEY, '{"dungeonId":"ch1"}');
    PersistService.importCloudSnapshot({
      updatedAt: 10,
      payload: { [SAVE_META_KEY]: '{"soul":9}' },
      replaceMissingKeys: false,
    });
    expect(PersistService.readRaw(SAVE_META_KEY)).toBe('{"soul":9}');
    expect(PersistService.readRaw(SAVE_RUN_KEY)).toBe('{"dungeonId":"ch1"}');
    expect(PersistService.isCloudDirty()).toBe(true);
  });
});

describe('SaveManager 经 Persist 落盘', () => {
  it('saveMeta 后能读回，并进入云快照', () => {
    const ok = SaveManager.saveMeta(createInitialMeta());
    expect(ok).toBe(true);
    const loaded = SaveManager.loadMeta();
    expect(loaded?.roster.length).toBeGreaterThan(0);
    const snap = PersistService.exportCloudSnapshot();
    expect(snap.payloadKeys).toContain(SAVE_META_KEY);
    expect(PersistService.isCloudDirty()).toBe(true);
  });
});
