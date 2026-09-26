import { describe, expect, it } from 'vitest';
import {
  ROSTER_FOOTER_H,
  ROSTER_GRID_COLS,
  rosterCardFooterLayout,
  rosterGridMetrics,
} from '@/view/RosterView';

describe('角色网格', () => {
  it('一行四个，卡宽比三列矮一截，少把 128px 棋子放大', () => {
    expect(ROSTER_GRID_COLS).toBe(4);
    const four = rosterGridMetrics(375);
    expect(four.cols).toBe(4);
    expect(four.cardW).toBeLessThan(90);
    expect(four.cardH).toBeGreaterThan(four.cardW);
  });

  it('底栏里名字在上、等级在下，整块垂直居中', () => {
    const box = rosterCardFooterLayout({ cardH: 160, nameH: 16, subH: 15 });
    expect(box.barTop).toBe(160 - ROSTER_FOOTER_H);
    expect(box.subY).toBeGreaterThan(box.nameY);
    const topPad = box.nameY - box.barTop;
    const bottomPad = 160 - (box.subY + 15);
    expect(Math.abs(topPad - bottomPad)).toBeLessThanOrEqual(1);
  });
});
