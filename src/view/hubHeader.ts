import * as PIXI from 'pixi.js';
import { getSafeAreaInsets } from '@/core/safeArea';
import {
  hubTitleWidth,
  hubTitleX,
  makePageTitle,
  type HubPageId,
} from '@/ui/chrome';
import { UNIVERSAL_EMBLEM_ICON } from '@/data/personalEmblemCatalog';
import { createCurrencyPill, type CurrencyPill } from '@/view/renderHelpers';

export type { HubPageId };

export const HUB_SOUL_PAD = 12;
/** 魂晶条相对安全区顶的额外空隙。小一点，给详情弹窗让出重叠区 */
export const HUB_SOUL_TOP_GAP = 2;
export const HUB_SOUL_ICON = 20;
export const HUB_SOUL_PILL_H = HUB_SOUL_ICON + 10;
/** 魂晶和纹玉两条之间的空隙 */
export const HUB_CURRENCY_GAP = 8;

export interface HubHeaderOptions {
  screenWidth: number;
  /** 页面标题，如「招募」。留空则只有货币条 */
  title?: string;
  /** 选哪张标题底；有 title 时必传 */
  page?: HubPageId;
  /** 魂晶数量；传 undefined 则不显示货币条 */
  soul?: number;
  /** 纹玉。和魂晶同一行，贴在它右边 */
  emblemTokens?: number;
}

export interface HubHeaderHandle {
  root: PIXI.Container;
  /** 头部占掉的高度：页面内容从这个 y 开始排 */
  height: number;
  setSoul(amount: number): void;
  setEmblemTokens(amount: number): void;
  /** 详情弹窗会自己再画一条。藏的是整行货币，不只是魂晶。 */
  setSoulVisible(visible: boolean): void;
}

/**
 * 大厅四页共用的顶栏：魂晶、纹玉 + 居中页名。
 *
 * 两条货币贴左排成一行，避开微信胶囊（`safeArea.top` 已经在胶囊下沿）。
 * 页名另起一行居中，压在各页自己的装饰底上——不再贴左、也不再用同一根金绶带。
 */

/** 顶栏魂晶条左上角。详情弹窗把同一颗魂晶提到遮罩前时必须对上。 */
export function hubSoulPillOrigin(): { x: number; y: number } {
  const inset = getSafeAreaInsets();
  return { x: HUB_SOUL_PAD, y: inset.top + HUB_SOUL_TOP_GAP };
}

/** 魂晶条下沿。详情弹窗要从这条线下面开始，避免黄标题压住数字。 */
export function hubSoulBarBottom(): number {
  return hubSoulPillOrigin().y + HUB_SOUL_PILL_H;
}

/** 纹玉条左上角。魂晶变宽时要重算，详情弹窗上的那一条也走这里。 */
export function hubEmblemPillOrigin(soulPillWidth: number): { x: number; y: number } {
  const origin = hubSoulPillOrigin();
  return {
    x: origin.x + soulPillWidth + HUB_CURRENCY_GAP,
    y: origin.y,
  };
}

/** 顶栏魂晶图标中心。扫荡入账飞币落在这里，必须和 `createHubHeader` 同一套边距。 */
export function hubSoulIconCenter(): { x: number; y: number } {
  const origin = hubSoulPillOrigin();
  return {
    x: origin.x + 8 + HUB_SOUL_ICON / 2,
    y: origin.y + HUB_SOUL_PILL_H / 2,
  };
}

export function createHubHeader(opts: HubHeaderOptions): HubHeaderHandle {
  const root = new PIXI.Container();
  const origin = hubSoulPillOrigin();
  let y = origin.y;
  let soulPill: CurrencyPill | null = null;
  let tokenPill: CurrencyPill | null = null;

  const placePills = (): void => {
    if (!soulPill) return;
    soulPill.position.set(origin.x, origin.y);
    if (!tokenPill) return;
    const next = hubEmblemPillOrigin(soulPill.width);
    tokenPill.position.set(next.x, next.y);
  };

  if (opts.soul !== undefined) {
    soulPill = createCurrencyPill('icon_soul', `${opts.soul}`);
    tokenPill = createCurrencyPill(UNIVERSAL_EMBLEM_ICON, `${opts.emblemTokens ?? 0}`);
    root.addChild(soulPill);
    root.addChild(tokenPill);
    placePills();
    y += soulPill.height + 6;
  }

  if (opts.title && opts.page) {
    const tw = hubTitleWidth(opts.screenWidth);
    const title = makePageTitle(opts.title, opts.page, tw);
    title.x = hubTitleX(opts.screenWidth, tw);
    title.y = y;
    root.addChild(title);
    y += title.height + 2;
  }

  return {
    root,
    height: y,
    setSoul(amount: number) {
      soulPill?.setText(`${amount}`);
      placePills();
    },
    setEmblemTokens(amount: number) {
      tokenPill?.setText(`${amount}`);
    },
    setSoulVisible(visible: boolean) {
      if (soulPill) soulPill.visible = visible;
      if (tokenPill) tokenPill.visible = visible;
    },
  };
}
