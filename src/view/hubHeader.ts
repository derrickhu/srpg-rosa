import * as PIXI from 'pixi.js';
import { getSafeAreaInsets } from '@/core/safeArea';
import {
  hubTitleWidth,
  hubTitleX,
  makePageTitle,
  type HubPageId,
} from '@/ui/chrome';
import { createCurrencyPill } from '@/view/renderHelpers';

export type { HubPageId };

export interface HubHeaderOptions {
  screenWidth: number;
  /** 页面标题，如「招募」。留空则只有货币条 */
  title?: string;
  /** 选哪张标题底；有 title 时必传 */
  page?: HubPageId;
  /** 魂晶数量；传 undefined 则不显示货币条 */
  soul?: number;
}

export interface HubHeaderHandle {
  root: PIXI.Container;
  /** 头部占掉的高度：页面内容从这个 y 开始排 */
  height: number;
}

/**
 * 大厅四页共用的顶栏：魂晶条 + 居中页名。
 *
 * 魂晶贴左，避开微信胶囊（`safeArea.top` 已经在胶囊下沿）。
 * 页名另起一行居中，压在各页自己的装饰底上——不再贴左、也不再用同一根金绶带。
 */
export function createHubHeader(opts: HubHeaderOptions): HubHeaderHandle {
  const root = new PIXI.Container();
  const inset = getSafeAreaInsets();
  const PAD = 12;
  let y = inset.top + 6;

  if (opts.soul !== undefined) {
    const pill = createCurrencyPill('icon_soul', `${opts.soul}`);
    pill.x = PAD;
    pill.y = y;
    root.addChild(pill);
    y += pill.height + 6;
  }

  if (opts.title && opts.page) {
    const tw = hubTitleWidth(opts.screenWidth);
    const title = makePageTitle(opts.title, opts.page, tw);
    title.x = hubTitleX(opts.screenWidth, tw);
    title.y = y;
    root.addChild(title);
    y += title.height + 2;
  }

  return { root, height: y };
}
