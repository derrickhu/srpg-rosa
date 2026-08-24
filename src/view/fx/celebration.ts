import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { makeText } from '@/theme/typography';
import { isDisplayLive, safeDestroy } from '@/view/pixiLive';
import { C } from '@/view/mvpTheme';
import { createUiIcon } from '@/view/renderHelpers';
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
