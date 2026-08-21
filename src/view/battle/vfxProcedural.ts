import * as PIXI from 'pixi.js';
import type {
  HitBurstSpec,
  PathBeamSpec,
  RibbonSpec,
  SlashSweepSpec,
} from '@/data/vfxCatalog';
import { getAnimBlend, getAnimTextures, getClip } from '@/view/animSets';

/**
 * 程序特效：路径、扫斩、命中爆裂。
 *
 * 业界 2D 技能特效很少只播一张序列帧。常见拆法是：
 * - 弹体身后一条会淡出的光带（Godot Line2D / Pixi 折线，见 revolt-fx、Line2D trail）
 * - 施法者到落点的能量路径（平滑光带或折线闪电）
 * - 近战一记扫过去的月牙弧，而不是在目标身上盖章
 * - 命中时的星爆 + 扩散环，告诉玩家「打中了」
 *
 * 序列帧只负责大形状；路径长度、扫过角度、命中尺寸都是运行时变量，必须用代码画。
 */

interface Pt {
  x: number;
  y: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function tickUntil(
  layer: PIXI.Container,
  durationMs: number,
  step: (k: number, dtMs: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = (): void => {
      if (layer.destroyed) {
        PIXI.Ticker.shared.remove(tick);
        resolve();
        return;
      }
      elapsed += PIXI.Ticker.shared.deltaMS;
      const k = Math.min(1, elapsed / Math.max(durationMs, 1));
      step(k, PIXI.Ticker.shared.deltaMS);
      if (k >= 1) {
        PIXI.Ticker.shared.remove(tick);
        resolve();
      }
    };
    PIXI.Ticker.shared.add(tick);
  });
}

/** 折线闪电：两端贴路径，中间按法线抖开。`seed` 固定时路径可复现。 */
export function buildJaggedPath(
  from: Pt,
  to: Pt,
  segments: number,
  amp: number,
  seed = 1,
): Pt[] {
  const segs = Math.max(2, Math.floor(segments));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Pt[] = [{ x: from.x, y: from.y }];
  let s = seed * 1103515245 + 12345;
  for (let i = 1; i < segs; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const t = i / segs;
    const envelope = Math.sin(t * Math.PI);
    const unit = ((s % 2000) / 1000) - 1;
    const off = unit * amp * envelope;
    pts.push({
      x: from.x + dx * t + nx * off,
      y: from.y + dy * t + ny * off,
    });
  }
  pts.push({ x: to.x, y: to.y });
  return pts;
}

/** 把一张生图帧钉在路径上，淡出。轨迹/扫斩的「性格」来自这张图，不是几何线。 */
export function stampGhost(
  layer: PIXI.Container,
  tex: PIXI.Texture,
  x: number,
  y: number,
  rotation: number,
  sizePx: number,
  opts: { lifeMs?: number; alpha?: number; add?: boolean } = {},
): void {
  if (layer.destroyed || !tex || tex === PIXI.Texture.EMPTY) return;
  const sp = new PIXI.Sprite(tex);
  if (opts.add !== false) sp.blendMode = PIXI.BLEND_MODES.ADD;
  sp.anchor.set(0.5);
  sp.position.set(x, y);
  sp.rotation = rotation;
  const native = tex.width || sizePx;
  sp.scale.set(sizePx / native);
  const startA = opts.alpha ?? 0.55;
  sp.alpha = startA;
  layer.addChild(sp);
  const lifeMs = opts.lifeMs ?? 240;
  void tickUntil(layer, lifeMs, (k) => {
    if (sp.destroyed) return;
    sp.alpha = startA * (1 - k);
    const s = (sizePx / native) * (1 + 0.12 * k);
    sp.scale.set(s);
  }).then(() => {
    if (!sp.destroyed) {
      layer.removeChild(sp);
      sp.destroy();
    }
  });
}

function strokePolyline(
  g: PIXI.Graphics,
  pts: readonly Pt[],
  width: number,
  color: number,
  alpha: number,
): void {
  if (pts.length < 2 || alpha <= 0 || width <= 0) return;
  g.lineStyle(width, color, alpha);
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
}

function drawGlowPath(
  g: PIXI.Graphics,
  pts: readonly Pt[],
  width: number,
  color: number,
  glow: number,
  alpha: number,
): void {
  if (pts.length < 2) return;
  g.clear();
  strokePolyline(g, pts, width * 2.6, glow, 0.18 * alpha);
  strokePolyline(g, pts, width * 1.45, color, 0.55 * alpha);
  strokePolyline(g, pts, width * 0.42, 0xffffff, 0.92 * alpha);
}

export interface RibbonHandle {
  push(x: number, y: number): void;
  /** 弹体已到，光带再留一会儿再淡出 */
  persist(extraMs?: number): Promise<void>;
  destroy(): void;
}

/**
 * 跟着弹体取样的淡出光带。点留在世界坐标里，宽度从头到尾收成尖。
 * 对标 Godot Line2D trail：父节点位移不影响已经落下的点。
 */
export function createRibbon(layer: PIXI.Container, spec: RibbonSpec): RibbonHandle {
  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(g);

  const points: Array<Pt & { t: number }> = [];
  let now = 0;
  let closed = false;

  const redraw = (): void => {
    if (g.destroyed) return;
    g.clear();
    const alive = points.filter((p) => now - p.t <= spec.tailMs);
    points.length = 0;
    points.push(...alive);
    if (points.length < 2) return;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const age = now - a.t;
      const fade = 1 - age / spec.tailMs;
      if (fade <= 0) continue;
      const along = i / (points.length - 1);
      const w = spec.widthPx * (0.18 + 0.82 * along) * fade;
      const glow = spec.glowColor ?? 0xffffff;
      g.lineStyle(w * 2.4, glow, 0.16 * fade);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineStyle(w, spec.color, 0.72 * fade);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineStyle(w * 0.32, 0xffffff, 0.95 * fade);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
  };

  const tick = (): void => {
    if (g.destroyed || layer.destroyed) {
      PIXI.Ticker.shared.remove(tick);
      return;
    }
    now += PIXI.Ticker.shared.deltaMS;
    if (closed && points.length < 2) {
      PIXI.Ticker.shared.remove(tick);
      if (!g.destroyed) {
        layer.removeChild(g);
        g.destroy();
      }
      return;
    }
    redraw();
  };
  PIXI.Ticker.shared.add(tick);

  return {
    push(x, y) {
      if (closed || g.destroyed) return;
      const last = points[points.length - 1];
      if (last && Math.hypot(x - last.x, y - last.y) < 2.2) return;
      points.push({ x, y, t: now });
    },
    persist(extraMs = spec.fadeMs) {
      closed = true;
      return tickUntil(layer, extraMs, () => {});
    },
    destroy() {
      closed = true;
      PIXI.Ticker.shared.remove(tick);
      if (!g.destroyed) {
        layer.removeChild(g);
        g.destroy();
      }
    },
  };
}

export interface GrowingBeamHandle {
  update(to: Pt, seed?: number): void;
  persist(): Promise<void>;
  destroy(): void;
}

/** 从施法者拉到当前弹体位置的能量路径，抵达后再滞留淡出。 */
export function createGrowingBeam(
  layer: PIXI.Container,
  from: Pt,
  spec: PathBeamSpec,
): GrowingBeamHandle {
  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(g);
  let seed = 1;
  let lastTo = { ...from };
  let alpha = 1;

  const paint = (to: Pt, a: number): void => {
    if (g.destroyed) return;
    const pts = spec.style === 'jagged'
      ? buildJaggedPath(from, to, spec.segments ?? 7, spec.jagAmp ?? 10, seed)
      : [from, to];
    drawGlowPath(g, pts, spec.widthPx, spec.color, spec.glowColor ?? 0xffffff, a);
  };

  return {
    update(to, nextSeed) {
      lastTo = to;
      if (nextSeed !== undefined) seed = nextSeed;
      paint(to, alpha);
    },
    persist() {
      return tickUntil(layer, spec.persistMs, (k) => {
        alpha = 1 - easeOutQuad(k);
        if (spec.style === 'jagged') seed += 1;
        paint(lastTo, alpha);
      }).then(() => {
        if (!g.destroyed) {
          layer.removeChild(g);
          g.destroy();
        }
      });
    },
    destroy() {
      if (!g.destroyed) {
        layer.removeChild(g);
        g.destroy();
      }
    },
  };
}

/** 瞬间铺满整条路径再淡出。治疗、突刺这类「没有弹体但要看见连线」用它。 */
export function playPathBeam(
  layer: PIXI.Container,
  from: Pt,
  to: Pt,
  spec: PathBeamSpec,
): Promise<void> {
  if (layer.destroyed) return Promise.resolve();
  const textures = spec.set ? getAnimTextures(spec.set, spec.set) : [];
  if (textures.length > 0) {
    const sp = new PIXI.AnimatedSprite(textures);
    if (getAnimBlend(spec.set!) === 'add') sp.blendMode = PIXI.BLEND_MODES.ADD;
    sp.anchor.set(0, 0.5);
    const aim = Math.atan2(to.y - from.y, to.x - from.x);
    const len = Math.max(8, Math.hypot(to.x - from.x, to.y - from.y));
    const native = textures[0]!.width || spec.widthPx;
    sp.rotation = aim;
    sp.position.set(from.x, from.y);
    sp.scale.set(len / native, spec.widthPx / Math.max(textures[0]!.height || spec.widthPx, 1));
    const clip = getClip(spec.set!, spec.set!);
    sp.loop = false;
    sp.animationSpeed = (clip?.fps ?? 16) / 60;
    sp.gotoAndPlay(0);
    layer.addChild(sp);
    return tickUntil(layer, spec.persistMs, (k) => {
      if (sp.destroyed) return;
      sp.alpha = 1 - easeOutQuad(k);
    }).then(() => {
      if (!sp.destroyed) {
        layer.removeChild(sp);
        sp.destroy();
      }
    });
  }
  const beam = createGrowingBeam(layer, from, spec);
  beam.update(to, 3);
  return beam.persist();
}

/** 近战月牙弧：用生图斩击帧扫过去，几何弧只垫一层很淡的光。 */
export function playSlashSweep(
  layer: PIXI.Container,
  from: Pt,
  to: Pt,
  spec: SlashSweepSpec,
  cellPx: number,
): Promise<void> {
  if (layer.destroyed) return Promise.resolve();
  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(g);

  const aim = Math.atan2(to.y - from.y, to.x - from.x);
  const radius = spec.radiusCells * cellPx;
  const start = aim - spec.arcRad * 0.55;
  const frames = spec.set ? getAnimTextures(spec.set, spec.set) : [];
  const useArt = frames.length > 0;
  let lastStamp = -99;
  const stampSize = radius * 0.95;

  const drawArc = (endAng: number, alpha: number, widthScale: number): void => {
    const steps = 14;
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = lerp(start, endAng, i / steps);
      pts.push({
        x: from.x + Math.cos(a) * radius,
        y: from.y + Math.sin(a) * radius,
      });
    }
    const aScale = useArt ? 0.18 : 1;
    strokePolyline(g, pts, spec.thicknessPx * 2.2 * widthScale, spec.glowColor ?? 0xffffff, 0.2 * alpha * aScale);
    strokePolyline(g, pts, spec.thicknessPx * widthScale, spec.color, 0.75 * alpha * aScale);
    strokePolyline(g, pts, spec.thicknessPx * 0.35 * widthScale, 0xffffff, 0.95 * alpha * aScale);
  };

  return tickUntil(layer, spec.durationMs, (k) => {
    if (g.destroyed) return;
    g.clear();
    const ang = lerp(start, start + spec.arcRad, easeOutCubic(k));
    const x = from.x + Math.cos(ang) * radius;
    const y = from.y + Math.sin(ang) * radius;
    if (useArt && ang - lastStamp > 0.22) {
      lastStamp = ang;
      const tex = frames[Math.min(frames.length - 1, Math.floor(k * frames.length))]!;
      stampGhost(layer, tex, x, y, ang, stampSize, { lifeMs: 220, alpha: 0.7 });
    }
    drawArc(ang, 1 - k * 0.15, 1);
  }).then(() => {
    if (!g.destroyed) {
      layer.removeChild(g);
      g.destroy();
    }
  });
}

/** 命中星爆：白热核 + 放射线 + 扩散环。和序列帧叠在一起当「打中了」的句号。 */
export function playHitBurst(
  layer: PIXI.Container,
  at: Pt,
  spec: HitBurstSpec,
  cellPx: number,
): void {
  if (layer.destroyed) return;
  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  g.position.set(at.x, at.y);
  layer.addChild(g);
  const size = spec.sizeCells * cellPx;
  const rays = spec.rays;
  const rayAng: number[] = [];
  const rayLen: number[] = [];
  for (let i = 0; i < rays; i++) {
    rayAng.push((Math.PI * 2 * i) / rays + (i % 2) * 0.11);
    rayLen.push(0.55 + (i % 3) * 0.18);
  }

  void tickUntil(layer, spec.durationMs, (k) => {
    if (g.destroyed) return;
    g.clear();
    const appear = k < 0.22 ? k / 0.22 : 1;
    const fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
    const a = appear * fade;

    g.beginFill(0xffffff, 0.95 * a);
    g.drawCircle(0, 0, size * 0.08 * (1.15 - k * 0.6));
    g.endFill();
    g.beginFill(spec.color, 0.45 * a);
    g.drawCircle(0, 0, size * 0.16 * (1.05 - k * 0.35));
    g.endFill();

    for (let i = 0; i < rays; i++) {
      const ang = rayAng[i]!;
      const len = size * rayLen[i]! * (0.35 + 0.65 * easeOutCubic(Math.min(1, k / 0.45)));
      const inner = len * 0.22;
      const x0 = Math.cos(ang) * inner;
      const y0 = Math.sin(ang) * inner;
      const x1 = Math.cos(ang) * len;
      const y1 = Math.sin(ang) * len;
      g.lineStyle(Math.max(1.4, size * 0.035), spec.glowColor ?? 0xffffff, 0.28 * a);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineStyle(Math.max(0.8, size * 0.016), spec.color, 0.85 * a);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }

    if (spec.ring) {
      const r = size * (0.18 + 0.82 * easeOutCubic(k));
      g.lineStyle(Math.max(2, size * 0.045) * (1 - k * 0.55), spec.color, 0.7 * a);
      g.drawCircle(0, 0, r);
      g.lineStyle(Math.max(1, size * 0.018), 0xffffff, 0.55 * a);
      g.drawCircle(0, 0, r * 0.92);
    }
  }).then(() => {
    if (!g.destroyed) {
      layer.removeChild(g);
      g.destroy();
    }
  });
}

/** 施法原点闪光：比命中小一号的放射线，标出「东西是从这里出去的」。 */
export function playCastBurst(
  layer: PIXI.Container,
  at: Pt,
  spec: HitBurstSpec,
  cellPx: number,
): void {
  playHitBurst(layer, at, spec, cellPx);
}
