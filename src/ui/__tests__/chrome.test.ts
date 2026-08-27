import { describe, expect, it } from 'vitest';
import {
  BUTTON_INSETS,
  FRAME_INSETS,
  PAGE_TITLE_KEYS,
  PAGE_TITLE_WELL,
  buttonSkinLayout,
  canUseButtonSkin,
  fitNineSliceInsets,
  hubTitleWidth,
  hubTitleX,
  shouldUseChromeFrame,
} from '@/ui/chrome';

describe('大厅壳', () => {
  it('角花方框不再套到面板上——拉伸后饰角会变成贴纸', () => {
    expect(shouldUseChromeFrame(300, 220)).toBe(false);
    expect(shouldUseChromeFrame(300, 76)).toBe(false);
  });

  it('金皮只给够宽的主 CTA，小挑战钮不用', () => {
    expect(canUseButtonSkin(240, 48)).toBe(true);
    expect(canUseButtonSkin(74, 36)).toBe(false);
    expect(canUseButtonSkin(200, 48)).toBe(false);
  });

  it('目标比 inset 矮时把四边收到 1/3，而不是硬拉', () => {
    const fitted = fitNineSliceInsets(360, 100, 80, 32, BUTTON_INSETS);
    expect(fitted).not.toBeNull();
    expect(fitted!.left + fitted!.right).toBeLessThan(80);
    expect(fitted!.top + fitted!.bottom).toBeLessThan(32);
  });

  it('目标只剩贴图缝时放弃，避免 NineSlice 除零', () => {
    expect(fitNineSliceInsets(64, 64, 2, 2, FRAME_INSETS)).toBeNull();
  });

  it('页名居中，四页各有一张标题底', () => {
    expect(hubTitleX(375, 248)).toBe(64);
    expect(hubTitleWidth(375)).toBe(248);
    expect(Object.keys(PAGE_TITLE_KEYS)).toEqual(['recruit', 'roster', 'adventure', 'challenge']);
  });

  it('副本底拱门占上沿，字落在偏下的米白井', () => {
    expect(PAGE_TITLE_WELL.challenge.y).toBeGreaterThan(PAGE_TITLE_WELL.adventure.y);
    expect(PAGE_TITLE_WELL.challenge.y).toBeGreaterThan(0.64);
    expect(PAGE_TITLE_WELL.challenge.x).toBeCloseTo(0.5, 1);
  });

  it('金皮圆头按半高切开，不会把弧留在拉伸带', () => {
    const layout = buttonSkinLayout(400, 122, 294, 48);
    expect(layout).not.toBeNull();
    expect(layout!.cap).toBeGreaterThanOrEqual(61);
    expect(layout!.capW * 2).toBeLessThan(294);
  });
});
