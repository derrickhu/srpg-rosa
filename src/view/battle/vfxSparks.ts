import * as PIXI from 'pixi.js';
import type { SparkSpec } from '@/data/vfxCatalog';
import { isDisplayLive } from '@/view/pixiLive';

/**
 * 叠加混合的火花粒子层。
 *
 * 为什么不把火花画进生图：一个特效只有 6–9 帧，而 AI 每帧是独立画的，细碎粒子在帧间
 * 必然对不上位置，连起来播就是一片沸腾的噪点。火花偏偏靠连续轨迹才成立——它要有速度、
 * 有拖尾、有落下。这类「手感」交给确定性代码是通行做法，生图只负责大形状。
 *
 * 实现上一整簇火花共用**一个** Graphics，每帧 clear 后重画所有点。一簇一个显示对象，
 * 而不是一颗一个：小游戏里 display object 的数量比重画开销贵得多。
 */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: number;
  ageMs: number;
  lifeMs: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * 在 (x, y) 放一簇火花。`dirRad` 只在 spec 带 `coneRad` 时有意义——
 * 定向特效的火花要朝着那一击的方向喷，否则会读成「原地炸了一下」。
 */
export function emitSparks(
  layer: PIXI.Container,
  x: number,
  y: number,
  spec: SparkSpec,
  dirRad = 0,
): void {
  if (layer.destroyed) return;

  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  g.position.set(x, y);
  layer.addChild(g);

  const sparks: Spark[] = [];
  for (let i = 0; i < spec.count; i++) {
    const a = spec.coneRad === undefined
      ? Math.random() * Math.PI * 2
      : dirRad + rand(-spec.coneRad, spec.coneRad);
    const sp = rand(spec.speedMin, spec.speedMax);
    sparks.push({
      x: 0,
      y: 0,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(spec.radiusMin, spec.radiusMax),
      color: spec.colors[Math.floor(Math.random() * spec.colors.length)]!,
      ageMs: 0,
      lifeMs: rand(spec.lifeMinMs, spec.lifeMaxMs),
    });
  }

  const tick = (): void => {
    // 场景可能被整棵拆掉（战斗结束、跳过），ticker 得自己发现并摘掉自己
    if (!isDisplayLive(g)) {
      PIXI.Ticker.shared.remove(tick);
      return;
    }
    const dtMs = PIXI.Ticker.shared.deltaMS;
    const dt = dtMs / 1000;
    g.clear();
    let alive = 0;
    for (const s of sparks) {
      s.ageMs += dtMs;
      if (s.ageMs >= s.lifeMs) continue;
      alive++;
      s.vy += spec.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.ageMs / s.lifeMs;
      // 半径也跟着收：只掉不透明度的话，火花会像一颗恒星那样淡出去，读不出「熄灭」
      g.beginFill(s.color, k * 0.55);
      g.drawCircle(s.x, s.y, s.r * (0.35 + 0.65 * k));
      g.endFill();
    }
    if (alive === 0) {
      PIXI.Ticker.shared.remove(tick);
      g.destroy();
    }
  };
  PIXI.Ticker.shared.add(tick);
}
