import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { makeText } from '@/theme/typography';
import { isDisplayLive, safeDestroy } from '@/view/pixiLive';
import { C } from '@/view/mvpTheme';
import { createUiIcon, type CurrencyPill } from '@/view/renderHelpers';
import { awaitDelay, awaitEase } from './tween';

/** 半透明遮罩：压暗下层，并吃掉穿透到棋盘的点击 */
export function createScrim(w: number, h: number, alpha = 0.72): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.beginFill(0x000000, alpha);
  g.drawRect(0, 0, w, h);
  g.endFill();
  g.eventMode = 'static';
  g.hitArea = new PIXI.Rectangle(0, 0, w, h);
  return g;
}

/** 从全透明淡入到目标透明度，点击一开始就拦住 */
export function fadeScrim(w: number, h: number, alpha = 0.72): PIXI.Graphics {
  const g = createScrim(w, h, 1);
  g.alpha = 0;
  void awaitEase(180, (t) => {
    if (isDisplayLive(g)) g.alpha = alpha * t;
  }, { live: () => isDisplayLive(g) });
  return g;
}

/**
 * 金色横幅贴图 + 代码标题。字不烧进贴图，文案才能跟着「胜利 / 通关 / 获得」变。
 *
 * 容器原点在横幅左上角，方便 `dropBanner` 整块位移。
 */
export function createTitleBanner(text: string, width: number): PIXI.Container {
  const wrap = new PIXI.Container();
  let h = 60;
  if (AssetManager.isBundleLoaded('ui')) {
    const tex = AssetManager.texture('ui', 'banner_victory');
    if (tex && tex !== PIXI.Texture.WHITE) {
      const sp = new PIXI.Sprite(tex);
      const s = width / tex.width;
      sp.width = width;
      sp.height = tex.height * s;
      wrap.addChild(sp);
      h = sp.height;
    }
  }
  const tx = makeText(text, 'display', {
    fill: 0xfff4d8,
    fontSize: 30,
    stroke: 0x7a4a10,
    strokeThickness: 5,
  });
  tx.anchor.set(0.5);
  tx.x = width / 2;
  tx.y = h * 0.58;
  wrap.addChild(tx);
  return wrap;
}

/** 横幅从上方落入，轻微过冲后回正 */
export function dropBanner(node: PIXI.Container, restY: number): void {
  const startY = restY - 40;
  node.y = startY;
  node.scale.set(0.84);
  node.alpha = 0;
  const live = (): boolean => isDisplayLive(node);
  void awaitEase(300, (t) => {
    if (!live()) return;
    node.alpha = t;
    node.y = startY + (restY - startY) * t;
    const s = t < 0.72 ? 0.84 + 0.28 * (t / 0.72) : 1.12 - 0.12 * ((t - 0.72) / 0.28);
    node.scale.set(s);
  }, { live }).then(() => {
    if (!live()) return;
    node.alpha = 1;
    node.y = restY;
    node.scale.set(1);
  });
}

/** 子节点错帧弹出：0.7 → 过冲 → 1 */
export function staggerPop(nodes: PIXI.Container[], gapMs = 70): void {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    n.scale.set(0.72);
    n.alpha = 0;
    const live = (): boolean => isDisplayLive(n);
    void awaitDelay(i * gapMs).then(() =>
      awaitEase(220, (t) => {
        if (!live()) return;
        n.alpha = t;
        const s = t < 0.68 ? 0.72 + 0.4 * (t / 0.68) : 1.12 - 0.12 * ((t - 0.68) / 0.32);
        n.scale.set(s);
      }, { live }),
    ).then(() => {
      if (!live()) return;
      n.alpha = 1;
      n.scale.set(1);
    });
  }
}

const CONFETTI_COLORS = [0xeec462, 0xfcfcf6, 0xd8b0ff, 0xfff4d8];

/** 一小簇色块彩纸。金 / 米白 / 魂晶紫，不和战场抢高饱和彩虹 */
export function confettiBurst(parent: PIXI.Container, x: number, y: number, count = 28): void {
  const pieces: Array<{
    g: PIXI.Graphics;
    vx: number;
    vy: number;
    rot: number;
  }> = [];
  for (let i = 0; i < count; i++) {
    const g = new PIXI.Graphics();
    const w = 3 + (i % 4);
    const h = 5 + (i % 3);
    g.beginFill(CONFETTI_COLORS[i % CONFETTI_COLORS.length]!, 1);
    g.drawRect(-w / 2, -h / 2, w, h);
    g.endFill();
    g.x = x;
    g.y = y;
    g.rotation = (i / count) * Math.PI * 2;
    parent.addChild(g);
    const ang = (i / count) * Math.PI * 2 + (i % 5) * 0.2;
    pieces.push({
      g,
      vx: Math.cos(ang) * (1.6 + (i % 7) * 0.35),
      vy: Math.sin(ang) * (1.2 + (i % 5) * 0.3) - 2.4,
      rot: ((i % 2) * 2 - 1) * 0.12,
    });
  }
  const ticker = PIXI.Ticker.shared;
  if (!ticker.started) {
    for (const p of pieces) safeDestroy(p.g);
    return;
  }
  let acc = 0;
  const step = (): void => {
    acc += ticker.deltaMS;
    const k = Math.min(1, acc / 620);
    for (const p of pieces) {
      if (!isDisplayLive(p.g)) continue;
      p.vy += 0.18;
      p.g.x += p.vx;
      p.g.y += p.vy;
      p.g.rotation += p.rot;
      p.g.alpha = 1 - k;
    }
    if (k >= 1 || !isDisplayLive(parent)) {
      ticker.remove(step);
      for (const p of pieces) safeDestroy(p.g);
    }
  };
  ticker.add(step);
}

export interface GlowHandle {
  setActive: (on: boolean) => void;
}

/** 选中卡外圈脉冲。节点销毁后 ticker 自己摘掉 */
export function attachGlowRing(
  parent: PIXI.Container,
  w: number,
  h: number,
  color = C.primary,
): GlowHandle {
  const g = new PIXI.Graphics();
  g.lineStyle(4, color, 1);
  g.drawRoundedRect(-5, -5, w + 10, h + 10, 14);
  g.alpha = 0;
  parent.addChildAt(g, 0);
  let active = false;
  const ticker = PIXI.Ticker.shared;
  const step = (): void => {
    if (!isDisplayLive(g)) {
      ticker.remove(step);
      return;
    }
    if (!active) {
      g.alpha = 0;
      return;
    }
    g.alpha = 0.4 + (Math.sin(ticker.lastTime / 160) * 0.5 + 0.5) * 0.45;
  };
  if (ticker.started) ticker.add(step);
  return {
    setActive(on: boolean) {
      active = on;
      if (!on && isDisplayLive(g)) g.alpha = 0;
    },
  };
}

/**
 * 掉落物用的金光晕。锚在父节点原点。
 *
 * 草地已经很亮，纯 additive 会洗成白团；外圈用普通混合保住金币黄，
 * 核心 / 射线 / 碎光再 ADD，才读得像「在发光」而不是淡圆。
 * 整圈缩放会像廉价光圈，只呼吸透明度和碎光。
 */
export function attachCircleGlow(
  parent: PIXI.Container,
  radius: number,
  color = 0xffe08a,
): GlowHandle {
  const layer = new PIXI.Container();
  layer.eventMode = 'none';
  layer.alpha = 0;
  parent.addChildAt(layer, 0);

  const halo = new PIXI.Graphics();
  halo.beginFill(color, 0.32);
  halo.drawCircle(0, 0, radius * 1.62);
  halo.endFill();
  halo.beginFill(color, 0.26);
  halo.drawCircle(0, 0, radius * 1.18);
  halo.endFill();
  layer.addChild(halo);

  const core = new PIXI.Graphics();
  core.blendMode = PIXI.BLEND_MODES.ADD;
  core.beginFill(color, 0.42);
  core.drawCircle(0, 0, radius * 1.08);
  core.endFill();
  core.beginFill(0xfff6c8, 0.5);
  core.drawCircle(0, 0, radius * 0.62);
  core.endFill();
  layer.addChild(core);

  const rays = new PIXI.Graphics();
  rays.blendMode = PIXI.BLEND_MODES.ADD;
  const rayN = 6;
  for (let i = 0; i < rayN; i++) {
    const a = (i / rayN) * Math.PI * 2;
    rays.lineStyle(2.4, 0xfff8e0, 0.62);
    rays.moveTo(Math.cos(a) * radius * 0.28, Math.sin(a) * radius * 0.28);
    rays.lineTo(Math.cos(a) * radius * 1.52, Math.sin(a) * radius * 1.52);
  }
  layer.addChild(rays);

  const ringInner = new PIXI.Graphics();
  ringInner.blendMode = PIXI.BLEND_MODES.ADD;
  ringInner.lineStyle(2, color, 0.7);
  ringInner.drawCircle(0, 0, radius * 0.98);
  layer.addChild(ringInner);

  const ringOuter = new PIXI.Graphics();
  ringOuter.blendMode = PIXI.BLEND_MODES.ADD;
  ringOuter.lineStyle(1.6, 0xfff6c8, 0.45);
  ringOuter.drawCircle(0, 0, radius * 1.28);
  layer.addChild(ringOuter);

  const motes = new PIXI.Container();
  motes.blendMode = PIXI.BLEND_MODES.ADD;
  const moteCount = 8;
  const dots: PIXI.Graphics[] = [];
  for (let i = 0; i < moteCount; i++) {
    const d = new PIXI.Graphics();
    d.beginFill(i % 2 === 0 ? 0xfff8e0 : color, 1);
    d.drawCircle(0, 0, i % 2 === 0 ? 2.2 : 1.45);
    d.endFill();
    motes.addChild(d);
    dots.push(d);
  }
  layer.addChild(motes);

  let active = false;
  const ticker = PIXI.Ticker.shared;
  const step = (): void => {
    if (!isDisplayLive(layer)) {
      ticker.remove(step);
      return;
    }
    if (!active) {
      layer.alpha = 0;
      return;
    }
    const t = ticker.lastTime;
    layer.alpha = 0.88 + Math.sin(t / 320) * 0.12;
    halo.alpha = 0.7 + Math.sin(t / 380) * 0.18;
    core.alpha = 0.75 + Math.sin(t / 280) * 0.2;
    rays.rotation = t / 1600;
    rays.alpha = 0.55 + Math.sin(t / 240) * 0.25;
    ringInner.alpha = 0.5 + Math.sin(t / 260) * 0.22;
    ringOuter.alpha = 0.28 + Math.sin(t / 260 + 1.3) * 0.16;
    ringOuter.scale.set(1 + Math.sin(t / 420) * 0.04);
    motes.rotation = t / 1800;
    dots.forEach((d, i) => {
      const ang = (i / moteCount) * Math.PI * 2;
      const rr = radius * (1.12 + Math.sin(t / 190 + i) * 0.08);
      d.x = Math.cos(ang) * rr;
      d.y = Math.sin(ang) * rr;
      d.alpha = 0.4 + (Math.sin(t / 150 + i * 0.85) * 0.5 + 0.5) * 0.6;
    });
  };
  if (ticker.started) ticker.add(step);
  return {
    setActive(on: boolean) {
      active = on;
      if (!isDisplayLive(layer)) return;
      layer.alpha = on ? 0.92 : 0;
    },
  };
}

/** 几枚魂晶错帧飞向顶栏。枚数跟入账数量走，最多 5，避免扫荡 5 晶排成火车。 */
export function sweepFlyCount(soul: number): number {
  return Math.max(1, Math.min(5, Math.floor(soul)));
}

export async function flySoulBurstTo(
  parent: PIXI.Container,
  from: { x: number; y: number },
  to: { x: number; y: number },
  soul: number,
): Promise<void> {
  const n = sweepFlyCount(soul);
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      awaitDelay(i * 70).then(() =>
        flyTokenTo(parent, 'icon_soul', {
          x: from.x + (i - (n - 1) / 2) * 12,
          y: from.y,
        }, to),
      ),
    ),
  );
}

export async function flyTokenTo(
  parent: PIXI.Container,
  iconKey: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const icon = createUiIcon(iconKey, 22);
  const node = icon ?? (() => {
    const g = new PIXI.Graphics();
    g.beginFill(C.soul, 1);
    g.drawCircle(0, 0, 8);
    g.endFill();
    return g;
  })();
  node.x = from.x;
  node.y = from.y;
  parent.addChild(node);
  const live = (): boolean => isDisplayLive(node) && isDisplayLive(parent);
  await awaitEase(420, (t) => {
    if (!live()) return;
    node.x = from.x + (to.x - from.x) * t;
    node.y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 36;
    node.alpha = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
  }, { live });
  safeDestroy(node);
}

/** 顶栏魂晶花出去：数字从旧值滚到新值，旁边飘一个负数。 */
export async function animateCurrencySpend(pill: CurrencyPill, from: number, to: number): Promise<void> {
  const host = pill as CurrencyPill & { _spendGen?: number };
  const gen = (host._spendGen ?? 0) + 1;
  host._spendGen = gen;
  const live = (): boolean => isDisplayLive(pill) && host._spendGen === gen;

  const spent = from - to;
  if (spent > 0 && pill.parent) {
    const floatTx = makeText(`-${spent}`, 'uiStrong', { fill: 0xffe08a, fontSize: 13 });
    floatTx.x = pill.x + pill.width + 4;
    floatTx.y = pill.y + 4;
    pill.parent.addChild(floatTx);
    const startY = floatTx.y;
    void awaitEase(520, (t) => {
      if (!isDisplayLive(floatTx)) return;
      floatTx.y = startY - 20 * t;
      floatTx.alpha = 1 - t;
    }, { live: () => isDisplayLive(floatTx) }).then(() => safeDestroy(floatTx));
  }

  await awaitEase(420, (t) => {
    if (!live()) return;
    pill.setText(`${Math.round(from + (to - from) * t)}`);
    pill.scale.set(1 + Math.sin(t * Math.PI) * 0.07);
  }, { live });
  if (live()) {
    pill.setText(`${to}`);
    pill.scale.set(1);
  }
}

/** 养成升级那种薄一层：白闪一下就够，不做全屏 */
export function flashPop(parent: PIXI.Container, w: number, h: number): void {
  const g = new PIXI.Graphics();
  g.beginFill(0xfff8e0, 0.55);
  g.drawRoundedRect(0, 0, w, h, 10);
  g.endFill();
  parent.addChild(g);
  const live = (): boolean => isDisplayLive(g);
  void awaitEase(280, (t) => {
    if (live()) g.alpha = 0.55 * (1 - t);
  }, { live }).then(() => safeDestroy(g));
}
