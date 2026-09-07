import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHARE_CARDS, pickShareCard, shareQuery } from '@/data/shareCatalog';
import { readFileSync } from 'node:fs';

describe('微信转发卡片', () => {
  it('两套文案和随包图都在', () => {
    expect(SHARE_CARDS).toHaveLength(2);
    expect(new Set(SHARE_CARDS.map((c) => c.id)).size).toBe(2);
    for (const card of SHARE_CARDS) {
      expect(card.title.length, `${card.id} 标题太短`).toBeGreaterThanOrEqual(6);
      expect(card.title.length, `${card.id} 标题过长会被微信截断`).toBeLessThan(24);
      expect(card.title, `${card.id} 要是钩子不是叙述`).not.toMatch(/先站|往前推|那块高地/);
      expect(card.imageUrl.startsWith('images/share/')).toBe(true);
      expect(existsSync(card.imageUrl), `${card.imageUrl} 必须随包`).toBe(true);
    }
  });

  it('按随机数抽一套，query 带卡片 id', () => {
    expect(pickShareCard(() => 0).id).toBe('tactics');
    expect(pickShareCard(() => 0.99).id).toBe('hill');
    expect(shareQuery(SHARE_CARDS[0]!)).toBe('share=tactics');
  });

  it('启动就会打开转发菜单', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain("from '@/platform/wxShare'");
    expect(main).toContain('installWxShare()');
    expect(main).toContain('timeout-300');
    const share = readFileSync('src/platform/wxShare.ts', 'utf8');
    expect(share).toContain('showShareMenu');
    expect(share).toContain('onShareAppMessage');
    expect(share).toContain("menus: ['shareAppMessage', 'shareTimeline']");
  });
});
