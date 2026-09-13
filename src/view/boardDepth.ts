/**
 * 棋盘前后：屏幕越靠下越靠前。
 *
 * 人比一格高，北面那格的脚会伸进南面那格。不按 y 排的话，后挂上去的人
 * （常见是玩家）会把南面的身体和血条一起盖住。
 */
const ROW_SPAN = 1024;

export function boardDepthZ(screenX: number, screenY: number): number {
  return screenY * ROW_SPAN + screenX;
}

export function applyBoardDepth(node: { x: number; y: number; zIndex: number }): void {
  node.zIndex = boardDepthZ(node.x, node.y);
}
