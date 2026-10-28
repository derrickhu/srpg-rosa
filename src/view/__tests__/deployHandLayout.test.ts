import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scrollOverflow } from '@/ui/ScrollList';
import { benchHandMetrics } from '@/view/DeployView';

describe('部署替补席', () => {
  it('人少时卡宽不变，整排居中，不需要滑', () => {
    const m = benchHandMetrics(400, 4);
    expect(m.scrollable).toBe(false);
    expect(m.slotW).toBe(72);
    const cardsW = 4 * m.slotW + 3 * m.gap;
    expect(m.originX).toBe(Math.floor((400 - cardsW) / 2));
  });

  it('人多时不把卡压窄，往左滑到头能完整看到最后一张', () => {
    const sw = 390;
    const count = 10;
    const m = benchHandMetrics(sw, count);
    expect(m.scrollable).toBe(true);
    expect(m.slotW).toBe(72);
    const overflow = scrollOverflow(sw, m.contentW);
    expect(overflow).toBeLessThan(0);
    const lastRight = m.originX + (count - 1) * (m.slotW + m.gap) + m.slotW;
    expect(lastRight + overflow).toBe(sw - m.pad);
  });

  it('重绘替补席不调用 queueMicrotask，避免抖音点击时 Illegal invocation', () => {
    const src = readFileSync(new URL('../DeployView.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/queueMicrotask\s*\(/);
  });
});
