import type { TerrainId } from '@/battle/types';

export interface TerrainSpec {
  id: TerrainId;
  name: string;
  /** Movement cost to enter this cell. Infinity = impassable. */
  moveCost: number;
  /** Multiplier on the attacker's damage when standing on this terrain. */
  atkMul: number;
  /** Multiplier on damage *received* when standing on this terrain (< 1 = less damage). */
  defMul: number;
  /** Extra evasion chance [0, 1] (dodge probability added on top of base). */
  evade: number;
  /** HP lost per round while standing here (negative = heal). 0 = none. */
  dotPerRound: number;
  /** Display color used for the grid (fallback when no texture is loaded). */
  color: number;
}

const SPECS: Record<TerrainId, TerrainSpec> = {
  plain: {
    id: 'plain',
    name: '平原',
    moveCost: 1,
    atkMul: 1,
    defMul: 1,
    evade: 0,
    dotPerRound: 0,
    color: 0x9abb40,
  },
  high: {
    id: 'high',
    name: '高地',
    moveCost: 1,
    atkMul: 1.25,
    defMul: 1,
    evade: 0,
    dotPerRound: 0,
    color: 0xb8a060,
  },
  forest: {
    id: 'forest',
    name: '森林',
    moveCost: 2,
    atkMul: 1,
    defMul: 1,
    evade: 0.3,
    dotPerRound: 0,
    color: 0x3d8b3d,
  },
  river: {
    id: 'river',
    name: '河流',
    moveCost: 3,
    atkMul: 0.8,
    defMul: 1,
    evade: 0,
    dotPerRound: 0,
    color: 0x5599dd,
  },
  swamp: {
    id: 'swamp',
    name: '沼泽',
    moveCost: 2,
    atkMul: 1,
    defMul: 1,
    evade: 0,
    dotPerRound: 5,
    color: 0x5a7a3a,
  },
  wall: {
    id: 'wall',
    name: '城墙',
    moveCost: Infinity,
    atkMul: 1,
    defMul: 0.5,
    evade: 0,
    dotPerRound: 0,
    color: 0x999999,
  },
  abyss: {
    id: 'abyss',
    name: '深渊',
    moveCost: Infinity,
    atkMul: 1,
    defMul: 1,
    evade: 0,
    dotPerRound: 0,
    color: 0x2a1a3a,
  },
};

export function getTerrainSpec(id: TerrainId): TerrainSpec {
  return SPECS[id] ?? SPECS.plain;
}

export function isPassable(id: TerrainId): boolean {
  return SPECS[id].moveCost < Infinity;
}

export function terrainColor(id: TerrainId): number {
  return SPECS[id].color;
}
