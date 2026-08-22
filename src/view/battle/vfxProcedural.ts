import * as PIXI from 'pixi.js';
import type {
  HitBurstSpec,
  PathBeamSpec,
  RibbonSpec,
  SlashSweepSpec,
  WindupSpec,
} from '@/data/vfxCatalog';
import { attachCorePass } from '@/view/vfxBlend';
import { AssetManager } from '@/core/AssetManager';
import { getAnimBlend, getAnimTextures, getClip } from '@/view/animSets';
import { playFxAnimation } from '@/view/AnimatedUnit';
import { isDisplayLive } from '@/view/pixiLive';

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
      if (!isDisplayLive(layer)) {
        PIXI.Ticker.shared.remove(tick);
        resolve();
        return;
      }
      elapsed += PIXI.Ticker.shared.deltaMS;
      const k = Math.min(1, elapsed / Math.max(durationMs, 1));
      try {
        step(k, PIXI.Ticker.shared.deltaMS);
      } catch {
        PIXI.Ticker.shared.remove(tick);
        resolve();
        return;
      }
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
  const startA = opts.alpha ?? 0.32;
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
  strokePolyline(g, pts, width * 2.2, glow, 0.1 * alpha);
  strokePolyline(g, pts, width * 1.15, color, 0.42 * alpha);
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
  // 两层：本体走**普通混合**，高光走 additive。
  // 原先整条光带都是 additive，于是它在亮草地上（RGB 202,225,54，绿通道已经 225/255）
  // 只能把像素往白推——不管配的是橙、青还是银，屏幕上都是同一条苍白的黄痕，
  // 既看不出颜色也看不出长度。本体改普通混合之后，橙就真的是橙，拖尾才「拖」得出来。
  const gBody = new PIXI.Graphics();
  const gCore = new PIXI.Graphics();
  gCore.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(gBody);
  layer.addChild(gCore);
  const dead = (): boolean => gBody.destroyed || gCore.destroyed;

  const points: Array<Pt & { t: number }> = [];
  let now = 0;
  let closed = false;

  const redraw = (): void => {
    if (dead()) return;
    gBody.clear();
    gCore.clear();
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
      // 本体：宽、实、有颜色，负责「看得见一条拖尾」
      gBody.lineStyle(w, spec.color, 0.68 * fade);
      gBody.moveTo(a.x, a.y);
      gBody.lineTo(b.x, b.y);
      // 高光：只在中线上细细一条，负责「这是光不是漆」
      gCore.lineStyle(w * 0.42, spec.glowColor ?? 0xffffff, 0.5 * fade);
      gCore.moveTo(a.x, a.y);
      gCore.lineTo(b.x, b.y);
    }
  };

  const cleanup = (): void => {
    for (const g of [gBody, gCore]) {
      if (!g.destroyed) {
        layer.removeChild(g);
        g.destroy();
      }
    }
  };

  const tick = (): void => {
    if (!isDisplayLive(gBody) || !isDisplayLive(gCore) || !isDisplayLive(layer)) {
      PIXI.Ticker.shared.remove(tick);
      return;
    }
    now += PIXI.Ticker.shared.deltaMS;
    if (closed && points.length < 2) {
      PIXI.Ticker.shared.remove(tick);
      cleanup();
      return;
    }
    redraw();
  };
  PIXI.Ticker.shared.add(tick);

  return {
    push(x, y) {
      if (closed || dead()) return;
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
      cleanup();
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

/**
 * 整段动画里「画上去的那块」在源帧坐标系里的并集包围盒。
 *
 * 图集帧是裁剪过的：`texture.width/height` 返回的是**未裁剪的源帧**尺寸（各集合一律
 * 256x256），而实体只占其中一小块——`thrust` 的楔形是 213x74，只有源帧的 8%。
 * 从前 `playPathBeam` 按源帧定尺，于是 `widthPx` 有七成花在上下的空白上：请求 13px
 * 最后只剩 3.8px 的实体，光路成了发丝；长度同理只铺到路径的 83%，够不到目标。
 * 骑兵吃亏最大，因为它那两招的光路用的是**楔形**，厚度就是它全部的信息量。
 *
 * 取并集而不是逐帧取各自的框，是为了缩放系数只算一次：逐帧算的话，帧与帧之间
 * 实体大小本来就有变化，跟着变缩放等于把这个变化抵消掉，光束会在原地一鼓一缩。
 */
function inkBox(textures: readonly PIXI.Texture[]): {
  x: number;
  w: number;
  h: number;
  cy: number;
  origW: number;
  origH: number;
} {
  const origW = textures[0]!.orig.width || 1;
  const origH = textures[0]!.orig.height || 1;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const t of textures) {
    // 没裁剪过的帧没有 trim，实体就是整个源帧
    const tx = t.trim?.x ?? 0;
    const ty = t.trim?.y ?? 0;
    const tw = t.trim?.width ?? t.orig.width;
    const th = t.trim?.height ?? t.orig.height;
    x0 = Math.min(x0, tx);
    x1 = Math.max(x1, tx + tw);
    y0 = Math.min(y0, ty);
    y1 = Math.max(y1, ty + th);
  }
  if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) {
    return { x: 0, w: origW, h: origH, cy: origH / 2, origW, origH };
  }
  return { x: x0, w: x1 - x0, h: y1 - y0, cy: (y0 + y1) / 2, origW, origH };
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
    const aim = Math.atan2(to.y - from.y, to.x - from.x);
    const len = Math.max(8, Math.hypot(to.x - from.x, to.y - from.y));
    const ink = inkBox(textures);
    sp.rotation = aim;
    sp.position.set(from.x, from.y);
    // 按**画上去的那块**定尺，不是按源帧。锚点是 orig 空间的归一化坐标，
    // 所以把它挪到实体的左边缘和纵向中心，光束就正好从施法者铺到目标、并压在连线上。
    sp.anchor.set(ink.x / ink.origW, ink.cy / ink.origH);
    sp.scale.set(len / ink.w, spec.widthPx / ink.h);
    const clip = getClip(spec.set!, spec.set!);
    sp.loop = false;
    sp.animationSpeed = (clip?.fps ?? 16) / 60;
    const isAdd = getAnimBlend(spec.set!) === 'add';
    if (isAdd) attachCorePass(sp, textures);
    const base = sp.alpha;
    sp.gotoAndPlay(0);
    layer.addChild(sp);
    return tickUntil(layer, spec.persistMs, (k) => {
      if (sp.destroyed) return;
      sp.alpha = base * (1 - easeOutQuad(k));
    }).then(() => {
      if (!sp.destroyed) {
        layer.removeChild(sp);
        sp.destroy({ children: true });
      }
    });
  }
  const beam = createGrowingBeam(layer, from, spec);
  beam.update(to, 3);
  return beam.persist();
}

/**
 * 近战挥击。
 *
 * 有 `set` 时播一次**逐帧**刀影动画，朝目标方向摆；没有就退回几何弧。
 *
 * 原先无论如何都是「沿弧线一路钉贴图」：`sprite` 给一张剑的抠图，每隔一点角度钉一次、
 * 每次多转一点。屏幕上的结果是一把带护手和握柄的剑绕着角色打转——单张静态图沿路径
 * 平移永远做不出挥砍，因为挥砍的信息量在**刀身角度的变化**里，而那正是单图运动
 * 丢掉的东西。改成播逐帧动画之后，「刀扫到哪、刃弧长到多少」由美术逐帧给定。
 *
 * 几何弧留着当兜底：没有对应图集时（比如敌人复用配方但图集没进优先段）
 * 至少还能看见一道弧，不会变成完全没有挥击。
 */
export function playSlashSweep(
  layer: PIXI.Container,
  from: Pt,
  to: Pt,
  spec: SlashSweepSpec,
  cellPx: number,
): Promise<void> {
  if (layer.destroyed) return Promise.resolve();
  const aim = Math.atan2(to.y - from.y, to.x - from.x);
  const radius = spec.radiusCells * cellPx;
  const frames = spec.set ? getAnimTextures(spec.set, spec.set) : [];

  if (frames.length > 0) {
    // 挥砍从施法者身上往目标方向甩出去，所以锚点压在两者之间偏施法者一侧，
    // 而不是正中——正中会让刀影看着像从目标身上长出来的
    const cx = from.x + Math.cos(aim) * radius * 0.45;
    const cy = from.y + Math.sin(aim) * radius * 0.45;
    // 把整套帧压进 durationMs 播完：挥击时长归配方管（普攻 300ms、重劈更慢），
    // 图集的 fps 只是它自己的原速
    const fps = getClip(spec.set!, spec.set!)?.fps || 16;
    const speed = (frames.length * 1000) / (fps * Math.max(spec.durationMs, 1));
    const ms = playFxAnimation(layer, cx, cy, spec.set!, spec.set!, radius * 2.1, {
      rotation: aim,
      playbackSpeed: speed,
    });
    return tickUntil(layer, Math.max(ms, spec.durationMs), () => {});
  }

  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(g);
  const start = aim - spec.arcRad * 0.55;

  const drawArc = (endAng: number, alpha: number): void => {
    const steps = 14;
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = lerp(start, endAng, i / steps);
      pts.push({ x: from.x + Math.cos(a) * radius, y: from.y + Math.sin(a) * radius });
    }
    strokePolyline(g, pts, spec.thicknessPx * 2.0, spec.glowColor ?? spec.color, 0.12 * alpha * 0.7);
    strokePolyline(g, pts, spec.thicknessPx, spec.color, 0.5 * alpha * 0.7);
  };

  return tickUntil(layer, spec.durationMs, (k) => {
    if (g.destroyed) return;
    g.clear();
    drawArc(lerp(start, start + spec.arcRad, easeOutCubic(k)), 1 - k * 0.15);
  }).then(() => {
    if (!g.destroyed) {
      layer.removeChild(g);
      g.destroy();
    }
  });
}

/**
 * 蓄力前摇：能量向内收束，末尾攒成一个亮核。
 *
 * 这一段是「节奏太快、没有打击感」的解药，而且它必须是**代码**而不是生图：
 * 打击感来自「期待 → 释放」这个落差，落差的大小是时间差，不是贴图。
 * 之前每一招都是零前摇——技能名刚飘出来，爆炸已经结束了，玩家的眼睛
 * 根本没来得及移到那一格。
 *
 * 两种收束方式对应两类招式：
 * - `implode` 360° 向内收，给自身 AoE（旋风斩、炎环、践踏）：气在身上聚，然后炸开。
 * - `gather`  朝出手方向聚成一点，给弹道和单体重击：能量攒在手上/枪尖，然后送出去。
 */
export function playWindup(
  layer: PIXI.Container,
  at: Pt,
  spec: WindupSpec,
  cellPx: number,
  aimRad: number,
): Promise<void> {
  if (layer.destroyed) return Promise.resolve();
  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(g);

  const gather = spec.style === 'gather';
  const shards = Math.max(3, spec.shards ?? (gather ? 5 : 8));
  const startR = spec.fromCells * cellPx;
  const glow = spec.glowColor ?? spec.color;
  // gather 收到手前方一点，而不是脚底心：能量攒在身体外侧才像是「要送出去的东西」
  const focus = gather
    ? { x: at.x + Math.cos(aimRad) * cellPx * 0.34, y: at.y + Math.sin(aimRad) * cellPx * 0.34 }
    : at;
  // 每片各有起始角和自转速度，收束才不是一个规整的收缩圆
  const baseAng: number[] = [];
  const spin: number[] = [];
  for (let i = 0; i < shards; i++) {
    const spread = gather ? 1.5 : Math.PI * 2;
    const center = gather ? aimRad + Math.PI : 0;
    baseAng.push(center + spread * (i / shards - 0.5) * (gather ? 1 : 2));
    spin.push((i % 2 === 0 ? 1 : -1) * (0.7 + (i % 3) * 0.25));
  }

  return tickUntil(layer, spec.durationMs, (k) => {
    if (g.destroyed) return;
    g.clear();
    // 三次收束曲线：前半段慢慢往里飘，最后一小段猛地吸进去。
    // 线性收束读起来是「均速缩小的圆」，没有「攒住了」的那一下。
    const pull = k * k * k;
    const r = startR * (1 - pull);
    const appear = Math.min(1, k / 0.18);

    for (let i = 0; i < shards; i++) {
      const ang = baseAng[i]! + spin[i]! * k * 1.6;
      const dashLen = cellPx * 0.3 * (0.35 + 0.65 * (1 - k));
      const x0 = focus.x + Math.cos(ang) * (r + dashLen);
      const y0 = focus.y + Math.sin(ang) * (r + dashLen);
      const x1 = focus.x + Math.cos(ang) * r;
      const y1 = focus.y + Math.sin(ang) * r;
      g.lineStyle(Math.max(2.4, cellPx * 0.055), glow, 0.14 * appear);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineStyle(Math.max(1.1, cellPx * 0.024), spec.color, 0.62 * appear);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }

    // 亮核：跟着收束长大，最后一帧最亮，正好交给爆炸接上去
    const coreR = cellPx * 0.055 + cellPx * 0.115 * (k * k);
    g.beginFill(glow, 0.1 * appear);
    g.drawCircle(focus.x, focus.y, coreR * 2.3);
    g.endFill();
    g.beginFill(spec.color, 0.5 * appear * (0.35 + 0.65 * k));
    g.drawCircle(focus.x, focus.y, coreR);
    g.endFill();
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

    g.beginFill(spec.color, 0.35 * a);
    g.drawCircle(0, 0, size * 0.1 * (1.05 - k * 0.35));
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
      g.lineStyle(Math.max(2, size * 0.04) * (1 - k * 0.55), spec.color, 0.42 * a);
      g.drawCircle(0, 0, r);
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
