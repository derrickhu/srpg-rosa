import { describe, expect, it } from 'vitest';
import { UI_BUNDLE } from '@/core/assetBundles';
import {
  CRIT_BURST_SIZE_RATIO,
  CRIT_FLOAT_FILL,
  CRIT_FLOAT_STROKE,
} from '../combatFloatText';

describe('暴击飘字配色', () => {
  it('走橙红热色，不和中毒绿 / 减益紫撞车', () => {
    for (const c of CRIT_FLOAT_FILL) {
      const r = (c >> 16) & 0xff;
      const g = (c >> 8) & 0xff;
      const b = c & 0xff;
      expect(r, '暴击必须是热色，红通道要压过蓝').toBeGreaterThan(b + 40);
      expect(r, '也不能偏成毒绿').toBeGreaterThan(g);
    }
    const sr = (CRIT_FLOAT_STROKE >> 16) & 0xff;
    const sb = CRIT_FLOAT_STROKE & 0xff;
    expect(sr).toBeGreaterThan(sb);
  });

  it('前缀标用贴图且比旧程序星更小', () => {
    expect(UI_BUNDLE.assets.crit_burst).toBe('images/ui/crit_burst.png');
    expect(CRIT_BURST_SIZE_RATIO).toBeLessThan(0.72);
  });
});
