import * as PIXI from 'pixi.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const wx: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type NativeTouchApi = {
  onTouchStart?: (cb: (ev: unknown) => void) => void;
  offTouchStart?: (cb: (ev: unknown) => void) => void;
  onTouchMove?: (cb: (ev: unknown) => void) => void;
  offTouchMove?: (cb: (ev: unknown) => void) => void;
  onTouchEnd?: (cb: (ev: unknown) => void) => void;
  offTouchEnd?: (cb: (ev: unknown) => void) => void;
  onTouchCancel?: (cb: (ev: unknown) => void) => void;
  offTouchCancel?: (cb: (ev: unknown) => void) => void;
};

/**
 * 真机 `wx` 是注入全局，不一定在 `globalThis.wx` 上。
 * 和 AssetManager / platformBridge 同一套取法，漏了 onTouchMove 根本绑不上。
 */
export function nativeTouchApi(): NativeTouchApi | null {
  const candidates: unknown[] = [];
  try {
    if (typeof wx !== 'undefined') candidates.push(wx);
  } catch {
    /* 非微信编译环境 */
  }
  const g = globalThis as { wx?: unknown; GameGlobal?: { wx?: unknown } };
  if (g.wx) candidates.push(g.wx);
  if (g.GameGlobal?.wx) candidates.push(g.GameGlobal.wx);
  for (const c of candidates) {
    const api = c as NativeTouchApi;
    if (api && typeof api.onTouchMove === 'function') return api;
  }
  return null;
}

export interface NativeTouchFrame {
  windowHeight: number;
  pixelRatio: number;
}

/**
 * 把微信 touch 收成和 Pixi stage 同一套逻辑像素。
 *
 * 偶发机型 `clientY` 是物理像素（比窗口高一截），按 dpr 折回来；
 * 起手和移动必须用同一套数，不能 Pixi globalY 起手、wx clientY 跟手。
 */
export function readNativeTouchPoint(
  ev: unknown,
  frame?: NativeTouchFrame,
): { x: number; y: number } | null {
  const e = ev as {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>;
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>;
  };
  const t = e.touches?.[0] ?? e.changedTouches?.[0];
  if (!t) return null;
  let x = t.clientX ?? t.x;
  let y = t.clientY ?? t.y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const wh = frame?.windowHeight ?? 0;
  const dpr = frame?.pixelRatio ?? 1;
  if (wh > 0 && dpr > 1 && y > wh * 1.35) {
    x /= dpr;
    y /= dpr;
  }
  return { x, y };
}

export function rectContains(
  r: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** 超过这个位移（逻辑像素）才算拖动，之内视为点击 */
const DRAG_THRESHOLD = 6;

/**
 * 可滚距离。内容比窗口矮时为 0。
 *
 * 不能读挂了 mask 的 `content.height`：Pixi 算包围盒会和裁剪框求交，
 * 结果永远等于窗口高，列表就会「看得见底下被裁掉、却拖不动」。
 */
export function scrollOverflow(viewHeight: number, contentHeight: number): number {
  if (contentHeight <= viewHeight) return 0;
  return viewHeight - contentHeight;
}

/** 按子节点的 y + 高度取最底边。hitArea 优先——带 mask 的卡自己的 height 不可信 */
export function measureStackedBottom(
  children: readonly { y: number; height: number; hitArea?: unknown }[],
): number {
  let bottom = 0;
  for (const child of children) {
    const ha = child.hitArea as { y?: number; height?: number } | undefined;
    const h = typeof ha?.height === 'number' ? (ha.y ?? 0) + ha.height : child.height;
    bottom = Math.max(bottom, child.y + h);
  }
  return bottom;
}

export interface ScrollListHandle {
  root: PIXI.Container;
  /** 把列表项加到这里；超出可视区会被裁掉 */
  content: PIXI.Container;
  /**
   * 内容高度变了之后调一次，用来重新夹紧滚动位置并更新滚动条。
   * 能提供排版算出来的高度就传进来，避免再去读带 mask 的包围盒。
   */
  refresh(contentHeight?: number): void;
  /**
   * 刚才那一下是拖动而不是点击。
   *
   * 列表项自己的 `pointertap` 回调开头调它来判断要不要忽略这次点击——滑动列表时
   * 手指必然落在某个卡片上，不做这层判断的话每次滚动都会顺手点开一张卡。
   */
  wasDragging(): boolean;
}

/**
 * 纵向滚动容器（mask 裁剪 + 拖拽）。
 *
 * 上一版用 `e.pressure <= 0` 判断有没有按住，而 touch 事件不保证提供 pressure，
 * 这个判断在真机上随时可能整个失效；也没有 pointerup 收尾，手指离开后继续移动仍会滚。
 * 现在自己记按下状态，并额外区分点击与拖动——大厅四页全是「可滚列表 + 卡片上有按钮」，
 * 不区分的话滑动一次就会误触发一次点击。
 */
export function createScrollList(opts: {
  width: number;
  height: number;
  x?: number;
  y?: number;
  /** 画滚动条（内容超出时才出现）。列表很短时没必要 */
  showBar?: boolean;
}): ScrollListHandle {
  const root = new PIXI.Container();
  root.x = opts.x ?? 0;
  root.y = opts.y ?? 0;

  const maskG = new PIXI.Graphics();
  maskG.beginFill(0xffffff);
  maskG.drawRect(0, 0, opts.width, opts.height);
  maskG.endFill();
  root.addChild(maskG);

  const content = new PIXI.Container();
  content.mask = maskG;
  root.addChild(content);

  const bar = new PIXI.Graphics();
  bar.visible = false;
  root.addChild(bar);

  let dragging = false;
  let moved = false;
  let startY = 0;
  let contentStartY = 0;
  let laidOutHeight = 0;

  function contentSpan(): number {
    if (laidOutHeight > 0) return laidOutHeight;
    return measureStackedBottom(content.children);
  }

  function maxScroll(): number {
    return scrollOverflow(opts.height, contentSpan());
  }

  function clamp(): void {
    content.y = Math.max(maxScroll(), Math.min(0, content.y));
  }

  function drawBar(): void {
    const span = contentSpan();
    if (!opts.showBar || span <= opts.height) {
      bar.visible = false;
      return;
    }
    const trackH = opts.height;
    const thumbH = Math.max(24, Math.round((opts.height / span) * trackH));
    const progress = maxScroll() === 0 ? 0 : content.y / maxScroll();
    const thumbY = Math.round(progress * (trackH - thumbH));
    bar.clear();
    bar.beginFill(0x000000, 0.22);
    bar.drawRoundedRect(opts.width - 4, thumbY, 3, thumbH, 1.5);
    bar.endFill();
    bar.visible = true;
  }

  function refresh(contentHeight?: number): void {
    if (contentHeight != null && contentHeight > 0) laidOutHeight = contentHeight;
    clamp();
    drawBar();
  }

  root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, opts.width, opts.height);

  const applyDragY = (globalY: number): void => {
    if (!dragging) return;
    const dy = globalY - startY;
    if (!moved && Math.abs(dy) < DRAG_THRESHOLD) return;
    moved = true;
    content.y = Math.max(maxScroll(), Math.min(0, contentStartY + dy));
    drawBar();
  };

  function beginDrag(globalY: number): void {
    dragging = true;
    moved = false;
    startY = globalY;
    contentStartY = content.y;
  }

  function endDrag(): void {
    dragging = false;
  }

  function listRect(): { x: number; y: number; width: number; height: number } {
    const p = root.getGlobalPosition();
    return { x: p.x, y: p.y, width: opts.width, height: opts.height };
  }

  root.on('wheel', (e: PIXI.FederatedWheelEvent) => {
    if (maxScroll() === 0) return;
    content.y = Math.max(maxScroll(), Math.min(0, content.y - e.deltaY));
    drawBar();
  });

  // 真机 EventSystem 经常不派发 pointermove / globalpointermove，按钮点得动、列表拖不动。
  // 有微信触摸 API 就只走这一路：起手和移动同一套坐标，不和 Pixi globalY 混用。
  const api = nativeTouchApi();
  const useNative = !!(api?.onTouchStart && api?.onTouchMove);
  if (useNative && api) {
    let frame: NativeTouchFrame | undefined;
    try {
      const si = typeof wx !== 'undefined' ? wx.getSystemInfoSync?.() : null;
      if (si) {
        frame = {
          windowHeight: si.windowHeight || si.screenHeight || 0,
          pixelRatio: si.pixelRatio || 1,
        };
      }
    } catch {
      frame = undefined;
    }
    const onNativeStart = (ev: unknown): void => {
      const pt = readNativeTouchPoint(ev, frame);
      if (!pt || !rectContains(listRect(), pt.x, pt.y)) return;
      beginDrag(pt.y);
    };
    const onNativeMove = (ev: unknown): void => {
      const pt = readNativeTouchPoint(ev, frame);
      if (!pt) return;
      applyDragY(pt.y);
    };
    api.onTouchStart(onNativeStart);
    api.onTouchMove(onNativeMove);
    api.onTouchEnd?.(endDrag);
    api.onTouchCancel?.(endDrag);
    const prevDestroy = root.destroy.bind(root);
    root.destroy = (options?: PIXI.IDestroyOptions | boolean) => {
      api.offTouchStart?.(onNativeStart);
      api.offTouchMove?.(onNativeMove);
      api.offTouchEnd?.(endDrag);
      api.offTouchCancel?.(endDrag);
      prevDestroy(options);
    };
  } else {
    // 浏览器调试：Pixi 指针事件够用。用 globalpointermove 防止滑出边界就丢手势。
    root.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      beginDrag(e.globalY);
    });
    const onDragMove = (e: PIXI.FederatedPointerEvent): void => {
      applyDragY(e.globalY);
    };
    root.on('pointermove', onDragMove);
    root.on('globalpointermove', onDragMove);
    root.on('pointerup', endDrag);
    root.on('pointerupoutside', endDrag);
    root.on('pointercancel', endDrag);
  }

  return {
    root,
    content,
    refresh,
    // 判断用 `moved` 而不是 `dragging`：tap 事件在 pointerup 之后才派发，
    // 那时 dragging 已经被清掉了，只有「这一轮到底移动过没有」还留着。
    wasDragging: () => moved,
  };
}
