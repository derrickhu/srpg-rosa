import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { lockedCharacterDefs } from '@/game/characterFactory';
import { createInitialMeta, createInitialState } from '@/game/state/GameState';
import { acquireHint } from '@/view/RecruitView';

/**
 * 大厅四页的职责边界。
 *
 * 这些不是渲染测试（Pixi 在 node 里跑不起来），守的是**数据侧的划分**：
 * 每个 tab 从哪个集合取数据。UI 长什么样会一直改，「同一个角色不能在两页都能买」
 * 这类规则不能跟着改。
 */
describe('大厅 tab 职责', () => {
  it('招募页和角色页的数据源不重叠', () => {
    const meta = createInitialMeta();
    // 角色页 = `meta.roster`，招募页 = 其补集。两页各画一份「未拥有」列表时，
    // 解锁按钮会在两个地方出现，玩家得先猜哪个是正的
    const ownedIds = new Set(meta.roster.map((m) => m.rosterId));
    const recruitIds = new Set(lockedCharacterDefs(meta.roster).map((d) => d.id));

    for (const id of ownedIds) {
      expect(recruitIds.has(id), `${id} 同时出现在角色页和招募页`).toBe(false);
    }
    expect(ownedIds.size + recruitIds.size).toBe(CHARACTER_DEFS.length);
  });

  it('招募页覆盖全部未拥有角色，不只是能用魂晶买的', () => {
    const meta = createInitialMeta();
    const shown = lockedCharacterDefs(meta.roster);
    // 通关解锁的角色也要出现（写条件、不给按钮）：只列商品的话，
    // 玩家不知道打那个副本能换来一个人，也就没有理由去打
    expect(shown.some((d) => d.unlock.kind === 'clearDungeon')).toBe(true);
    expect(shown.some((d) => d.unlock.kind === 'meta')).toBe(true);
  });

  it('通关解锁写章节名，不写长段来源说明', () => {
    const state = createInitialState();
    const clear = CHARACTER_DEFS.find((d) => d.unlock.kind === 'clearDungeon');
    expect(clear).toBeDefined();
    expect(acquireHint(state, clear!)).toMatch(/^通关「/);
    expect(acquireHint(state, clear!)).not.toMatch(/自动加入/);
  });
});

/**
 * 背包 tab 已删，`TabId` 收成 4 个。
 *
 * 用读源码而不是 import 来断言，是因为 `TabId` 是纯类型，运行时拿不到；
 * 而这条要防的恰恰是**留在别处的字符串**——某个 View 里写着
 * `renderShell('inventory')` 时类型检查会拦住，但注释里、文档里的残留会一路带到线上。
 */
describe('背包 tab 的清理', () => {
  const tabBarSrc = readFileSync('src/view/TabBar.ts', 'utf8');

  it('TabId 只有四个，且不含 inventory', () => {
    const m = tabBarSrc.match(/export type TabId =([^;]+);/);
    expect(m).not.toBeNull();
    const ids = [...m![1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(ids).toEqual(['recruit', 'roster', 'adventure', 'challenge']);
  });

  it('TabBar 的可见 tab 与 TabId 一一对应', () => {
    const ids = [...tabBarSrc.matchAll(/\{ id: '([a-z]+)', label: '(.+?)'/g)].map((m) => ({
      id: m[1],
      label: m[2],
    }));
    expect(ids.map((t) => t.id)).toEqual(['recruit', 'roster', 'adventure', 'challenge']);
    // 「商店」改名「招募」：这一页现在只发角色，不卖别的
    expect(ids[0]!.label).toBe('招募');
  });
});
