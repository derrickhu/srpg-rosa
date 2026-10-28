import { afterEach, describe, expect, it } from 'vitest';
import { detectMinigamePlatform, toBackendPlatformCode } from '@/platform/platformDetect';

describe('宿主识别', () => {
  const g = globalThis as { wx?: unknown; tt?: unknown };

  afterEach(() => {
    delete g.wx;
    delete g.tt;
  });

  it('只有微信时走 wx', () => {
    g.wx = {};
    expect(detectMinigamePlatform()).toBe('wechat');
    expect(toBackendPlatformCode()).toBe('wx');
  });

  it('抖音同时注入 wx 兼容层时仍走 dy，避免写进微信库', () => {
    g.tt = {};
    g.wx = {};
    expect(detectMinigamePlatform()).toBe('douyin');
    expect(toBackendPlatformCode()).toBe('dy');
  });

  it('浏览器走匿名', () => {
    expect(detectMinigamePlatform()).toBe('web');
    expect(toBackendPlatformCode()).toBe('anon');
  });
});
