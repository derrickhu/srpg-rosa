import { describe, expect, it } from 'vitest';
import {
  RUN_GEAR_SIZE,
  RUN_GEAR_X,
  RUN_GOLD_X,
  RUN_GOLD_X_BESIDE_GEAR,
  RUN_GOLD_Y_STANDALONE,
  runGoldYAlign,
  runHudRowY,
} from '@/view/renderHelpers';

describe('局内顶栏：设置和金币同一行', () => {
  it('金币在齿轮右侧，补给点仍贴左缘', () => {
    expect(RUN_GOLD_X_BESIDE_GEAR).toBeGreaterThan(RUN_GEAR_X + RUN_GEAR_SIZE);
    expect(RUN_GOLD_X).toBe(RUN_GEAR_X);
  });

  it('设置从安全顶降到金币原来的行', () => {
    expect(runHudRowY(6)).toBe(RUN_GOLD_Y_STANDALONE);
    expect(runHudRowY(6)).toBeGreaterThan(6);
  });

  it('金币相对齿轮垂直居中', () => {
    expect(runGoldYAlign(54, 36, 30)).toBe(57);
  });
});
