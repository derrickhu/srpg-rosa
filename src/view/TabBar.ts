import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { C, shade } from '@/view/mvpTheme';
import { createUiIcon } from '@/view/renderHelpers';

/** 底部常驻导航 Tab */
export type TabId = 'shop' | 'roster' | 'adventure' | 'inventory' | 'challenge';

export const TAB_BAR_HEIGHT = 64;

interface TabSpec {
  id: TabId;
  label: string;
  /** images/ui 里的图标 key */
  icon: string;
}

const TABS: TabSpec[] = [
  { id: 'shop', label: '商店', icon: 'tab_shop' },
  { id: 'roster', label: '角色', icon: 'tab_roster' },
  { id: 'adventure', label: '冒险', icon: 'tab_adventure' },
  { id: 'inventory', label: '背包', icon: 'tab_inventory' },
  { id: 'challenge', label: '副本', icon: 'tab_challenge' },
];

const ICON_SIZE = 24;
const ICON_SIZE_ACTIVE = 28;

export function createTabBar(
  active: TabId,
  onSelect: (t: TabId) => void,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const root = new PIXI.Container();
  root.y = screen.screenHeight - TAB_BAR_HEIGHT;

  const bg = new PIXI.Graphics();
  bg.beginFill(C.panel, 0.98);
  bg.drawRect(0, 0, W, TAB_BAR_HEIGHT);
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
      hl.drawRoundedRect(6, -10, slotW - 12, TAB_BAR_HEIGHT + 4, 12);
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
    c.hitArea = new PIXI.Rectangle(0, -10, slotW, TAB_BAR_HEIGHT + 10);
    if (!isActive) c.on('pointertap', () => onSelect(t.id));
    root.addChild(c);
  });

  return root;
}
