import { describe, expect, it } from 'vitest';
import { AdManager, adUnitIdFor, rewardedVideoCreateOptions } from '@/platform/AdManager';

describe('激励视频广告位', () => {
  it('四个场景各自对应公众平台里的广告位', () => {
    expect(adUnitIdFor('lootRefresh')).toBe('adunit-e4b32e99968edcea');
    expect(adUnitIdFor('shopRefresh')).toBe('adunit-acf6a35bbf1db91b');
    expect(adUnitIdFor('extraDeploy')).toBe('adunit-d38d1888866177c1');
    expect(adUnitIdFor('revive')).toBe('adunit-75d725546bf4aacd');
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
});
