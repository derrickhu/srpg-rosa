import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Platform } from '@/platform/wxPlatform';

describe('抖音存档不进微信 key', () => {
  const g = globalThis as { wx?: unknown; tt?: unknown };

  afterEach(() => {
    delete g.wx;
    delete g.tt;
  });

  it('微信存储 key 不加平台段', () => {
    const mem: Record<string, string> = {};
    g.wx = {
      getStorageSync: (k: string) => mem[k] ?? '',
      setStorageSync: (k: string, v: string) => { mem[k] = v; },
      removeStorageSync: (k: string) => { delete mem[k]; },
    };
    Platform.setStorageSync('srpg_meta_v3', 'wx-save');
    expect(mem.srpg_meta_v3).toBe('wx-save');
    expect(mem.wujin_wenzhang_tt_srpg_meta_v3).toBeUndefined();
    expect(Platform.backendPlatformCode).toBe('wx');
    expect(Platform.getStorageSync('srpg_meta_v3')).toBe('wx-save');
  });

  it('抖音即使有 wx 兼容层，也只写 _tt key，登录码是 dy', () => {
    const wxMem: Record<string, string> = {};
    const ttMem: Record<string, string> = {};
    g.wx = {
      getStorageSync: (k: string) => wxMem[k] ?? '',
      setStorageSync: (k: string, v: string) => { wxMem[k] = v; },
    };
    g.tt = {
      getStorageSync: (k: string) => ttMem[k] ?? '',
      setStorageSync: (k: string, v: string) => { ttMem[k] = v; },
      removeStorageSync: (k: string) => { delete ttMem[k]; },
    };
    Platform.setStorageSync('srpg_meta_v3', 'dy-save');
    Platform.setStorageSync('wujin_wenzhang_token', 'tok');
    expect(ttMem.wujin_wenzhang_tt_srpg_meta_v3).toBe('dy-save');
    expect(ttMem.wujin_wenzhang_tt_token).toBe('tok');
    expect(ttMem.srpg_meta_v3).toBeUndefined();
    expect(wxMem.srpg_meta_v3).toBeUndefined();
    expect(Platform.name).toBe('douyin');
    expect(Platform.backendPlatformCode).toBe('dy');
    expect(Platform.getStorageSync('srpg_meta_v3')).toBe('dy-save');
  });

  it('经分 gameKey 保持基础名，平台字段单独写 douyin', () => {
    const src = readFileSync('src/analytics/gpAnalytics.ts', 'utf8');
    expect(src).toContain('gameKey: GAME_KEY');
    expect(src).toContain("return 'douyin'");
    expect(src).not.toContain('wujin_wenzhang_tt');
    const login = readFileSync('src/core/BackendService.ts', 'utf8');
    expect(login).toContain("platform: 'dy'");
    expect(login).toContain('NO_TT_CODE');
  });
});
