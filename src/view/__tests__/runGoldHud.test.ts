import { describe, expect, it } from 'vitest';
import { getSafeAreaInsets } from '@/core/safeArea';
import {
  RUN_GEAR_SIZE,
  RUN_GEAR_X,
  RUN_GOLD_X,
  RUN_GOLD_X_BESIDE_GEAR,
  RUN_HUD_TOP_GAP,
  runCenterBannerMaxWidth,
  runCenterBannerY,
  deployBoardTopY,
  runGoldYAlign,
  runHudRowY,
} from '@/view/renderHelpers';

describe('局内顶栏：设置和金币同一行', () => {
  it('金币在齿轮右侧，补给点仍贴左缘', () => {
    expect(RUN_GOLD_X_BESIDE_GEAR).toBeGreaterThan(RUN_GEAR_X + RUN_GEAR_SIZE);
    expect(RUN_GOLD_X).toBe(RUN_GEAR_X);
  });

  it('布阵和战斗共用安全区顶，不再往下掉一档', () => {
    expect(runHudRowY(0)).toBe(RUN_HUD_TOP_GAP);
    expect(runHudRowY()).toBe(getSafeAreaInsets().top + RUN_HUD_TOP_GAP);
    expect(runHudRowY(20)).toBe(26);
  });

  it('金币相对齿轮垂直居中', () => {
    expect(runGoldYAlign(54, 36, 30)).toBe(57);
  });

  it('布阵棋盘顶让过齿轮，避免点设置弹出地形', () => {
    expect(deployBoardTopY(0)).toBeGreaterThan(RUN_GEAR_SIZE);
    expect(deployBoardTopY()).toBeGreaterThan(runHudRowY() + RUN_GEAR_SIZE);
  });

  it('居中关卡名贴胶囊下沿，不钻进灵动岛', () => {
    const inset = getSafeAreaInsets();
    expect(runCenterBannerY()).toBe(inset.top);
    expect(runCenterBannerY()).toBeLessThanOrEqual(runHudRowY());
  });

  it('居中牌右边让过微信胶囊', () => {
    const inset = getSafeAreaInsets();
    const sw = inset.menuRect.x + inset.menuRect.width + 7;
    const maxW = runCenterBannerMaxWidth(sw);
    expect((sw + maxW) / 2).toBeLessThanOrEqual(inset.menuRect.x);
  });
});
