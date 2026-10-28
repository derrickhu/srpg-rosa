import { describe, expect, it } from 'vitest';
import { getScopedGameKey, scopeStorageKey } from '@/config/gameKeyScope';

describe('存档命名空间', () => {
  it('微信 key 与线上一致，不加平台段', () => {
    expect(getScopedGameKey('wechat')).toBe('wujin_wenzhang');
    expect(scopeStorageKey('srpg_meta_v3', 'wechat')).toBe('srpg_meta_v3');
    expect(scopeStorageKey('wujin_wenzhang_token', 'wechat')).toBe('wujin_wenzhang_token');
  });

  it('抖音本地 key 和云集合前缀都落到 _tt，且不会加两次', () => {
    expect(getScopedGameKey('douyin')).toBe('wujin_wenzhang_tt');
    expect(scopeStorageKey('srpg_meta_v3', 'douyin')).toBe('wujin_wenzhang_tt_srpg_meta_v3');
    expect(scopeStorageKey('srpg_run_v4', 'douyin')).toBe('wujin_wenzhang_tt_srpg_run_v4');
    expect(scopeStorageKey('wujin_wenzhang_token', 'douyin')).toBe('wujin_wenzhang_tt_token');
    expect(scopeStorageKey('wujin_wenzhang_tt_token', 'douyin')).toBe('wujin_wenzhang_tt_token');
    expect(scopeStorageKey('gp_anon', 'douyin')).toBe('wujin_wenzhang_tt_gp_anon');
  });
});
