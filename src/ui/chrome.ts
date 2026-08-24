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
export const BUTTON_INSETS = { left: 48, top: 28, right: 48, bottom: 28 };

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

/** 金皮只给够宽的主 CTA。小「挑战」钮九宫格会把两头拉成把手 */
export function canUseButtonSkin(width: number, height: number): boolean {
  return width >= 200 && height >= 44;
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

/** 主 CTA 金按钮皮。高度随按钮走，两头圆角由贴图自己保 */
export function makeButtonSkin(width: number, height: number): PIXI.NineSlicePlane | null {
  if (!canUseButtonSkin(width, height)) return null;
  const tex = uiTexture('btn_primary_skin');
  if (!tex) return null;
  return makeNineSlice(tex, width, height, BUTTON_INSETS);
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
 * 金绶带 + 代码叠字。字不烧进贴图，大厅标题和亮相名牌才能换文案。
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
