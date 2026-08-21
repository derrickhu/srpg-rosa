import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { getAnimTextures, getClip } from '@/view/animSets';
import type { TravelDef } from '@/data/vfxCatalog';
import { emitSparks } from '@/view/battle/vfxSparks';
import { createGrowingBeam, createRibbon, stampGhost } from '@/view/battle/vfxProcedural';

/**
 * 飞行弹体。远程技能的距离感和期待感全靠它——只在目标身上闪一下光，读起来是
 * 「敌人自己爆了」，而不是「我射中了他」。
 *
 * 弹体本身是**抠图素材 + 普通混合**，不是黑底发光图：箭、矛这类实体靠剪影读，
 * 做成一团光反而认不出是什么东西。发光的部分（拖尾、火花）由代码补在它后面。
 * 魔法弹（火球、光弹）是另一回事，那种本身就是光，用 `glowSet` 走 additive 序列帧。
 */

/** 拖尾火花的补发间隔。太密会糊成一条实线，太疏会断成虚线 */
const TRAIL_EMIT_MS = 26;
/** 生图残影间隔。比火花稀，才能看出是火球/光球自己拖出来的 */
const GHOST_EMIT_MS = 32;

export interface ProjectileHandle {
  /** 飞完（或被销毁）后 resolve */
  done: Promise<void>;
}

export interface FlyOptions {
  /** 速度倍率，跟随战斗的 x1/x2；1 表示原速 */
  speedScale?: number;
  /**
   * 途经回调：弹体飞过 `atFraction`（0–1）时触发一次。
   * 贯穿技能靠它让沿线的目标**依次**中招，而不是一起结算——那样穿透就没了。
   */
  waypoints?: { atFraction: number; run: () => void }[];
  /** 飞到目标点（绕圈开始）时触发；伤害数字挂这里，后面几圈只是让人看清蜜蜂 */
  onArrive?: () => void;
}

function projectileSprite(def: TravelDef, sizePx: number): PIXI.Sprite | PIXI.AnimatedSprite | null {
  if (def.glowSet) {
    const textures = getAnimTextures(def.glowSet, def.glowSet);
    const clip = getClip(def.glowSet, def.glowSet);
    if (textures.length === 0) return null;
    const sp = new PIXI.AnimatedSprite(textures);
    sp.blendMode = PIXI.BLEND_MODES.ADD;
    sp.loop = true;
    sp.animationSpeed = (clip?.fps ?? 16) / 60;
    sp.gotoAndPlay(0);
    sp.anchor.set(0.5);
    sp.scale.set(sizePx / (textures[0]!.width || sizePx));
    return sp;
  }
  if (!def.sprite || !AssetManager.isBundleLoaded('fx')) return null;
  const tex = AssetManager.texture('fx', def.sprite);
  if (!tex || tex === PIXI.Texture.WHITE) return null;
  const sp = new PIXI.Sprite(tex);
  // 弹体素材是细长条（箭 128x23），等比缩放，不能按正方形拉
  sp.anchor.set(0.5);
  sp.scale.set(sizePx / tex.width);
  return sp;
}

/**
 * 从 `from` 飞到 `to`。有 `orbitLaps` 时抵达后再绕目标飞几圈。
 * 返回的 promise 在整段播完时 resolve；`onArrive` 在刚到目标时触发（伤害挂这里）。
 */
export function flyProjectile(
  layer: PIXI.Container,
  from: { x: number; y: number },
  to: { x: number; y: number },
  def: TravelDef,
  sizePx: number,
  opts: FlyOptions = {},
): ProjectileHandle {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const speedScale = opts.speedScale ?? 1;
  const minMs = def.minMs ?? 240;
  const approachMs = Math.max(minMs, (dist / def.speedPxPerSec) * 1000) / speedScale;
  const laps = def.orbitLaps ?? 0;
  const radius = Math.max(sizePx * 0.42, 22);
  const orbitMs = laps > 0 ? (Math.max(280, (2 * Math.PI * radius * laps) / Math.max(def.speedPxPerSec * 0.55, 80)) / speedScale) : 0;
  const lingerMs = (def.lingerMs ?? 0) / speedScale;
  const totalMs = approachMs + orbitMs + lingerMs;
  const waypoints = [...(opts.waypoints ?? [])].sort((a, b) => a.atFraction - b.atFraction);

  const sprite = projectileSprite(def, sizePx);
  if (!sprite) {
    return {
      done: new Promise<void>((res) => {
        setTimeout(() => {
          opts.onArrive?.();
          res();
        }, totalMs);
      }),
    };
  }

  const aim = Math.atan2(to.y - from.y, to.x - from.x);
  const entryAngle = aim + Math.PI; // 从施法者方向入轨，圈才接得上直线
  if (!def.noRotate) sprite.rotation = aim;
  sprite.position.set(from.x, from.y);
  layer.addChild(sprite);

  const ribbon = def.ribbon ? createRibbon(layer, def.ribbon) : null;
  ribbon?.push(from.x, from.y);
  const beamPath = def.path ? createGrowingBeam(layer, from, def.path) : null;
  let jagSeed = 1;

  let beam: PIXI.AnimatedSprite | null = null;
  if (def.beamSet) {
    const textures = getAnimTextures(def.beamSet, def.beamSet);
    if (textures.length > 0) {
      beam = new PIXI.AnimatedSprite(textures);
      beam.blendMode = PIXI.BLEND_MODES.ADD;
      beam.anchor.set(0, 0.5);
      beam.rotation = aim;
      beam.position.set(from.x, from.y);
      beam.loop = false;
      beam.animationSpeed = (getClip(def.beamSet, def.beamSet)?.fps ?? 16) / 60;
      beam.gotoAndPlay(0);
      layer.addChildAt(beam, layer.getChildIndex(sprite));
    }
  }

  return {
    done: new Promise<void>((resolve) => {
      let elapsed = 0;
      let sinceTrail = 0;
      let sinceGhost = GHOST_EMIT_MS;
      let nextWp = 0;
      let arrived = false;
      const nativeW = (beam?.textures[0] as PIXI.Texture | undefined)?.width ?? 1;

      const finish = (): void => {
        PIXI.Ticker.shared.remove(tick);
        if (!arrived) {
          arrived = true;
          opts.onArrive?.();
        }
        for (; nextWp < waypoints.length; nextWp++) waypoints[nextWp]!.run();
        void ribbon?.persist();
        void beamPath?.persist();
        if (!sprite.destroyed) {
          layer.removeChild(sprite);
          sprite.destroy();
        }
        if (beam && !beam.destroyed) {
          layer.removeChild(beam);
          beam.destroy();
        }
        resolve();
      };

      const tick = (): void => {
        if (sprite.destroyed || layer.destroyed) {
          PIXI.Ticker.shared.remove(tick);
          ribbon?.destroy();
          beamPath?.destroy();
          resolve();
          return;
        }
        elapsed += PIXI.Ticker.shared.deltaMS;
        const inApproach = elapsed <= approachMs;
        let x: number;
        let y: number;
        let heading = aim;

        if (inApproach || laps <= 0) {
          const k = Math.min(1, elapsed / approachMs);
          const entryX = to.x + Math.cos(entryAngle) * radius;
          const entryY = to.y + Math.sin(entryAngle) * radius;
          const destX = laps > 0 ? entryX : to.x;
          const destY = laps > 0 ? entryY : to.y;
          x = from.x + (destX - from.x) * k;
          y = from.y + (destY - from.y) * k;
          heading = Math.atan2(destY - from.y, destX - from.x);
          if (k >= 1 && !arrived) {
            arrived = true;
            opts.onArrive?.();
          }
        } else {
          const t = Math.min(1, (elapsed - approachMs) / Math.max(orbitMs, 1));
          const ang = entryAngle + t * laps * Math.PI * 2;
          const rad = radius * (1 - 0.18 * t);
          x = to.x + Math.cos(ang) * rad;
          y = to.y + Math.sin(ang) * rad;
          heading = ang + Math.PI / 2;
          sprite.alpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
        }

        sprite.position.set(x, y);
        if (laps > 0 || !def.noRotate) sprite.rotation = heading;
        if (elapsed > approachMs + orbitMs && lingerMs > 0) {
          const fade = 1 - (elapsed - approachMs - orbitMs) / lingerMs;
          sprite.alpha = Math.max(0, fade);
        }
        if (beam && !beam.destroyed) {
          beam.scale.set((Math.hypot(x - from.x, y - from.y) || 1) / nativeW, sizePx / nativeW);
        }
        ribbon?.push(x, y);
        if (beamPath) {
          if (def.path?.style === 'jagged') jagSeed += 1;
          beamPath.update({ x, y }, jagSeed);
        }

        const pathK = Math.min(1, elapsed / Math.max(approachMs, 1));
        while (nextWp < waypoints.length && pathK >= waypoints[nextWp]!.atFraction) {
          waypoints[nextWp]!.run();
          nextWp++;
        }

        sinceGhost += PIXI.Ticker.shared.deltaMS;
        if (sinceGhost >= GHOST_EMIT_MS) {
          sinceGhost = 0;
          const ghostTex = sprite.texture;
          const ghostSize = Math.max(sprite.width, sprite.height);
          const add = sprite.blendMode === PIXI.BLEND_MODES.ADD;
          stampGhost(layer, ghostTex, x, y, sprite.rotation, ghostSize, {
            lifeMs: 220,
            alpha: add ? 0.38 : 0.32,
            add,
          });
        }

        if (def.trail) {
          sinceTrail += PIXI.Ticker.shared.deltaMS;
          if (sinceTrail >= TRAIL_EMIT_MS) {
            sinceTrail = 0;
            emitSparks(layer, x, y, def.trail, heading + Math.PI);
          }
        }

        if (elapsed >= totalMs) finish();
      };
      PIXI.Ticker.shared.add(tick);
    }),
  };
}
