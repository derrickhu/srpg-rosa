/**
 * 启动全屏 Loading（对齐 xiaochu2：随包 splash + Logo 先出，再拉其余资源）
 * 底图 / Logo / 金色进度条 / 著作权人 / 健康游戏忠告
 */
import * as PIXI from 'pixi.js';
import { getSafeAreaInsets } from '@/core/safeArea';
import { makeText, showcaseFontFamily } from '@/theme/typography';
import { C, shade } from '@/view/mvpTheme';

const LEGAL_BOTTOM_INSET = 28;
const BAR_ABOVE_LEGAL_GAP = 14;
const LEGAL_FONT_SIZE = 12;
const LEGAL_LINE_HEIGHT = 18;

/** 软著尚未下证，编号空着；下证后补一行即可 */
export const LOADING_LEGAL_TEXT = [
  '著作权人：深圳幸运呱科技有限公司',
  '',
  '《健康游戏忠告》',
  '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。',
  '适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。',
].join('\n');

const BAR_MAX_W = 320;
const BAR_PAD_X = 24;
const BAR_H = 28;
const BAR_R = BAR_H / 2;
const INNER_PAD = 3;

export interface LoadingView {
  root: PIXI.Container;
  setProgress(ratio: number): void;
  applySplash(tex: PIXI.Texture): void;
  applyLogo(tex: PIXI.Texture): void;
  /** 展示字体就绪后刷新文字标题；已换成 Logo 则什么都不做 */
  refreshTitleFont(): void;
}

export function createLoadingView(screen: {
  screenWidth: number;
  screenHeight: number;
}): LoadingView {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();

  const bg = new PIXI.Graphics();
  bg.beginFill(C.panel, 1);
  bg.drawRect(0, 0, W, H);
  bg.endFill();
  root.addChild(bg);

  let splash: PIXI.Sprite | null = null;

  const footer = new PIXI.Graphics();
  root.addChild(footer);

  const title = makeText('无尽纹章', 'display', {
    fill: C.primary,
    fontSize: 32,
    stroke: C.ink,
    strokeThickness: 4,
  });
  title.anchor.set(0.5);
  title.visible = false;
  root.addChild(title);

  let logo: PIXI.Sprite | null = null;

  const barShadow = new PIXI.Graphics();
  const track = new PIXI.Graphics();
  const fill = new PIXI.Graphics();
  root.addChild(barShadow, track, fill);

  const pctText = makeText('0%', 'uiStrong', {
    fill: 0x4a3a12,
    fontSize: 14,
  });
  pctText.anchor.set(0.5);
  root.addChild(pctText);

  const barW = Math.min(BAR_MAX_W, W - BAR_PAD_X * 2);
  const legal = makeText(LOADING_LEGAL_TEXT, 'caption', {
    fill: C.textOnDark,
    fontSize: LEGAL_FONT_SIZE,
    align: 'center',
    lineHeight: LEGAL_LINE_HEIGHT,
    wordWrap: true,
    wordWrapWidth: barW,
    dropShadow: true,
    dropShadowColor: C.ink,
    dropShadowBlur: 2,
    dropShadowAngle: Math.PI / 2,
    dropShadowDistance: 1,
    dropShadowAlpha: 0.55,
  });
  legal.anchor.set(0.5, 1);
  root.addChild(legal);

  let progress = 0;
  const barX = (W - barW) / 2;
  let barY = 0;

  const placeTitle = (): void => {
    const safeTop = getSafeAreaInsets().top;
    const cy = Math.max(safeTop + 48, H * 0.22);
    if (logo) {
      logo.x = W / 2;
      logo.y = cy;
    } else {
      title.x = W / 2;
      title.y = cy;
    }
  };

  const drawFooter = (): void => {
    footer.clear();
    const top = Math.max(0, barY - 18);
    footer.beginFill(0x1a2838, 0.72);
    footer.drawRect(0, top, W, H - top);
    footer.endFill();
  };

  const drawBar = (): void => {
    const pad = 3;
    barShadow.clear();
    barShadow.beginFill(C.ink, 0.22);
    barShadow.drawRoundedRect(barX - pad, barY - pad + 4, barW + pad * 2, BAR_H + pad * 2, BAR_R + 2);
    barShadow.endFill();

    track.clear();
    track.lineStyle(2, C.ink, 1);
    track.beginFill(C.paper, 0.92);
    track.drawRoundedRect(barX, barY, barW, BAR_H, BAR_R);
    track.endFill();

    fill.clear();
    const innerW = barW - INNER_PAD * 2;
    const innerH = BAR_H - INNER_PAD * 2;
    const w = Math.max(0, innerW * progress);
    if (w < 0.5) return;
    const x0 = barX + INNER_PAD;
    const y0 = barY + INNER_PAD;
    const r = Math.max(8, BAR_R - INNER_PAD);
    fill.beginFill(shade(C.primary, 0.78), 0.98);
    fill.drawRoundedRect(x0, y0, w, innerH, r);
    fill.endFill();
    const hiH = Math.max(3, Math.floor(innerH * 0.45));
    fill.beginFill(C.primary, 0.95);
    fill.drawRoundedRect(x0, y0, w, hiH, r);
    fill.endFill();
  };

  const layout = (): void => {
    const bottom = Math.max(LEGAL_BOTTOM_INSET, getSafeAreaInsets().bottom + 12);
    legal.position.set(W / 2, H - bottom);
    barY = legal.position.y - legal.height - BAR_ABOVE_LEGAL_GAP - BAR_H;
    pctText.position.set(W / 2, barY + BAR_H * 0.5);
    placeTitle();
    drawFooter();
    drawBar();
  };

  layout();

  return {
    root,
    setProgress(ratio: number): void {
      const p = Math.max(0, Math.min(1, ratio));
      if (p < progress) return;
      progress = p;
      pctText.text = `${Math.round(progress * 100)}%`;
      drawBar();
    },
    applySplash(tex: PIXI.Texture): void {
      if (!tex || tex === PIXI.Texture.WHITE) return;
      if (splash) {
        root.removeChild(splash);
        splash.destroy();
        splash = null;
      }
      const sp = new PIXI.Sprite(tex);
      const scale = Math.max(W / tex.width, H / tex.height);
      sp.scale.set(scale);
      sp.anchor.set(0.5);
      sp.position.set(W / 2, H / 2);
      root.addChildAt(sp, 1);
      splash = sp;
    },
    applyLogo(tex: PIXI.Texture): void {
      if (!tex || tex === PIXI.Texture.WHITE) {
        title.visible = true;
        layout();
        return;
      }
      if (logo) {
        root.removeChild(logo);
        logo.destroy();
        logo = null;
      }
      const sp = new PIXI.Sprite(tex);
      const maxW = Math.min(W * 0.78, 320);
      const aspect = tex.width / tex.height;
      sp.width = maxW;
      sp.height = maxW / aspect;
      sp.anchor.set(0.5);
      root.addChild(sp);
      logo = sp;
      title.visible = false;
      layout();
    },
    refreshTitleFont(): void {
      if (logo) return;
      title.style.fontFamily = showcaseFontFamily();
      title.visible = true;
    },
  };
}
