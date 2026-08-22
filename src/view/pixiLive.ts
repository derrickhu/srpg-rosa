import type { DisplayObject } from 'pixi.js';

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
