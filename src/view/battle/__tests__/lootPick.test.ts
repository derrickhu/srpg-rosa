import { describe, expect, it } from 'vitest';
import {
  OVERLAY_CONFIRM_FX_MS,
  resolveLootConfirm,
  runOverlayConfirm,
} from '@/view/battle/resultOverlay';

describe('三选一确认', () => {
  it('没选中时不能提交', () => {
    expect(resolveLootConfirm(null)).toEqual({ ok: false, reason: 'need-pick' });
  });

  it('选中后确认返回该下标', () => {
    expect(resolveLootConfirm(1)).toEqual({ ok: true, index: 1 });
  });
});

describe('结算领取不能被过场挂死', () => {
  it('过场永不结束时，超时仍会进入下一屏', async () => {
    let called = 0;
    runOverlayConfirm(new Promise(() => {}), () => {
      called += 1;
    });
    expect(called).toBe(0);
    await new Promise((r) => setTimeout(r, OVERLAY_CONFIRM_FX_MS + 40));
    expect(called).toBe(1);
  });

  it('过场正常结束时只确认一次', async () => {
    let called = 0;
    runOverlayConfirm(Promise.resolve(), () => {
      called += 1;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(called).toBe(1);
  });
});
