import { describe, expect, it } from 'vitest';
import { AdManager, adUnitIdFor } from '@/platform/AdManager';

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
});
