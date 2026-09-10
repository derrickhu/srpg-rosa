import { describe, expect, it } from 'vitest';
import { sweepFlyCount } from '@/view/fx/celebration';
import { hubSoulIconCenter } from '@/view/hubHeader';
import { sweepRewardCopy, sweepRewardEntry } from '@/view/sweepRewardOverlay';

describe('扫荡奖励展示', () => {
  it('文案写清章节和入账数量，不写空话', () => {
    const copy = sweepRewardCopy('草原战线 · 精英', 5);
    expect(copy.title).toBe('扫  荡');
    expect(copy.subtitle).toBe('草原战线 · 精英');
    expect(copy.amountLabel).toBe('+5');
    expect(sweepRewardEntry(5).iconKey).toBe('icon_soul');
    expect(sweepRewardEntry(5).amount).toBe(5);
  });

  it('飞向顶栏的枚数跟魂晶走，不超过 5', () => {
    expect(sweepFlyCount(3)).toBe(3);
    expect(sweepFlyCount(5)).toBe(5);
    expect(sweepFlyCount(12)).toBe(5);
    expect(sweepFlyCount(0)).toBe(1);
  });

  it('落点在左上魂晶条，不飞出屏幕', () => {
    const p = hubSoulIconCenter();
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(80);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(80);
  });
});
