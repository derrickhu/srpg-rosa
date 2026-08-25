import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import {
  ROSTER_FOOTER_H,
  rosterCardFooterLayout,
  rosterUnlockHint,
} from '@/view/RosterView';

describe('角色网格灰卡文案', () => {
  it('魂晶解锁写价格，通关解锁写章节名，不写空话', () => {
    const buy = CHARACTER_DEFS.find((d) => d.unlock.kind === 'meta');
    const clear = CHARACTER_DEFS.find((d) => d.unlock.kind === 'clearDungeon');
    expect(buy).toBeDefined();
    expect(clear).toBeDefined();
    expect(rosterUnlockHint(buy!)).toMatch(/^魂晶 \d+$/);
    expect(rosterUnlockHint(clear!)).toMatch(/^通关/);
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
