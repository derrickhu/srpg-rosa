import * as PIXI from 'pixi.js';
import { AudioManager } from '@/core/AudioManager';
import { makeText } from '@/theme/typography';
import { C, shade } from '@/view/mvpTheme';
import { fadeScrim } from '@/view/fx/celebration';
import { isDisplayLive } from '@/view/pixiLive';
import { awaitEase } from '@/view/fx/tween';
import { makePanel } from './Panel';
import { attachPress } from './press';
import { createScrollList, type ScrollListHandle } from './ScrollList';

export interface ModalOptions {
  screenWidth: number;
  screenHeight: number;
  panelWidth?: number;
  panelHeight?: number;
  dimAlpha?: number;
  /** 明底面板。正文多、要读字的弹窗用它（角色详情这类） */
  light?: boolean;
  /** 标题栏文字。不传就没有标题栏，`body` 从面板顶部开始 */
  title?: string;
  /** 标题栏高度。角色详情要放大头像时加高，默认 44 */
  titleHeight?: number;
  /** 标题栏右侧的关闭按钮 */
  showClose?: boolean;
  /**
   * 关闭按钮贴标题栏右上角，而不是竖向居中。
   * 角色详情标题栏加高后，居中的叉会跟招牌技能挤在一起。
   */
  closeCorner?: boolean;
  /**
   * 内容区可滚动。
   *
   * 弹窗高度受屏幕限制，而角色详情这类内容长度由数据决定（技能几条、词条几层），
   * 一定会有超出的机型。不给滚动的话超出部分就是彻底看不到。
   */
  scrollable?: boolean;
  /** 关闭时的额外回调（点遮罩、点关闭按钮都会走） */
  onClose?: () => void;
  /** 弹出动画走到 1 倍之后。挖洞要等这一下，否则量到的是缩放中的格子 */
  onOpened?: () => void;
  /** 面板额外下移，给顶栏货币条让路。默认居中 */
  offsetY?: number;
  /**
   * 底部固定栏高度。角色详情要把「升级 / 技能详情」钉在面板底，
   * 不跟可滚内容一起跑掉。
   */
  footerHeight?: number;
}

export interface ModalHandle {
  root: PIXI.Container;
  panel: PIXI.Container;
  /**
   * 遮罩和面板之上。角色详情要把顶栏魂晶提到遮罩前面时挂这里，
   * 挂 `root` 里 dim 前面会被压暗，挂 panel 里会跟着弹窗一起被裁。
   */
  overlay: PIXI.Container;
  /** 内容容器：标题栏之下的可用区域，坐标原点在它自己的左上角 */
  body: PIXI.Container;
  /**
   * 黄标题栏里的内容槽。角色详情把头像和名字塞进这一行，
   * 不再在正文再占一块人物信息。
   */
  titleBar: PIXI.Container;
  titleBarSize: { width: number; height: number };
  /** 面板底栏。高度为 0 时是空容器，别往上排东西 */
  footer: PIXI.Container;
  /** 内容区可用宽高，排版按它算 */
  bodySize: { width: number; height: number };
  footerSize: { width: number; height: number };
  /** `scrollable` 时内容变化后调一次；非滚动模式是空操作 */
  refresh(): void;
  /**
   * 刚才那一下是在滚内容，不是点击。
   *
   * 内容区里的按钮必须自己查一下：Pixi 的 `pointertap` 只要求按下和抬起落在同一个对象上，
   * 手指从按钮上开始滑、又在按钮上松开时它照样触发——那一下会变成一次误购买。
   */
  wasDragging(): boolean;
  /** 改标题栏文字（等级这类会当场变的东西） */
  setTitle(text: string): void;
  close(): void;
}

/** 标题栏高度 */
const TITLE_H = 44;
const PAD = 12;

/** 上两角圆、下沿方的色块，用来当标题栏（PIXI 没有分角圆角） */
function drawTopRounded(g: PIXI.Graphics, w: number, h: number, radius: number, color: number): void {
  g.beginFill(color, 1);
  g.drawRoundedRect(0, 0, w, h, radius);
  g.drawRect(0, h - radius, w, radius);
  g.endFill();
}

/** 关闭按钮：画出来的叉。不用 `×` 字形——游戏字体是裁过的子集，缺字会出豆腐块 */
function makeCloseButton(size: number, onTap: () => void): PIXI.Container {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(C.ink, 0.14);
  g.drawCircle(size / 2, size / 2, size / 2);
  g.endFill();
  const arm = size * 0.24;
  g.lineStyle(2.5, C.ink, 0.85);
  g.moveTo(size / 2 - arm, size / 2 - arm);
  g.lineTo(size / 2 + arm, size / 2 + arm);
  g.moveTo(size / 2 + arm, size / 2 - arm);
  g.lineTo(size / 2 - arm, size / 2 + arm);
  c.addChild(g);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  // 命中区比图形大一圈：44px 是拇指的最小舒适命中尺寸，而这个叉只有 24px
  c.hitArea = new PIXI.Circle(size / 2, size / 2, size / 2 + 10);
  attachPress(c);
  c.on('pointertap', onTap);
  return c;
}

/** 面板最终 y：默认垂直居中，再加 `offsetY`，并夹在屏内。 */
export function modalPanelRestY(screenH: number, panelH: number, offsetY = 0): number {
  const raw = Math.floor((screenH - panelH) / 2) + offsetY;
  const minY = 8;
  const maxY = Math.max(minY, screenH - panelH - 8);
  return Math.max(minY, Math.min(maxY, raw));
}

/**
 * 全屏遮罩 + 居中面板。
 *
 * 遮罩不只是装饰：它把底下那一页的所有按钮挡住，弹窗期间点哪儿都不会误触到背景。
 * 所以 `dim` 自己也要 `eventMode = 'static'`，否则点击会穿透过去。
 */
export function createModal(opts: ModalOptions): ModalHandle {
  const root = new PIXI.Container();
  root.eventMode = 'static';
  AudioManager.playSfx('ui_open');

  const dim = fadeScrim(opts.screenWidth, opts.screenHeight, opts.dimAlpha ?? 0.55);
  root.addChild(dim);

  const pw = opts.panelWidth ?? 300;
  const ph = opts.panelHeight ?? 400;
  const radius = 14;
  const restX = Math.floor((opts.screenWidth - pw) / 2);
  const restY = modalPanelRestY(opts.screenHeight, ph, opts.offsetY ?? 0);
  const panel = makePanel({
    width: pw,
    height: ph,
    x: restX,
    y: restY,
    light: opts.light ?? false,
    radius,
  });
  panel.pivot.set(pw / 2, ph / 2);
  panel.x = restX + pw / 2;
  panel.y = restY + ph / 2;
  panel.scale.set(0.88);
  panel.alpha = 0;
  void awaitEase(220, (t) => {
    if (!isDisplayLive(panel)) return;
    panel.alpha = t;
    const s = t < 0.7 ? 0.88 + 0.18 * (t / 0.7) : 1.06 - 0.06 * ((t - 0.7) / 0.3);
    panel.scale.set(s);
  }, { live: () => isDisplayLive(panel) }).then(() => {
    if (!isDisplayLive(panel)) return;
    panel.alpha = 1;
    panel.scale.set(1);
    opts.onOpened?.();
  });
  root.addChild(panel);

  const overlay = new PIXI.Container();
  overlay.eventMode = 'none';
  root.addChild(overlay);

  // 先拆自己再回调：`onClose` 里常常会触发整页重绘（这棵树连着被销毁），
  // 反过来的话拆的就是一棵已经被别人销毁掉的树
  function close(): void {
    if (root.parent) root.parent.removeChild(root);
    if (!root.destroyed) root.destroy({ children: true });
    opts.onClose?.();
  }

  // 只有点在遮罩本身上才关：点面板内部时事件冒泡到 root，e.target 是面板里的东西
  dim.on('pointertap', (e) => {
    if (e.target === dim) close();
  });

  let bodyTop = PAD;
  let titleTx: PIXI.Text | null = null;
  const titleBar = new PIXI.Container();
  let titleBarSize = { width: 0, height: 0 };
  if (opts.title !== undefined) {
    const titleH = opts.titleHeight ?? TITLE_H;
    const bar = new PIXI.Graphics();
    drawTopRounded(bar, pw, titleH, radius, C.primary);
    panel.addChild(bar);

    const closeSize = 24;
    const closeRight = opts.closeCorner ? 16 : PAD;
    const closeTop = opts.closeCorner ? 6 : (titleH - closeSize) / 2;
    const closeW = opts.showClose ? closeSize + closeRight : 0;
    titleBar.x = PAD;
    panel.addChild(titleBar);
    titleBarSize = { width: pw - PAD - closeW - (opts.closeCorner ? 10 : 4), height: titleH };

    if (opts.title) {
      const t = makeText(opts.title, 'heading', {
        fill: shade(C.primary, 0.28),
        fontSize: 18,
        letterSpacing: 0.6,
      });
      t.anchor.set(0, 0.5);
      t.x = PAD + 2;
      t.y = titleH / 2;
      panel.addChild(t);
      titleTx = t;
    }

    if (opts.showClose) {
      const btn = makeCloseButton(closeSize, close);
      btn.x = pw - closeSize - closeRight;
      btn.y = closeTop;
      panel.addChild(btn);
    }
    bodyTop = titleH + 8;
  } else if (opts.showClose) {
    const btn = makeCloseButton(24, close);
    btn.x = pw - 24 - PAD;
    btn.y = PAD;
    panel.addChild(btn);
    bodyTop = PAD + 24 + 4;
  }

  const footerH = opts.footerHeight ?? 0;
  const footer = new PIXI.Container();
  footer.y = ph - footerH;
  panel.addChild(footer);

  const bodyW = pw - PAD * 2;
  const bodyH = ph - bodyTop - (footerH > 0 ? footerH : PAD);

  let body: PIXI.Container;
  let scroll: ScrollListHandle | null = null;
  if (opts.scrollable) {
    scroll = createScrollList({ x: PAD, y: bodyTop, width: bodyW, height: bodyH, showBar: true });
    panel.addChild(scroll.root);
    body = scroll.content;
  } else {
    body = new PIXI.Container();
    body.x = PAD;
    body.y = bodyTop;
    panel.addChild(body);
  }

  return {
    root,
    panel,
    overlay,
    body,
    titleBar,
    titleBarSize,
    footer,
    bodySize: { width: bodyW, height: bodyH },
    footerSize: { width: pw, height: footerH },
    refresh: () => scroll?.refresh(),
    wasDragging: () => scroll?.wasDragging() ?? false,
    setTitle: (text: string) => {
      if (titleTx && !titleTx.destroyed) titleTx.text = text;
    },
    close,
  };
}
