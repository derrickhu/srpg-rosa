import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AD_ICON_KEY, buttonDisabledLook, shouldFireButtonPress } from '@/ui/Button';

describe('按钮禁用', () => {
  it('禁用时不触发回调', () => {
    expect(shouldFireButtonPress(true)).toBe(false);
    expect(shouldFireButtonPress(false)).toBe(true);
  });

  it('禁用态发灰且不接收命中', () => {
    expect(buttonDisabledLook(true)).toEqual({ alpha: 0.45, eventMode: 'none' });
    expect(buttonDisabledLook(false)).toEqual({ alpha: 1, eventMode: 'static' });
  });
});

describe('激励广告按钮共用剪影', () => {
  it('键名锁死，四处入口都引用同一套', () => {
    expect(AD_ICON_KEY).toBe('icon_ad');
    const battle = readFileSync('src/view/BattlePlaybackView.ts', 'utf8');
    const deploy = readFileSync('src/view/DeployView.ts', 'utf8');
    const shop = readFileSync('src/view/ShopView.ts', 'utf8');
    const loot = readFileSync('src/view/battle/resultOverlay.ts', 'utf8');
    expect(battle).toContain('makeRoundHudButton');
    expect(battle).toContain('AD_ICON_KEY');
    expect(battle).toContain("label: '复活'");
    expect(battle).not.toContain('看广告复活');
    expect(deploy).toContain('makeAdButton');
    expect(deploy).toContain('relayoutFightBar()');
    expect(deploy).toContain('canOfferAdExtraSlot');
    expect(shop).toContain('makeAdButton');
    expect(loot).toContain('makeAdButton');
  });

  it('广告钮走青绿档，不跟次行动蓝灰混用', () => {
    const button = readFileSync('src/ui/Button.ts', 'utf8');
    const theme = readFileSync('src/view/mvpTheme.ts', 'utf8');
    expect(theme).toContain('ad: 0x2f8a7a');
    expect(button).toContain('variant: \'ad\'');
    expect(button).toContain('ad: { fill: C.ad');
  });

  it('补给点和三选一的广告钮与下一颗次按钮同宽', () => {
    const shop = readFileSync('src/view/ShopView.ts', 'utf8');
    const loot = readFileSync('src/view/battle/resultOverlay.ts', 'utf8');
    expect(shop).toContain('const footerW = W - PAD * 2');
    expect(shop).toMatch(/leaveBtn = makeButton\([\s\S]*width: footerW/);
    expect(shop).toMatch(/makeAdButton\('刷新货物'[\s\S]*width: footerW/);
    expect(loot).toContain('const subW = Math.min(220, W - 80)');
    expect((loot.match(/width: subW/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
