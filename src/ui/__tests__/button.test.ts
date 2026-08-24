import { describe, expect, it } from 'vitest';
import { buttonDisabledLook, shouldFireButtonPress } from '@/ui/Button';

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
