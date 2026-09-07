import { pickShareCard, shareQuery } from '@/data/shareCatalog';
import { hasWx } from '@/platform/wxPlatform';

declare const wx: any;

let installed = false;

function sharePayload(): { title: string; imageUrl: string; query: string } {
  const card = pickShareCard();
  return {
    title: card.title,
    imageUrl: card.imageUrl,
    query: shareQuery(card),
  };
}

/**
 * 打开右上角「转发 / 分享」。不调的话菜单会灰掉，写「当前页面不可转发」。
 * 每次点转发现抽一套文案和宣传图。
 */
export function installWxShare(): void {
  if (installed || !hasWx()) return;
  installed = true;

  try {
    wx.showShareMenu?.({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  } catch (e) {
    console.warn('[share] showShareMenu failed', e);
  }

  try {
    wx.onShareAppMessage?.(sharePayload);
  } catch (e) {
    console.warn('[share] onShareAppMessage failed', e);
  }

  try {
    wx.onShareTimeline?.(sharePayload);
  } catch (e) {
    console.warn('[share] onShareTimeline failed', e);
  }
}
