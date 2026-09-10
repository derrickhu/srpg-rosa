import { describe, expect, it } from 'vitest';
import {
  aoeImpactFloatDelayMs,
  HIT_STOP_MS,
  hitDirection,
  hitFlashLift,
  hitKnockDisplacement,
} from '@/view/battle/hitFeel';

describe('hitFeel', () => {
  it('击退开头最猛、结束归零', () => {
    expect(hitKnockDisplacement(0, 10)).toBeCloseTo(0, 5);
    expect(Math.abs(hitKnockDisplacement(0.1, 10))).toBeGreaterThan(2);
    expect(hitKnockDisplacement(1, 10)).toBeCloseTo(0, 5);
  });

  it('闪白开头最亮、结束熄灭', () => {
    expect(hitFlashLift(0)).toBeGreaterThan(0.8);
    expect(hitFlashLift(0.2)).toBe(hitFlashLift(0));
    expect(hitFlashLift(0.6)).toBeLessThan(hitFlashLift(0.2));
    expect(hitFlashLift(1)).toBeCloseTo(0, 5);
  });

  it('爆炸飘字要等环展开，不能和起手亮帧叠在一起', () => {
    expect(aoeImpactFloatDelayMs(0)).toBe(HIT_STOP_MS);
    expect(aoeImpactFloatDelayMs(643)).toBe(Math.round(643 * 0.42));
    expect(aoeImpactFloatDelayMs(643)).toBeGreaterThan(HIT_STOP_MS);
  });

  it('击退方向从攻击者指向受击者', () => {
    const d = hitDirection({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(d.x).toBeCloseTo(0.6, 5);
    expect(d.y).toBeCloseTo(0.8, 5);
  });
});
