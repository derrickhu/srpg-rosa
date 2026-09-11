import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showHandlers: Array<() => void> = [];

beforeEach(() => {
  showHandlers.length = 0;
  (globalThis as { wx?: unknown }).wx = {
    shareAppMessage: vi.fn(),
    onShow: (fn: () => void) => {
      showHandlers.push(fn);
    },
  };
});

afterEach(async () => {
  const { abandonPendingShare } = await import('../wxShare');
  abandonPendingShare();
  delete (globalThis as { wx?: unknown }).wx;
  vi.resetModules();
});

describe('按钮转发', () => {
  it('点下去先不成功，回到前台才算完成', async () => {
    const { shareAppMessage } = await import('../wxShare');
    let settled: boolean | undefined;
    const p = shareAppMessage().then((ok) => {
      settled = ok;
    });
    await Promise.resolve();
    expect(settled).toBeUndefined();
    await Promise.resolve();
    for (const fn of showHandlers) fn();
    await p;
    expect(settled).toBe(true);
  });
});
