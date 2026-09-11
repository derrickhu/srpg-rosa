import * as PIXI from 'pixi.js';
import { isDisplayLive } from '@/view/pixiLive';

/**
 * 受击手感（业内 2D 战棋 / 动作游戏的最小有效组合）：
 *
 * 1. **闪白** — 把受击精灵自己改成 ADD + 白 tint，2～4 帧。
 *    不用 ColorMatrixFilter：微信小游戏的 Filter / FBO 经常是 null，一开就会
 *    `Cannot read properties of null (reading 'off')`。
 *    也不叠一张同贴图：白 tint 不改颜色，ADD 叠在自己身上又几乎到顶，
 *    看起来就是「抖了但没闪」。必须改本体混合，让它叠到草地上才会爆亮。
 * 2. **短震 / 击退** — 沿攻击方向弹开再弹回，衰减正弦，约 140ms。
 *    只动身体，血条不动。
 * 3. **命中停顿** — 伤害数字出来前冻 1 帧多。
 */

export const HIT_FLASH_MS = 200;
export const HIT_KNOCK_MS = 180;
export const HIT_STOP_MS = 48;
/** 击退振幅（像素）。格子约 72 时 ≈ 0.16 格 */
export const HIT_KNOCK_PX = 12;
/**
 * AoE 多目标之间的错帧间隔。
 *
 * 同一帧里四个人一起闪白、四个伤害数字一起跳，读起来是「场地效果结算了」；
 * 隔开 70ms 依次中招，同一份特效就变成「我扫过去挨个打到」。
 * 再大就散成四次独立攻击，回合也拖长。
 */
export const AOE_STAGGER_MS = 70;

/**
 * 无弹道爆炸（霜环、旋风）的闪光是 fire-and-forget。
 * 立刻出飘字会压在最亮的起手帧上，读成「打到了没数字」。
 * 等到环展开（约四成时长）再出字。
 */
export function aoeImpactFloatDelayMs(impactDurationMs: number): number {
  if (impactDurationMs <= 0) return HIT_STOP_MS;
  return Math.max(HIT_STOP_MS, Math.round(impactDurationMs * 0.42));
}

/** k∈[0,1] → 沿击退方向的位移。约 2.5 次来回，越来越小。 */
export function hitKnockDisplacement(k: number, amp: number): number {
  const t = Math.max(0, Math.min(1, k));
  return Math.sin(t * Math.PI * 5) * amp * (1 - t);
}

/** k∈[0,1] → 闪白强度。前 40% 钉在最白，然后二次衰减。 */
export function hitFlashLift(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  if (t < 0.4) return 1;
  const u = (t - 0.4) / 0.6;
  return (1 - u) * (1 - u);
}

export function hitDirection(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** 在角色身上找第一张 Sprite，给静态 token 叠闪白用。 */
export function firstSprite(node: PIXI.DisplayObject): PIXI.Sprite | null {
  if (node instanceof PIXI.Sprite) return node;
  if (node instanceof PIXI.Container) {
    for (const ch of node.children) {
      const found = firstSprite(ch);
      if (found) return found;
    }
  }
  return null;
}

type FlashSaved = { tint: number; blendMode: PIXI.BLEND_MODES };

const flashSaved = new WeakMap<PIXI.Sprite, FlashSaved>();

/**
 * 受击闪白：改精灵自己的混合，而不是再盖一张同贴图。
 * `alpha` 过低时还原 tint / blendMode。
 */
export function applyHitFlash(source: PIXI.Sprite, alpha: number): void {
  if (!isDisplayLive(source)) return;
  if (!flashSaved.has(source)) {
    flashSaved.set(source, { tint: source.tint, blendMode: source.blendMode });
  }
  const orig = flashSaved.get(source)!;
  if (alpha <= 0.08) {
    source.tint = orig.tint;
    source.blendMode = orig.blendMode;
    flashSaved.delete(source);
    return;
  }
  source.tint = 0xffffff;
  source.blendMode = PIXI.BLEND_MODES.ADD;
}

/** 立刻还原受击闪白，切场景 / 动画结束时用。 */
export function clearHitFlash(source: PIXI.Sprite | null | undefined): void {
  if (!source || source.destroyed) return;
  const orig = flashSaved.get(source);
  if (!orig) return;
  source.tint = orig.tint;
  source.blendMode = orig.blendMode;
  flashSaved.delete(source);
}
