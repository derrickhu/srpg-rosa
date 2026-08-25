import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { makeText } from '@/theme/typography';
import { C } from '@/view/mvpTheme';

/**
 * 大厅壳贴图。
 *
 * 用户给的参考游戏质感来自**画出来的框 / 绶带 / 金按钮 / 模式插图**，
 * 不是再画一层更圆的 Graphics。这组 helper 负责把 `UI_BUNDLE` 里的壳
 * 拉成任意宽高；贴图没到或目标太矮（角花会被压扁）时返回 null，
 * 调用方走原来的色块，布局不变。
 */

export const HUB_BG_KEY = 'hub_bg';
export const REVEAL_HALL_KEY = 'reveal_hall';

export const FRAME_INSETS = { left: 48, top: 48, right: 48, bottom: 48 };
/**
 * 只给 `fitNineSliceInsets` 单测用。金按钮皮不再走九宫格——
 * 胶囊一被上下一起拉，圆头弧线就会进拉伸带，两边拉出尖翅。
 */
export const BUTTON_INSETS = { left: 80, top: 28, right: 80, bottom: 28 };

/** 贴图像素：切过整颗半圆（半高约 61）再留一点平直金带，避免弧还在拉伸区 */
const BUTTON_CAP_TEX = 70;

export interface NineSliceInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 九宫格四边必须小于贴图和目标。矮按钮 / 窄卡会把角花挤没，
 * 与其硬拉，不如按 1/3 上限把 inset 收一收；仍放不下就放弃贴图。
 */
export function fitNineSliceInsets(
  texW: number,
  texH: number,
  targetW: number,
  targetH: number,
  raw: NineSliceInsets,
): NineSliceInsets | null {
  const left = Math.max(1, Math.floor(Math.min(raw.left, texW / 3, targetW / 3)));
  const right = Math.max(1, Math.floor(Math.min(raw.right, texW / 3, targetW / 3)));
  const top = Math.max(1, Math.floor(Math.min(raw.top, texH / 3, targetH / 3)));
  const bottom = Math.max(1, Math.floor(Math.min(raw.bottom, texH / 3, targetH / 3)));
  if (left + right >= targetW || top + bottom >= targetH) return null;
  if (left + right >= texW || top + bottom >= texH) return null;
  return { left, top, right, bottom };
}

/**
 * 角花方框不能当万能九宫格——拉到列表卡/分区上，饰角会变成四角贴纸。
 * 保留函数只为旧测试和明确拒绝这条路。
 */
export function shouldUseChromeFrame(_width: number, _height: number): boolean {
  return false;
}

/** 金皮只给够宽的主 CTA。左右各要留出整颗圆头，窄了就会拉出尖翅 */
export function canUseButtonSkin(width: number, height: number): boolean {
  return width >= 220 && height >= 44;
}

export function uiTexture(key: string): PIXI.Texture | null {
  if (!AssetManager.isBundleLoaded('ui')) return null;
  const tex = AssetManager.texture('ui', key);
  return tex && tex !== PIXI.Texture.WHITE ? tex : null;
}

export function bgTexture(key: string): PIXI.Texture | null {
  if (!AssetManager.isBundleLoaded('bg')) return null;
  const tex = AssetManager.texture('bg', key);
  return tex && tex !== PIXI.Texture.WHITE ? tex : null;
}

function makeNineSlice(
  tex: PIXI.Texture,
  width: number,
  height: number,
  raw: NineSliceInsets,
): PIXI.NineSlicePlane | null {
  const insets = fitNineSliceInsets(tex.width, tex.height, width, height, raw);
  if (!insets) return null;
  const ns = new PIXI.NineSlicePlane(tex, insets.left, insets.top, insets.right, insets.bottom);
  ns.width = width;
  ns.height = height;
  return ns;
}

/** 描金方框。大厅不再用它套面板；保留给明确的固定尺寸装饰 */
export function makeChromePanel(width: number, height: number): PIXI.Container | null {
  if (!shouldUseChromeFrame(width, height)) return null;
  const tex = uiTexture('frame_panel');
  if (!tex) return null;
  return makeNineSlice(tex, width, height, FRAME_INSETS);
}

/**
 * 金皮只横向三段拉：左右整颗圆头按高度等比缩放，中间平直金带拉宽。
 * 不用 NineSlicePlane——它会把 122px 高的胶囊压成 48px 时切碎圆头。
 */
export function buttonSkinLayout(
  srcW: number,
  srcH: number,
  width: number,
  height: number,
): { cap: number; capW: number } | null {
  if (srcW < 8 || srcH < 8 || width < 8 || height < 8) return null;
  const cap = Math.min(Math.floor(srcW / 3), Math.max(Math.ceil(srcH / 2) + 8, BUTTON_CAP_TEX));
  const capW = Math.max(1, Math.ceil(cap * (height / srcH)));
  if (capW * 2 + 8 >= width) return null;
  return { cap, capW };
}

/** 主 CTA 金按钮皮。高度等比，两头圆角不进拉伸带 */
export function makeButtonSkin(width: number, height: number): PIXI.Container | null {
  if (!canUseButtonSkin(width, height)) return null;
  const tex = uiTexture('btn_primary_skin');
  if (!tex) return null;
  const layout = buttonSkinLayout(tex.width, tex.height, width, height);
  if (!layout) return null;

  const { cap, capW } = layout;
  const srcW = tex.width;
  const srcH = tex.height;
  const base = tex.baseTexture;
  const slice = (x: number, w: number): PIXI.Sprite => {
    const sp = new PIXI.Sprite(new PIXI.Texture(base, new PIXI.Rectangle(x, 0, w, srcH)));
    sp.height = height;
    return sp;
  };

  const wrap = new PIXI.Container();
  const left = slice(0, cap);
  left.width = capW;

  const mid = slice(cap, srcW - cap * 2);
  mid.x = capW;
  mid.width = width - capW * 2;

  const right = slice(srcW - cap, cap);
  right.x = width - capW;
  right.width = capW;

  wrap.addChild(left, mid, right);

  // 再套一层胶囊遮罩：描边若还冒尖，会被圆头裁掉
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff);
  mask.drawRoundedRect(0, 0, width, height, height / 2);
  mask.endFill();
  wrap.addChild(mask);
  wrap.mask = mask;
  return wrap;
}

/**
 * 列表卡左侧插图底板：先铺色块，再把贴图 cover / contain 进去并裁圆角。
 * 场景图用 cover（铺满）；抠好的物件用 contain（四周留底板色，避免透明洞）。
 */
function fillRounded(
  g: PIXI.Graphics,
  w: number,
  h: number,
  radius: number,
  side: 'all' | 'left',
  color: number,
): void {
  g.beginFill(color, 1);
  g.drawRoundedRect(0, 0, w, h, radius);
  if (side === 'left') g.drawRect(w * 0.5, 0, w * 0.5, h);
  g.endFill();
}

export function makeArtPlate(opts: {
  width: number;
  height: number;
  texture: PIXI.Texture | null;
  fill?: number;
  radius?: number;
  mode?: 'cover' | 'contain';
  /** 列表卡左侧铺满：只圆左两角，右边和正文齐平 */
  round?: 'all' | 'left';
}): PIXI.Container {
  const c = new PIXI.Container();
  const r = opts.radius ?? 10;
  const side = opts.round ?? 'all';
  const plate = new PIXI.Graphics();
  fillRounded(plate, opts.width, opts.height, r, side, opts.fill ?? 0x2a2438);
  c.addChild(plate);

  const tex = opts.texture;
  if (tex && tex !== PIXI.Texture.WHITE) {
    const sp = new PIXI.Sprite(tex);
    const mode = opts.mode ?? 'contain';
    const pad = mode === 'contain' ? 6 : 0;
    const s =
      mode === 'cover'
        ? Math.max(opts.width / tex.width, opts.height / tex.height)
        : Math.min((opts.width - pad) / tex.width, (opts.height - pad) / tex.height);
    sp.scale.set(s);
    sp.x = (opts.width - tex.width * s) / 2;
    sp.y = (opts.height - tex.height * s) / 2;
    c.addChild(sp);
  }

  const mask = new PIXI.Graphics();
  fillRounded(mask, opts.width, opts.height, r, side, 0xffffff);
  c.addChild(mask);
  c.mask = mask;
  return c;
}

/**
 * 大厅页名：米白字 + 墨描边，底下一条短墨线。
 *
 * 不是绶带，也不是又一根圆角横条——那两种全站复用一次就腻。
 * 金绶带只留给获得亮相（`makeRibbonTitle`）。
 */
export function makeInkTitle(text: string, opts?: { fontSize?: number }): PIXI.Container {
  const wrap = new PIXI.Container();
  const tx = makeText(text, 'display', {
    fill: C.paper,
    fontSize: opts?.fontSize ?? 24,
    stroke: C.ink,
    strokeThickness: 5,
  });
  wrap.addChild(tx);
  const rule = new PIXI.Graphics();
  rule.beginFill(C.ink, 1);
  rule.drawRoundedRect(0, tx.height + 1, Math.min(32, Math.ceil(tx.width * 0.45)), 3, 1.5);
  rule.endFill();
  wrap.addChild(rule);
  return wrap;
}

/**
 * 金绶带 + 代码叠字。只给获得亮相这种「宣布一件事」的场合。
 * 没贴图时退回金色圆角条，占位尺寸接近绶带比例，调用方不用改排版。
 */
export function makeRibbonTitle(
  text: string,
  width: number,
  opts?: { fontSize?: number },
): PIXI.Container {
  const wrap = new PIXI.Container();
  const tex = uiTexture('ribbon_title');
  let h: number;
  if (tex) {
    const sp = new PIXI.Sprite(tex);
    const s = width / tex.width;
    sp.width = width;
    sp.height = tex.height * s;
    wrap.addChild(sp);
    h = sp.height;
  } else {
    h = Math.max(32, Math.round(width * 0.3));
    const g = new PIXI.Graphics();
    g.beginFill(C.primary, 1);
    g.lineStyle(2, C.ink, 1, 0);
    g.drawRoundedRect(0, 0, width, h, 10);
    g.endFill();
    wrap.addChild(g);
  }

  const tx = makeText(text, 'display', {
    fill: 0xfff8e8,
    fontSize: opts?.fontSize ?? 22,
    stroke: 0x6a3a08,
    strokeThickness: 4,
  });
  tx.anchor.set(0.5);
  tx.x = width / 2;
  tx.y = h * 0.48;
  wrap.addChild(tx);
  return wrap;
}

/**
 * 角色网格卡面。整张缩放，不走九宫格——卡是固定竖比，拉角花没意义。
 */
export function makeRosterCardFace(width: number, height: number, locked: boolean): PIXI.Container {
  const c = new PIXI.Container();
  const tex = uiTexture(locked ? 'roster_card_locked' : 'roster_card');
  if (tex) {
    const sp = new PIXI.Sprite(tex);
    const s = Math.max(width / tex.width, height / tex.height);
    sp.scale.set(s);
    sp.x = (width - tex.width * s) / 2;
    sp.y = (height - tex.height * s) / 2;
    c.addChild(sp);
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRoundedRect(0, 0, width, height, 16);
    mask.endFill();
    c.addChild(mask);
    c.mask = mask;
    return c;
  }
  const g = new PIXI.Graphics();
  g.lineStyle(2.5, C.ink, 1, 0);
  g.beginFill(locked ? 0x7a7a82 : 0xf0c84a, 1);
  g.drawRoundedRect(0, 0, width, height, 16);
  g.endFill();
  c.addChild(g);
  return c;
}

/** 亮相金台。锚在中心；空洞是透明的，棋子站在环里 */
export function makeGoldPlatform(width: number): PIXI.Container | null {
  const tex = uiTexture('platform_gold');
  if (!tex) return null;
  const c = new PIXI.Container();
  const sp = new PIXI.Sprite(tex);
  sp.anchor.set(0.5, 0.55);
  const s = width / tex.width;
  sp.scale.set(s);
  c.addChild(sp);
  return c;
}
