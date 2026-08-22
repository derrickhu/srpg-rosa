import * as PIXI from 'pixi.js';
import { isDisplayLive } from '@/view/pixiLive';

/**
 * 受击手感（业内 2D 战棋 / 动作游戏的最小有效组合）：
 *
 * 1. **闪白** — 叠一张同姿态的白色 ADD 精灵，2～4 帧。
 *    不用 ColorMatrixFilter：微信小游戏的 Filter / FBO 经常是 null，一开就会
 *    `Cannot read properties of null (reading 'off')`。
 *    也不改 tint：我方单位底色已是白，改了等于没改。
 * 2. **短震 / 击退** — 沿攻击方向弹开再弹回，衰减正弦，约 140ms。
 *    只动身体，血条不动。
 * 3. **命中停顿** — 伤害数字出来前冻 1 帧多。
 */

export const HIT_FLASH_MS = 180;
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

/** k∈[0,1] → 沿击退方向的位移。约 2.5 次来回，越来越小。 */
export function hitKnockDisplacement(k: number, amp: number): number {
  const t = Math.max(0, Math.min(1, k));
  return Math.sin(t * Math.PI * 5) * amp * (1 - t);
}

/** k∈[0,1] → 闪白叠加层透明度。前 1/4 钉在最白，然后二次衰减。 */
export function hitFlashLift(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  if (t < 0.25) return 0.92;
  const u = (t - 0.25) / 0.75;
  return 0.92 * (1 - u) * (1 - u);
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

export function createHitFlashOverlay(source: PIXI.Sprite): PIXI.Sprite {
  const overlay = new PIXI.Sprite(source.texture);
  overlay.anchor.copyFrom(source.anchor);
  // NORMAL 白罩：微信上 ADD 叠角色贴图几乎看不见。盖一层同姿态白精灵才是「闪白」。
  overlay.blendMode = PIXI.BLEND_MODES.NORMAL;
  overlay.tint = 0xffffff;
  overlay.visible = false;
  overlay.eventMode = 'none';
  source.parent?.addChild(overlay);
  return overlay;
}

/** 同步闪白层到当前姿态。alpha≤0 时只隐藏，不改 texture，避免微信里对空贴图调 off。 */
export function syncHitFlashOverlay(overlay: PIXI.Sprite, source: PIXI.Sprite, alpha: number): void {
  if (!isDisplayLive(overlay) || !isDisplayLive(source)) return;
  if (alpha <= 0.02) {
    overlay.visible = false;
    overlay.alpha = 0;
    return;
  }
  const tex = source.texture;
  if (tex && overlay.texture !== tex) overlay.texture = tex;
  overlay.anchor.copyFrom(source.anchor);
  overlay.position.copyFrom(source.position);
  overlay.scale.copyFrom(source.scale);
  overlay.alpha = alpha;
  overlay.visible = true;
}

/** 摘掉闪白层。贴图跟角色共用，只销毁显示对象，不销毁 texture。 */
export function detachHitFlashOverlay(overlay: PIXI.Sprite | null | undefined): void {
  if (!overlay || overlay.destroyed) return;
  overlay.visible = false;
  overlay.parent?.removeChild(overlay);
  overlay.destroy({ children: false, texture: false, baseTexture: false });
}
