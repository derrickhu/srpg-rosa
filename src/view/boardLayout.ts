export interface ScreenSize {
  screenWidth: number;
  screenHeight: number;
}

/** 与布阵/战斗回放共用的棋盘区域布局（尺寸由关卡 terrain 决定） */
export function computeBoardLayout(
  screen: ScreenSize,
  gridW: number,
  gridH: number,
): {
  cell: number;
  originX: number;
  originY: number;
} {
  const sw = Math.max(320, screen.screenWidth);
  const sh = Math.max(480, screen.screenHeight);
  const topReserve = 36;
  const bottomReserve = 56;
  const usableW = sw;
  const usableH = sh - topReserve - bottomReserve;
  const gw = Math.max(1, gridW);
  const gh = Math.max(1, gridH);
  const raw = Math.floor(Math.min(usableW / gw, usableH / gh));
  const cell = Math.max(28, Math.min(56, raw));
  const gridPxW = cell * gw;
  const gridPxH = cell * gh;
  const originX = Math.floor((sw - gridPxW) / 2);
  const originY = topReserve + Math.floor((usableH - gridPxH) / 2);
  return { cell, originX, originY };
}
