import type { DisplayObject, IDestroyOptions } from 'pixi.js';

/**
 * 还能不能写 x / y / position / scale。
 *
 * Pixi 的 setter 走 `this.transform.position`。destroy 会先把 transform 置空；
 * 微信上有时 `destroyed` 还是 false，ticker 再写坐标就变成
 * `Cannot read properties of null (reading 'position')`。
 */
export function isDisplayLive(obj: DisplayObject | null | undefined): boolean {
  return !!obj && !obj.destroyed && !!obj.transform;
}

/**
 * 可重复调用的 destroy。切场景时父节点已经 `destroy({children:true})` 过了，
 * 延时回调（Toast 的 setTimeout、特效 onComplete）再调一次会走 Sprite 的
 * `_texture.off(...)`；贴图已是 null，微信上报
 * `Cannot read properties of null (reading 'off')`。
 */
export function safeDestroy(
  obj: DisplayObject | null | undefined,
  options?: boolean | IDestroyOptions,
): void {
  if (!isDisplayLive(obj)) return;
  try {
    obj.destroy(options);
  } catch {
    /* 微信二次回收 / 空贴图 off */
  }
}
