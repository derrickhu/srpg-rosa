import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { rosterUnlockHint } from '@/view/RosterView';

describe('角色网格灰卡文案', () => {
  it('魂晶解锁写价格，通关解锁写章节名，不写空话', () => {
    const buy = CHARACTER_DEFS.find((d) => d.unlock.kind === 'meta');
    const clear = CHARACTER_DEFS.find((d) => d.unlock.kind === 'clearDungeon');
    expect(buy).toBeDefined();
    expect(clear).toBeDefined();
    expect(rosterUnlockHint(buy!)).toMatch(/^魂晶 \d+$/);
    expect(rosterUnlockHint(clear!)).toMatch(/^通关/);
  });
});
