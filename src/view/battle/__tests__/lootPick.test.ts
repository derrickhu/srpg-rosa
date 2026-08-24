import { describe, expect, it } from 'vitest';
import { resolveLootConfirm } from '@/view/battle/resultOverlay';

describe('三选一确认', () => {
  it('没选中时不能提交', () => {
    expect(resolveLootConfirm(null)).toEqual({ ok: false, reason: 'need-pick' });
  });

  it('选中后确认返回该下标', () => {
    expect(resolveLootConfirm(1)).toEqual({ ok: true, index: 1 });
  });
});
