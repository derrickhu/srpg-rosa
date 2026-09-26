import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lockedCharacterDefs } from '@/game/characterFactory';
import { createInitialMeta } from '@/game/state/GameState';
import { recruitShelfDefs } from '@/view/RecruitView';
import { tabSlotRect } from '@/view/TabBar';

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
    const ownedIds = new Set(meta.roster.map((m) => m.rosterId));
    const recruitIds = new Set(recruitShelfDefs(meta.roster).map((d) => d.id));

    for (const id of ownedIds) {
      expect(recruitIds.has(id), `${id} 同时出现在角色页和招募页`).toBe(false);
    }
  });

  it('招募页只列花魂晶买的人，关卡解锁的不在这页', () => {
    const meta = createInitialMeta();
    const shown = recruitShelfDefs(meta.roster);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((d) => d.unlock.kind === 'meta')).toBe(true);
    expect(shown.some((d) => d.unlock.kind === 'clearDungeon')).toBe(false);
    const chapterLocked = lockedCharacterDefs(meta.roster).filter((d) => d.unlock.kind === 'clearDungeon');
    expect(chapterLocked.length).toBeGreaterThan(0);
    for (const def of chapterLocked) {
      expect(shown.some((d) => d.id === def.id), `${def.name} 不该出现在招募页`).toBe(false);
    }
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

  it('底栏角色格能挂升级红点', () => {
    const tabBarSrc = readFileSync('src/view/TabBar.ts', 'utf8');
    expect(tabBarSrc).toContain('alerts');
    const flowSrc = readFileSync('src/view/GameFlow.ts', 'utf8');
    expect(flowSrc).toContain('rosterHasAffordableLevelUp');
  });

  it('角色 tab 挖洞在底栏第二格', () => {
    const screen = { screenWidth: 360, screenHeight: 640 };
    const roster = tabSlotRect('roster', screen);
    const recruit = tabSlotRect('recruit', screen);
    expect(roster.x).toBeGreaterThan(recruit.x);
    expect(roster.y).toBeGreaterThan(500);
  });
});
