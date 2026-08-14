import * as PIXI from 'pixi.js';

/** 超过这个位移（逻辑像素）才算拖动，之内视为点击 */
const DRAG_THRESHOLD = 6;

export interface ScrollListHandle {
  root: PIXI.Container;
  /** 把列表项加到这里；超出可视区会被裁掉 */
  content: PIXI.Container;
  /**
   * 内容高度变了之后调一次，用来重新夹紧滚动位置并更新滚动条。
   * 不自动监听是有意的：Pixi 没有布局事件，每帧去读 `content.height` 会白算一遍包围盒。
   */
  refresh(): void;
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

  function maxScroll(): number {
    // content.height 是包围盒，比可视区短时不允许滚（否则会把内容拽出去）
    return Math.min(0, opts.height - content.height);
  }

  function clamp(): void {
    content.y = Math.max(maxScroll(), Math.min(0, content.y));
  }

  function drawBar(): void {
    const span = content.height;
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

  function refresh(): void {
    clamp();
    drawBar();
  }

  root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, opts.width, opts.height);

  root.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    dragging = true;
    moved = false;
    startY = e.globalY;
    contentStartY = content.y;
  });

  // 用 globalpointermove 而不是 pointermove：后者只在指针**还压在列表上**时派发，
  // 手指一滑出边界（弹窗里的列表离面板边缘只有十几像素）滚动就会卡住不动，
  // 手感读起来像掉帧。全局事件配合 dragging 标志才跟得住整段手势。
  root.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
    if (!dragging) return;
    const dy = e.globalY - startY;
    if (!moved && Math.abs(dy) < DRAG_THRESHOLD) return;
    moved = true;
    content.y = Math.max(maxScroll(), Math.min(0, contentStartY + dy));
    drawBar();
  });

  // pointerup 只在指针**还在容器内**时触发，滑出去松手要靠 upoutside，否则 dragging
  // 会一直挂着：下次手指落下时 startY 还是上一次的，列表会瞬间跳一大段。
  function endDrag(): void {
    dragging = false;
  }
  root.on('pointerup', endDrag);
  root.on('pointerupoutside', endDrag);
  root.on('pointercancel', endDrag);

  return {
    root,
    content,
    refresh,
    // 判断用 `moved` 而不是 `dragging`：tap 事件在 pointerup 之后才派发，
    // 那时 dragging 已经被清掉了，只有「这一轮到底移动过没有」还留着。
    wasDragging: () => moved,
  };
}
