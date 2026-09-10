import { playerDeployRowRange } from './constants';
import { gridSize, type TerrainGrid } from './grid';
import type { Vec2 } from './types';

/**
 * 布阵区。缺省南两行是全游戏前五章、教程、无尽、试炼的口径。
 * 第六章用左右翼：从侧门进场，中间留给血池和敌人。
 */
export type DeployZone =
  | { kind: 'south' }
  | { kind: 'flanks'; cols: 1 | 2 };

export interface StageDeploySource {
  terrain: TerrainGrid;
  deployZone?: DeployZone;
}

export function resolveDeployZone(stage: StageDeploySource): DeployZone {
  return stage.deployZone ?? { kind: 'south' };
}

/** 这一关玩家能站的布阵格（含不可通行的，调用方再滤） */
export function playerDeployCells(stage: StageDeploySource): Vec2[] {
  const { w, h } = gridSize(stage.terrain);
  const zone = resolveDeployZone(stage);
  const out: Vec2[] = [];
  if (zone.kind === 'south') {
    const [r0, r1] = playerDeployRowRange(h);
    for (let y = r0; y <= r1; y += 1) {
      for (let x = 0; x < w; x += 1) out.push({ x, y });
    }
    return out;
  }
  const cols = zone.cols;
  const y0 = Math.floor(h / 2);
  for (let y = y0; y < h; y += 1) {
    for (let x = 0; x < cols; x += 1) out.push({ x, y });
    for (let x = Math.max(cols, w - cols); x < w; x += 1) out.push({ x, y });
  }
  return out;
}

export function isPlayerDeployCell(stage: StageDeploySource, pos: Vec2): boolean {
  return playerDeployCells(stage).some((c) => c.x === pos.x && c.y === pos.y);
}

export type DeployRank = 'front' | 'back';
export type DeploySide = 'left' | 'right';

export function classifyDeploySlot(
  zone: DeployZone,
  w: number,
  h: number,
  pos: Vec2,
): { side: DeploySide; rank: DeployRank } {
  const side: DeploySide = pos.x < w / 2 ? 'left' : 'right';
  if (zone.kind === 'south') {
    const [r0] = playerDeployRowRange(h);
    return { side, rank: pos.y === r0 ? 'front' : 'back' };
  }
  const inner = zone.cols === 1
    ? (side === 'left' ? 0 : w - 1)
    : (side === 'left' ? 1 : w - 2);
  return { side, rank: pos.x === inner ? 'front' : 'back' };
}

/**
 * 南两行 → 南两行必须保住绝对 x（第一章沿用站位的现口径）。
 * 进出侧翼才按「左半场 / 前排」重映射。
 */
export function remapDeployPos(
  from: { zone: DeployZone; w: number; h: number },
  to: { zone: DeployZone; w: number; h: number },
  pos: Vec2,
): Vec2 {
  if (from.zone.kind === 'south' && to.zone.kind === 'south') {
    const [oldR0, oldR1] = playerDeployRowRange(from.h);
    const [r0, r1] = playerDeployRowRange(to.h);
    let y = pos.y;
    if (pos.y === oldR0) y = r0;
    else if (pos.y === oldR1) y = r1;
    return { x: pos.x, y };
  }
  const slot = classifyDeploySlot(from.zone, from.w, from.h, pos);
  const yScale = to.h / Math.max(1, from.h);
  return slotToPos(to.zone, to.w, to.h, slot.side, slot.rank, Math.round(pos.y * yScale));
}

function slotToPos(
  zone: DeployZone,
  w: number,
  h: number,
  side: DeploySide,
  rank: DeployRank,
  preferY: number,
): Vec2 {
  if (zone.kind === 'south') {
    const [r0, r1] = playerDeployRowRange(h);
    const y = rank === 'front' ? r0 : r1;
    const x = side === 'left'
      ? Math.min(Math.max(0, Math.floor(w / 4)), w - 1)
      : Math.min(w - 1, Math.floor((3 * w) / 4));
    return { x, y };
  }
  const cols = zone.cols;
  const x = rank === 'front'
    ? (side === 'left' ? (cols === 1 ? 0 : 1) : (cols === 1 ? w - 1 : w - 2))
    : (side === 'left' ? 0 : w - 1);
  const y0 = Math.floor(h / 2);
  const y = Math.min(h - 1, Math.max(y0, preferY));
  return { x, y };
}
