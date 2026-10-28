import { describe, expect, it } from 'vitest';
import { AdManager, adUnitIdFor, rewardedVideoCreateOptions } from '@/platform/AdManager';

describe('激励视频广告位', () => {
  it('每个激励视频场景都有广告位', () => {
    expect(adUnitIdFor('lootRefresh')).toBe('adunit-e4b32e99968edcea');
    expect(adUnitIdFor('shopRefresh')).toBe('adunit-acf6a35bbf1db91b');
    expect(adUnitIdFor('extraDeploy')).toBe('adunit-d38d1888866177c1');
    expect(adUnitIdFor('revive')).toBe('adunit-75d725546bf4aacd');
    expect(adUnitIdFor('emblemRelease')).toBe('adunit-e4b32e99968edcea');
    expect(adUnitIdFor('recruitCharacter')).toBe('adunit-fef31ada9aa01c07');
  });

  it('非微信环境直接发奖，方便浏览器把整条链路跑通', async () => {
    await expect(AdManager.showRewarded('shopRefresh')).resolves.toBe(true);
  });

  it('微信创建激励视频必须带 multiton，四个位才能各自播各自的', async () => {
    const created: Array<{ adUnitId?: string; multiton?: boolean }> = [];
    const g = globalThis as { wx?: unknown };
    const prev = g.wx;
    g.wx = {
      createRewardedVideoAd(opts: { adUnitId: string; multiton?: boolean }) {
        created.push(opts);
        return {
          onError() {},
          onClose() {},
          offClose() {},
          show: () => Promise.reject(new Error('need load')),
          load: () => Promise.reject(new Error('no fill')),
        };
      },
    };
    AdManager.destroy();
    try {
      await expect(AdManager.showRewarded('lootRefresh')).resolves.toBe(false);
      await expect(AdManager.showRewarded('shopRefresh')).resolves.toBe(false);
      expect(created).toEqual([
        { adUnitId: adUnitIdFor('lootRefresh'), multiton: true },
        { adUnitId: adUnitIdFor('shopRefresh'), multiton: true },
      ]);
    } finally {
      AdManager.destroy();
      if (prev === undefined) delete g.wx;
      else g.wx = prev;
    }
  });

  it('rewardedVideoCreateOptions 钉住微信多实例开关', () => {
    expect(rewardedVideoCreateOptions('adunit-x')).toEqual({ adUnitId: 'adunit-x', multiton: true });
  });

  it('抖音没有广告位时不发奖，也不拿微信广告位去创建', async () => {
    const created: unknown[] = [];
    const g = globalThis as { wx?: unknown; tt?: unknown };
    const prevWx = g.wx;
    const prevTt = g.tt;
    const rejectAd = (opts: unknown) => {
      created.push(opts);
      return {
        onError() {},
        onClose() {},
        offClose() {},
        show: () => Promise.reject(new Error('should not show')),
        load: () => Promise.reject(new Error('should not load')),
      };
    };
    g.tt = { createRewardedVideoAd: rejectAd };
    g.wx = { createRewardedVideoAd: rejectAd };
    AdManager.destroy();
    try {
      await expect(AdManager.showRewarded('lootRefresh')).resolves.toBe(false);
      expect(adUnitIdFor('lootRefresh')).toBe('');
      expect(created).toEqual([]);
    } finally {
      AdManager.destroy();
      if (prevWx === undefined) delete g.wx;
      else g.wx = prevWx;
      if (prevTt === undefined) delete g.tt;
      else g.tt = prevTt;
    }
  });
});
