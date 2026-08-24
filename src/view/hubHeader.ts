import * as PIXI from 'pixi.js';
import { getSafeAreaInsets } from '@/core/safeArea';
import { makeRibbonTitle } from '@/ui/chrome';
import { createCurrencyPill } from '@/view/renderHelpers';

export interface HubHeaderOptions {
  screenWidth: number;
  /** 页面标题，如「招募」。留空则只有货币条 */
  title?: string;
  /** 魂晶数量；传 undefined 则不显示货币条 */
  soul?: number;
}

export interface HubHeaderHandle {
  root: PIXI.Container;
  /** 头部占掉的高度：页面内容从这个 y 开始排 */
  height: number;
}

/**
 * 大厅四页共用的顶栏：魂晶条 + 页面标题。
 *
 * 抽出来解决两件事。
 *
 * 一是**避开微信胶囊**。右上角那块（`···` 和 `⊙`）是系统占用的，画上去会被压掉：
 * 原来背包页的横幅「…结束即清空」在真机上只剩前半句，招募页标题也贴着胶囊。
 * 所以标题不居中，而是贴左排在胶囊下沿之下（`safeArea.top`）。
 *
 * 二是**四页一致**。原来商店/角色/冒险各画一份魂晶条、副本页干脆没有，同一个信息
 * 在不同 tab 之间会跳位置甚至消失，玩家每切一页都要重新找它在哪。
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
    y += pill.height + 8;
  }

  if (opts.title) {
    // 金绶带压在大厅厅堂底上，贴左躲开微信胶囊。字叠在带子上，不烧进贴图。
    const ribbonW = Math.min(200, Math.max(140, opts.screenWidth - 96));
    const ribbon = makeRibbonTitle(opts.title, ribbonW, { fontSize: 22 });
    ribbon.x = PAD;
    ribbon.y = y;
    root.addChild(ribbon);
    y += ribbon.height + 4;
  }

  return { root, height: y };
}
