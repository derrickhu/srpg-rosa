/**
 * 抖音福利：侧边栏复访 + 添加到桌面。微信不创建这个界面。
 * 「添加到桌面」的原生调用必须留在 pointertap 同步栈里。
 */
import * as PIXI from 'pixi.js';
import {
  claimDesktopReward,
  claimSidebarReward,
  DOUYIN_DESKTOP_SOUL,
  DOUYIN_SIDEBAR_SOUL,
  sidebarClaimedToday,
} from '@/game/state/douyinWelfare';
import type { MetaState } from '@/game/state/GameState';
import { DesktopEntry, SidebarEntry } from '@/platform/douyinEntry';
import { makeButton } from '@/ui/Button';
import { showToast } from '@/ui/Toast';
import { makeText } from '@/theme/typography';
import { C } from '@/view/mvpTheme';

const SIDEBAR_STEPS = [
  '点抖音首页侧边栏图标',
  '在最近使用里点「无尽纹章」',
  '回到游戏领取魂晶',
];

export function createDouyinWelfareEntry(opts: {
  screenW: number;
  top: number;
  onOpen: () => void;
}): PIXI.Container {
  const btn = makeButton('福利', opts.onOpen, {
    variant: 'secondary',
    width: 64,
    height: 28,
    fontSize: 13,
    radius: 8,
  });
  btn.x = opts.screenW - 64 - 10;
  btn.y = opts.top + 6;
  return btn;
}

export function createDouyinWelfarePanel(opts: {
  screenW: number;
  screenH: number;
  meta: MetaState;
  onChanged: () => void;
  onClose: () => void;
}): PIXI.Container {
  DesktopEntry.refreshStatus();
  const root = new PIXI.Container();
  const dim = new PIXI.Graphics();
  dim.beginFill(0x000000, 0.55);
  dim.drawRect(0, 0, opts.screenW, opts.screenH);
  dim.endFill();
  dim.eventMode = 'static';
  dim.on('pointertap', (e) => {
    if (e.target === dim) opts.onClose();
  });
  root.addChild(dim);

  const panelW = Math.min(320, opts.screenW - 28);
  const panel = new PIXI.Container();
  panel.eventMode = 'static';
  root.addChild(panel);

  const title = makeText('抖音福利', 'heading', { fill: C.ink, fontSize: 18 });
  title.x = 16;
  title.y = 14;
  panel.addChild(title);

  const close = makeButton('关闭', opts.onClose, {
    variant: 'ghost',
    width: 64,
    height: 28,
    fontSize: 13,
    radius: 8,
  });
  close.x = panelW - 64 - 12;
  close.y = 12;
  panel.addChild(close);

  let y = 52;
  y = addSidebarCard(panel, opts, panelW, y);
  y = addDesktopCard(panel, opts, panelW, y + 10);
  const panelH = y + 16;

  const bg = new PIXI.Graphics();
  bg.beginFill(C.paper, 0.98);
  bg.lineStyle(2, C.ink, 1);
  bg.drawRoundedRect(0, 0, panelW, panelH, 14);
  bg.endFill();
  panel.addChildAt(bg, 0);
  panel.x = Math.floor((opts.screenW - panelW) / 2);
  panel.y = Math.max(12, Math.floor((opts.screenH - panelH) / 2));
  return root;

  function redraw(message?: string): void {
    const parent = root.parent;
    if (!parent) return;
    const index = parent.getChildIndex(root);
    const next = createDouyinWelfarePanel(opts);
    parent.addChildAt(next, index);
    parent.removeChild(root);
    root.destroy({ children: true });
    if (message) showToast(parent, message, { screenWidth: opts.screenW });
  }

  function addSidebarCard(
    host: PIXI.Container,
    view: typeof opts,
    width: number,
    top: number,
  ): number {
    const fromSidebar = SidebarEntry.isFromSidebar();
    const claimed = sidebarClaimedToday(view.meta);
    const showSteps = !claimed && !fromSidebar;
    const cardH = showSteps ? 168 : 92;
    const card = new PIXI.Container();
    card.y = top;
    card.x = 12;
    const innerW = width - 24;
    const plate = new PIXI.Graphics();
    plate.beginFill(0xf4f1e8, 1);
    plate.lineStyle(1.5, C.ink, 0.35);
    plate.drawRoundedRect(0, 0, innerW, cardH, 10);
    plate.endFill();
    card.addChild(plate);

    const head = makeText('侧边栏进入领奖励', 'uiStrong', { fill: C.ink, fontSize: 15 });
    head.x = 12;
    head.y = 10;
    card.addChild(head);

    let body = `每日一次 · 魂晶 +${DOUYIN_SIDEBAR_SOUL}`;
    let label = '进入侧边栏';
    let enabled = true;
    if (claimed) {
      body = '今日已领取，明天从侧边栏再来';
      label = '明日再来';
      enabled = false;
    } else if (fromSidebar) {
      body = `这次是从侧边栏进来的 · 可领魂晶 +${DOUYIN_SIDEBAR_SOUL}`;
      label = '领取奖励';
    }
    const desc = makeText(body, 'caption', {
      fill: C.text,
      fontSize: 12,
      wordWrap: true,
      wordWrapWidth: innerW - 24,
    });
    desc.x = 12;
    desc.y = 34;
    card.addChild(desc);

    if (showSteps) {
      SIDEBAR_STEPS.forEach((step, i) => {
        const line = makeText(`${i + 1}. ${step}`, 'caption', { fill: C.ink, fontSize: 12 });
        line.x = 12;
        line.y = 58 + i * 18;
        card.addChild(line);
      });
    }

    const button = makeButton(label, () => {
      if (claimed) return;
      if (fromSidebar) {
        if (claimSidebarReward(view.meta, true)) {
          view.onChanged();
          redraw(`魂晶 +${DOUYIN_SIDEBAR_SOUL}`);
        }
        return;
      }
      SidebarEntry.navigate({
        onFail: () => showToast(root, '当前抖音版本没有侧边栏，请升级后再试', {
          screenWidth: view.screenW,
          deny: true,
        }),
      });
    }, {
      variant: enabled ? 'primary' : 'secondary',
      disabled: !enabled,
      width: innerW - 24,
      height: 32,
      fontSize: 14,
      radius: 8,
    });
    button.x = 12;
    button.y = cardH - 40;
    card.addChild(button);
    host.addChild(card);
    return top + cardH;
  }

  function addDesktopCard(
    host: PIXI.Container,
    view: typeof opts,
    width: number,
    top: number,
  ): number {
    const cardH = 92;
    const innerW = width - 24;
    const claimed = !!view.meta.douyinDesktopRewardClaimed;
    const added = DesktopEntry.alreadyAdded;
    const card = new PIXI.Container();
    card.x = 12;
    card.y = top;
    const plate = new PIXI.Graphics();
    plate.beginFill(0xf4f1e8, 1);
    plate.lineStyle(1.5, C.ink, 0.35);
    plate.drawRoundedRect(0, 0, innerW, cardH, 10);
    plate.endFill();
    card.addChild(plate);

    const head = makeText('添加到桌面', 'uiStrong', { fill: C.ink, fontSize: 15 });
    head.x = 12;
    head.y = 10;
    card.addChild(head);
    const desc = makeText(
      claimed
        ? '奖励已领取'
        : `把游戏加到手机桌面 · 魂晶 +${DOUYIN_DESKTOP_SOUL}`,
      'caption',
      { fill: C.text, fontSize: 12, wordWrap: true, wordWrapWidth: innerW - 24 },
    );
    desc.x = 12;
    desc.y = 34;
    card.addChild(desc);

    const label = claimed ? '已完成' : (added ? '领取奖励' : '添加到桌面');
    const button = makeButton(label, () => {
      if (claimed) return;
      if (added) {
        if (claimDesktopReward(view.meta)) {
          view.onChanged();
          redraw(`魂晶 +${DOUYIN_DESKTOP_SOUL}`);
        }
        return;
      }
      const started = DesktopEntry.add({
        onSuccess: () => {
          const granted = claimDesktopReward(view.meta);
          if (granted) view.onChanged();
          redraw(granted ? `已添加到桌面，魂晶 +${DOUYIN_DESKTOP_SOUL}` : undefined);
        },
        onFail: () => showToast(root, '这个设备暂时加不了桌面', {
          screenWidth: view.screenW,
          deny: true,
        }),
      });
      if (!started) {
        showToast(root, '这个设备暂时加不了桌面', { screenWidth: view.screenW, deny: true });
      }
    }, {
      variant: claimed ? 'secondary' : 'primary',
      disabled: claimed,
      width: innerW - 24,
      height: 32,
      fontSize: 14,
      radius: 8,
    });
    button.x = 12;
    button.y = cardH - 40;
    card.addChild(button);
    host.addChild(card);
    return top + cardH;
  }
}
