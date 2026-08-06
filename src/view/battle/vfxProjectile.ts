import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { getAnimTextures, getClip } from '@/view/animSets';
import type { TravelDef } from '@/data/vfxCatalog';
import { emitSparks } from '@/view/battle/vfxSparks';

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
 * 从 `from` 飞到 `to`。返回的 promise 在抵达时 resolve，调用方据此把伤害数字、
 * 震屏、命中特效排到抵达之后——这一点是「射中了」和「同时发生」的全部区别。
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
  const durMs = Math.max(60, (dist / def.speedPxPerSec) * 1000) / speedScale;
  const waypoints = [...(opts.waypoints ?? [])].sort((a, b) => a.atFraction - b.atFraction);

  const sprite = projectileSprite(def, sizePx);
  if (!sprite) {
    // 弹体素材缺失（图集/bundle 没就绪）时不要静默变成瞬间命中：仍然等同样的时间，
    // 节奏保持一致，只是看不见箭
    return { done: new Promise<void>((res) => setTimeout(res, durMs)) };
  }

  const aim = Math.atan2(to.y - from.y, to.x - from.x);
  sprite.rotation = aim;
  sprite.position.set(from.x, from.y);
  layer.addChild(sprite);

  // 拖尾光束：从起点拉到弹体当前位置，边飞边长
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
      let nextWp = 0;
      const nativeW = (beam?.textures[0] as PIXI.Texture | undefined)?.width ?? 1;

      const tick = (): void => {
        if (sprite.destroyed || layer.destroyed) {
          PIXI.Ticker.shared.remove(tick);
          resolve();
          return;
        }
        elapsed += PIXI.Ticker.shared.deltaMS;
        const k = Math.min(1, elapsed / durMs);
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k;
        sprite.position.set(x, y);
        if (beam && !beam.destroyed) {
          beam.scale.set((Math.hypot(x - from.x, y - from.y) || 1) / nativeW, sizePx / nativeW);
        }

        while (nextWp < waypoints.length && k >= waypoints[nextWp]!.atFraction) {
          waypoints[nextWp]!.run();
          nextWp++;
        }

        if (def.trail) {
          sinceTrail += PIXI.Ticker.shared.deltaMS;
          if (sinceTrail >= TRAIL_EMIT_MS) {
            sinceTrail = 0;
            emitSparks(layer, x, y, def.trail, aim + Math.PI);
          }
        }

        if (k >= 1) {
          PIXI.Ticker.shared.remove(tick);
          // 剩下的 waypoint 一定要补掉，否则贴脸命中（durMs 只有一两帧）时
          // 沿线的目标会一个都不结算
          for (; nextWp < waypoints.length; nextWp++) waypoints[nextWp]!.run();
          layer.removeChild(sprite);
          sprite.destroy();
          if (beam && !beam.destroyed) {
            layer.removeChild(beam);
            beam.destroy();
          }
          resolve();
        }
      };
      PIXI.Ticker.shared.add(tick);
    }),
  };
}
