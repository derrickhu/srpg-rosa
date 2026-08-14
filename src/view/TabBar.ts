import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { getSafeAreaInsets } from '@/core/safeArea';
import { C, shade } from '@/view/mvpTheme';
import { createUiIcon } from '@/view/renderHelpers';

/**
 * 底部常驻导航 Tab。
 *
 * 四页各管一件事，互不重叠：**招募**管「还没有的角色」、**角色**管已有角色的养成、
 * **冒险**管推进主线、**副本**管可重复刷的内容。
 *
 * 曾经有第五个 `inventory`（背包），已删：`MetaState` 里可数的永久资源只有魂晶
 * （已经常驻顶栏），背包展示的药剂/地形券/词条全部属于 `RunState`，出了副本就不存在。
 * 那一页的空是数据模型决定的，不是 UI 没做好，留着只会一直空。
 */
export type TabId = 'recruit' | 'roster' | 'adventure' | 'challenge';

/** 图标 + 文字那一块的高度，不含底部安全区 */
export const TAB_BAR_CONTENT_HEIGHT = 64;

interface TabSpec {
  id: TabId;
  label: string;
  /** images/ui 里的图标 key */
  icon: string;
}

const TABS: TabSpec[] = [
  // 图标暂时沿用店铺摊位那张。语义已经不符（招募的是人不是货），欠一张专门的招募图标
  { id: 'recruit', label: '招募', icon: 'tab_shop' },
  { id: 'roster', label: '角色', icon: 'tab_roster' },
  { id: 'adventure', label: '冒险', icon: 'tab_adventure' },
  { id: 'challenge', label: '副本', icon: 'tab_challenge' },
];

const ICON_SIZE = 24;
const ICON_SIZE_ACTIVE = 28;

/**
 * 底栏实际占的高度 = 内容高 + 底部安全区。
 *
 * 全面屏底部那条 home indicator 是系统画的，不垫高的话它正好压在图标和文字上，
 * 而且那一条区域上滑会被系统吃掉，最下面一排的点击本来就不可靠。
 */
export function tabBarHeight(): number {
  return TAB_BAR_CONTENT_HEIGHT + getSafeAreaInsets().bottom;
}

export function createTabBar(
  active: TabId,
  onSelect: (t: TabId) => void,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = tabBarHeight();
  const root = new PIXI.Container();
  root.y = screen.screenHeight - H;

  const bg = new PIXI.Graphics();
  bg.beginFill(C.panel, 0.98);
  bg.drawRect(0, 0, W, H);
  bg.endFill();
  bg.lineStyle(2, C.ink, 1);
  bg.moveTo(0, 0);
  bg.lineTo(W, 0);
  root.addChild(bg);

  const slotW = W / TABS.length;
  TABS.forEach((t, i) => {
    const c = new PIXI.Container();
    c.x = i * slotW;

    const isActive = t.id === active;
    if (isActive) {
      const hl = new PIXI.Graphics();
      hl.lineStyle(2, C.ink, 1, 0);
      hl.beginFill(C.primary, 1);
      hl.drawRoundedRect(6, -10, slotW - 12, TAB_BAR_CONTENT_HEIGHT + 4, 12);
      hl.endFill();
      c.addChild(hl);
    }

    // 图标同时要压在深色底栏和选中态的金色高亮上，两种底色差得很远。图标本身是
    // 「亮填充 + 近黑描边」，深底靠填充、金底靠描边，所以这里不需要按状态改色。
    const size = isActive ? ICON_SIZE_ACTIVE : ICON_SIZE;
    const icon = createUiIcon(t.icon, size);
    if (icon) {
      icon.x = (slotW - size) / 2;
      icon.y = (isActive ? 14 : 20) - size / 2;
      c.addChild(icon);
    }

    const label = makeText(t.label, isActive ? 'uiStrong' : 'ui', {
      fill: isActive ? shade(C.primary, 0.32) : 0xa8b4c8,
      fontSize: 12,
    });
    label.anchor.set(0.5, 0);
    label.x = slotW / 2;
    label.y = isActive ? 30 : 36;
    c.addChild(label);

    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new PIXI.Rectangle(0, -10, slotW, H + 10);
    if (!isActive) c.on('pointertap', () => onSelect(t.id));
    root.addChild(c);
  });

  return root;
}
