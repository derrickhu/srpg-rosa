import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { makeButton } from '@/ui/Button';
import { AudioManager } from '@/core/AudioManager';
import { createUiIcon } from '@/view/renderHelpers';
import { C } from '@/view/mvpTheme';
import { isDisplayLive } from '@/view/pixiLive';
import { awaitEase } from '@/view/fx/tween';
import {
  confettiBurst,
  createTitleBanner,
  dropBanner,
  fadeScrim,
  flySoulBurstTo,
  staggerPop,
} from '@/view/fx/celebration';
import { hubSoulIconCenter } from '@/view/hubHeader';

export interface SweepRewardOverlayOpts {
  screenW: number;
  screenH: number;
  chapterName: string;
  soul: number;
  onConfirm: () => void;
}

export function sweepRewardCopy(chapterName: string, soul: number): {
  title: string;
  subtitle: string;
  amountLabel: string;
  hint: string;
} {
  return {
    title: '扫  荡',
    subtitle: chapterName,
    amountLabel: `+${soul} 魂晶`,
    hint: '已入账，可用于升级和招募',
  };
}

/**
 * 大厅扫荡结算。盖在冒险页上，不换页。
 *
 * 扫荡没有战斗回放，Toast 一闪就没了。这一屏把「拿了什么」摊开，
 * 点收下时魂晶飞进顶栏，收入才有落点。
 */
export function createSweepRewardOverlay(opts: SweepRewardOverlayOpts): PIXI.Container {
  const { screenW: W, screenH: H, soul } = opts;
  const copy = sweepRewardCopy(opts.chapterName, soul);
  const root = new PIXI.Container();
  AudioManager.playSfx('sfx_soul_gain');

  const scrim = fadeScrim(W, H);
  root.addChild(scrim);

  const cx = W / 2;
  const bannerW = Math.min(280, W - 48);
  const bannerY = Math.max(40, H * 0.14);
  const banner = createTitleBanner(copy.title, bannerW);
  const bannerH = banner.height;
  banner.pivot.x = bannerW / 2;
  banner.x = cx;
  root.addChild(banner);
  dropBanner(banner, bannerY);
  confettiBurst(root, cx, bannerY + 20, 22);

  const sub = makeText(copy.subtitle, 'body', { fill: 0xe8e8d8 });
  sub.anchor.set(0.5, 0);
  sub.x = cx;
  sub.y = bannerY + Math.max(bannerH, 60) + 10;
  root.addChild(sub);

  const cardW = Math.min(200, W - 80);
  const cardH = 110;
  const card = new PIXI.Container();
  card.x = cx;
  card.y = sub.y + 28 + cardH / 2;
  card.pivot.set(cardW / 2, cardH / 2);

  const bg = new PIXI.Graphics();
  bg.lineStyle(2.5, C.ink, 1);
  bg.beginFill(C.paper, 0.96);
  bg.drawRoundedRect(0, 0, cardW, cardH, 14);
  bg.endFill();
  card.addChild(bg);

  const icon = createUiIcon('icon_soul', 40);
  if (icon) {
    icon.x = (cardW - 40) / 2;
    icon.y = 12;
    card.addChild(icon);
  }

  const amt = makeText(copy.amountLabel, 'uiStrong', {
    fill: C.soulText,
    fontSize: 22,
  });
  amt.anchor.set(0.5, 1);
  amt.x = cardW / 2;
  amt.y = cardH - 12;
  card.addChild(amt);
  root.addChild(card);
  staggerPop([card], 40);

  const hint = makeText(copy.hint, 'caption', { fill: 0xb8b8a8, fontSize: 11 });
  hint.anchor.set(0.5, 0);
  hint.x = cx;
  hint.y = card.y + cardH / 2 + 10;
  root.addChild(hint);

  const btnW = Math.min(220, W - 80);
  let confirmed = false;
  const btn = makeButton('收  下', () => {
    if (confirmed) return;
    confirmed = true;
    btn.setDisabled(true);
    const from = { x: card.x, y: card.y };
    const to = hubSoulIconCenter();
    const live = (): boolean => isDisplayLive(root);
    void (async () => {
      void awaitEase(220, (t) => {
        if (isDisplayLive(scrim)) scrim.alpha = 0.72 * (1 - t);
      }, { live });
      await flySoulBurstTo(root, from, to, soul);
      if (live()) opts.onConfirm();
    })();
  }, {
    variant: 'primary', width: btnW, height: 48, fontSize: 17, radius: 14,
  });
  btn.x = cx - btnW / 2;
  btn.y = hint.y + 28;
  root.addChild(btn);

  return root;
}
