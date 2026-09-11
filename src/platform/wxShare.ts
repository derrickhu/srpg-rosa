import { pickShareCard, shareQuery } from '@/data/shareCatalog';
import { hasWx } from '@/platform/wxPlatform';

declare const wx: any;

let installed = false;
let lifecycleHooked = false;
let waiting: ((ok: boolean) => void) | null = null;
let armed = false;
let waitTimer: ReturnType<typeof setTimeout> | null = null;

function sharePayload(): { title: string; imageUrl: string; query: string } {
  const card = pickShareCard();
  return {
    title: card.title,
    imageUrl: card.imageUrl,
    query: shareQuery(card),
  };
}

function finishShare(ok: boolean): void {
  if (!waiting) return;
  const done = waiting;
  waiting = null;
  armed = false;
  if (waitTimer != null) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  done(ok);
}

function onGameShow(): void {
  if (!waiting || !armed) return;
  finishShare(true);
}

function hookShareLifecycle(): void {
  if (lifecycleHooked || !hasWx()) return;
  lifecycleHooked = true;
  try {
    wx.onShow?.(onGameShow);
  } catch (e) {
    console.warn('[share] lifecycle hook failed', e);
  }
}

/**
 * 按钮主动拉起转发。非微信环境（浏览器 / 单测）直接算成功，方便把领奖链路跑通。
 * 真机没有「是否发给了好友」的回执：点下去只打开面板，回到前台才算完成。
 */
export function shareAppMessage(): Promise<boolean> {
  if (!hasWx()) return Promise.resolve(true);
  if (waiting) return Promise.resolve(false);
  hookShareLifecycle();
  return new Promise((resolve) => {
    waiting = resolve;
    armed = false;
    waitTimer = setTimeout(() => finishShare(false), 60_000);
    try {
      if (typeof wx.shareAppMessage !== 'function') {
        finishShare(false);
        return;
      }
      wx.shareAppMessage(sharePayload());
      queueMicrotask(() => {
        if (waiting) armed = true;
      });
    } catch (e) {
      console.warn('[share] shareAppMessage failed', e);
      finishShare(false);
    }
  });
}

/** 单测：清掉未完成的等待，避免用例互相卡住。 */
export function abandonPendingShare(): void {
  finishShare(false);
}

/**
 * 打开右上角「转发 / 分享」。不调的话菜单会灰掉，写「当前页面不可转发」。
 * 每次点转发现抽一套文案和宣传图。
 */
export function installWxShare(): void {
  if (installed || !hasWx()) return;
  installed = true;
  hookShareLifecycle();

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
