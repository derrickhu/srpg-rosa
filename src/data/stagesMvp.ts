import type { UnitKind } from '@/battle/types';
import { emptyTerrain, type TerrainGrid } from '@/battle/grid';
import type { AiDifficulty } from '@/battle/ai';

export interface StageEnemySpawn {
  defId: UnitKind;
  x: number;
  y: number;
  uid: string;
}

export interface StageDefMvp {
  id: number;
  name: string;
  goldReward: number;
  terrain: TerrainGrid;
  enemies: StageEnemySpawn[];
  aiDifficulty?: AiDifficulty;
  /** If true, this is a boss stage with special rules. */
  isBoss?: boolean;
  /** 本关最大可上阵人数（默认 3） */
  maxDeploy?: number;
}

function withCells(base: TerrainGrid, cells: { x: number; y: number; t: string }[]): TerrainGrid {
  const g = base.map((row) => [...row]);
  for (const c of cells) {
    if (g[c.y]?.[c.x] !== undefined) (g[c.y]! as any)[c.x] = c.t;
  }
  return g;
}

function withHighCells(base: TerrainGrid, cells: { x: number; y: number }[]): TerrainGrid {
  return withCells(base, cells.map((c) => ({ ...c, t: 'high' })));
}

let eid = 0;
function euid(): string {
  eid += 1;
  return `e_${eid}`;
}

// ─── Chapter 1: 草原战 (1-5) ───

const s1: StageDefMvp = {
  id: 1,
  name: '第 1 关 · 接触战',
  goldReward: 8,
  terrain: withHighCells(emptyTerrain(6, 7), [{ x: 2, y: 5 }, { x: 4, y: 6 }]),
  enemies: [{ defId: 'sword', x: 2, y: 1, uid: euid() }],
  aiDifficulty: 'easy',
  maxDeploy: 2,
};

const s2: StageDefMvp = {
  id: 2,
  name: '第 2 关 · 远近配合',
  goldReward: 10,
  terrain: withHighCells(emptyTerrain(8, 9), [{ x: 0, y: 0 }, { x: 7, y: 0 }]),
  enemies: [
    { defId: 'bow', x: 2, y: 0, uid: euid() },
    { defId: 'sword', x: 5, y: 3, uid: euid() },
  ],
  aiDifficulty: 'easy',
  maxDeploy: 2,
};

const s3: StageDefMvp = {
  id: 3,
  name: '第 3 关 · 铁壁',
  goldReward: 12,
  terrain: emptyTerrain(9, 10),
  enemies: [
    { defId: 'shield', x: 4, y: 1, uid: euid() },
    { defId: 'bow', x: 7, y: 1, uid: euid() },
    { defId: 'cavalry', x: 2, y: 2, uid: euid() },
  ],
};

const s4: StageDefMvp = {
  id: 4,
  name: '第 4 关 · 夹击',
  goldReward: 14,
  terrain: withHighCells(emptyTerrain(8, 9), [{ x: 3, y: 4 }, { x: 4, y: 4 }]),
  enemies: [
    { defId: 'sword', x: 1, y: 1, uid: euid() },
    { defId: 'sword', x: 6, y: 1, uid: euid() },
    { defId: 'bow', x: 4, y: 0, uid: euid() },
  ],
};

const s5: StageDefMvp = {
  id: 5,
  name: '第 5 关 · 草原 Boss',
  goldReward: 20,
  terrain: withHighCells(emptyTerrain(9, 10), [{ x: 4, y: 3 }, { x: 4, y: 4 }]),
  enemies: [
    { defId: 'cavalry', x: 4, y: 1, uid: euid() },
    { defId: 'sword', x: 2, y: 2, uid: euid() },
    { defId: 'sword', x: 6, y: 2, uid: euid() },
    { defId: 'bow', x: 4, y: 0, uid: euid() },
  ],
  isBoss: true,
  maxDeploy: 4,
};

// ─── Chapter 2: 森林战 (6-10) ───

const s6: StageDefMvp = {
  id: 6,
  name: '第 6 关 · 林间伏击',
  goldReward: 14,
  terrain: withCells(emptyTerrain(8, 9), [
    { x: 2, y: 3, t: 'forest' }, { x: 3, y: 3, t: 'forest' },
    { x: 5, y: 4, t: 'forest' }, { x: 6, y: 4, t: 'forest' },
  ]),
  enemies: [
    { defId: 'bow', x: 3, y: 3, uid: euid() },
    { defId: 'sword', x: 5, y: 2, uid: euid() },
  ],
};

const s7: StageDefMvp = {
  id: 7,
  name: '第 7 关 · 密林之路',
  goldReward: 16,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 3, y: 2, t: 'forest' }, { x: 4, y: 2, t: 'forest' }, { x: 5, y: 2, t: 'forest' },
    { x: 3, y: 5, t: 'forest' }, { x: 4, y: 5, t: 'forest' }, { x: 5, y: 5, t: 'forest' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 4, y: 1, uid: euid() },
    { defId: 'bow', x: 2, y: 0, uid: euid() },
    { defId: 'bow', x: 6, y: 0, uid: euid() },
  ],
};

const s8: StageDefMvp = {
  id: 8,
  name: '第 8 关 · 林中要塞',
  goldReward: 16,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 4, y: 3, t: 'wall' }, { x: 4, y: 4, t: 'wall' },
    { x: 2, y: 2, t: 'forest' }, { x: 6, y: 2, t: 'forest' },
  ]),
  enemies: [
    { defId: 'shield', x: 3, y: 1, uid: euid() },
    { defId: 'bow', x: 5, y: 1, uid: euid() },
    { defId: 'sword', x: 1, y: 3, uid: euid() },
  ],
};

const s9: StageDefMvp = {
  id: 9,
  name: '第 9 关 · 狭路相逢',
  goldReward: 18,
  terrain: withCells(emptyTerrain(7, 10), [
    { x: 0, y: 3, t: 'forest' }, { x: 1, y: 3, t: 'forest' },
    { x: 5, y: 3, t: 'forest' }, { x: 6, y: 3, t: 'forest' },
    { x: 0, y: 5, t: 'forest' }, { x: 6, y: 5, t: 'forest' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 3, y: 0, uid: euid() },
    { defId: 'cavalry', x: 3, y: 2, uid: euid() },
    { defId: 'shield', x: 3, y: 1, uid: euid() },
  ],
};

const s10: StageDefMvp = {
  id: 10,
  name: '第 10 关 · 森林 Boss',
  goldReward: 24,
  terrain: withCells(withHighCells(emptyTerrain(10, 11), [{ x: 4, y: 5 }, { x: 5, y: 5 }]), [
    { x: 1, y: 3, t: 'forest' }, { x: 2, y: 3, t: 'forest' },
    { x: 7, y: 3, t: 'forest' }, { x: 8, y: 3, t: 'forest' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 5, y: 1, uid: euid() },
    { defId: 'bow', x: 2, y: 0, uid: euid() },
    { defId: 'bow', x: 7, y: 0, uid: euid() },
    { defId: 'shield', x: 5, y: 2, uid: euid() },
    { defId: 'sword', x: 3, y: 2, uid: euid() },
  ],
  isBoss: true,
  aiDifficulty: 'normal',
  maxDeploy: 4,
};

// ─── Chapter 3: 要塞战 (11-15) ───

const s11: StageDefMvp = {
  id: 11,
  name: '第 11 关 · 城墙阻隔',
  goldReward: 18,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 2, y: 4, t: 'wall' }, { x: 3, y: 4, t: 'wall' },
    { x: 5, y: 4, t: 'wall' }, { x: 6, y: 4, t: 'wall' },
  ]),
  enemies: [
    { defId: 'bow', x: 4, y: 1, uid: euid() },
    { defId: 'shield', x: 4, y: 3, uid: euid() },
    { defId: 'sword', x: 2, y: 2, uid: euid() },
  ],
};

const s12: StageDefMvp = {
  id: 12,
  name: '第 12 关 · 高地争夺',
  goldReward: 20,
  terrain: withHighCells(emptyTerrain(9, 10), [
    { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
    { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 },
  ]),
  enemies: [
    { defId: 'bow', x: 4, y: 3, uid: euid() },
    { defId: 'cavalry', x: 3, y: 1, uid: euid() },
    { defId: 'cavalry', x: 5, y: 1, uid: euid() },
  ],
  aiDifficulty: 'normal',
};

const s13: StageDefMvp = {
  id: 13,
  name: '第 13 关 · 双面夹攻',
  goldReward: 20,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 0, y: 5, t: 'wall' }, { x: 1, y: 5, t: 'wall' },
    { x: 8, y: 5, t: 'wall' }, { x: 9, y: 5, t: 'wall' },
  ]),
  enemies: [
    { defId: 'sword', x: 2, y: 1, uid: euid() },
    { defId: 'sword', x: 7, y: 1, uid: euid() },
    { defId: 'bow', x: 5, y: 0, uid: euid() },
    { defId: 'shield', x: 5, y: 2, uid: euid() },
  ],
};

const s14: StageDefMvp = {
  id: 14,
  name: '第 14 关 · 城门攻防',
  goldReward: 22,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 3, y: 3, t: 'wall' }, { x: 5, y: 3, t: 'wall' },
    { x: 3, y: 4, t: 'wall' }, { x: 5, y: 4, t: 'wall' },
    { x: 4, y: 3, t: 'high' },
  ]),
  enemies: [
    { defId: 'shield', x: 4, y: 2, uid: euid() },
    { defId: 'bow', x: 4, y: 1, uid: euid() },
    { defId: 'cavalry', x: 1, y: 1, uid: euid() },
    { defId: 'cavalry', x: 7, y: 1, uid: euid() },
  ],
};

const s15: StageDefMvp = {
  id: 15,
  name: '第 15 关 · 要塞 Boss',
  goldReward: 28,
  terrain: withCells(withHighCells(emptyTerrain(10, 11), [{ x: 4, y: 2 }, { x: 5, y: 2 }]), [
    { x: 2, y: 4, t: 'wall' }, { x: 7, y: 4, t: 'wall' },
    { x: 2, y: 5, t: 'wall' }, { x: 7, y: 5, t: 'wall' },
  ]),
  enemies: [
    { defId: 'shield', x: 4, y: 1, uid: euid() },
    { defId: 'shield', x: 5, y: 1, uid: euid() },
    { defId: 'bow', x: 3, y: 0, uid: euid() },
    { defId: 'bow', x: 6, y: 0, uid: euid() },
    { defId: 'cavalry', x: 5, y: 3, uid: euid() },
  ],
  isBoss: true,
  aiDifficulty: 'normal',
  maxDeploy: 4,
};

// ─── Chapter 4: 沼泽战 (16-20) ───

const s16: StageDefMvp = {
  id: 16,
  name: '第 16 关 · 沼泽初遇',
  goldReward: 22,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 3, y: 4, t: 'swamp' }, { x: 4, y: 4, t: 'swamp' }, { x: 5, y: 4, t: 'swamp' },
    { x: 3, y: 5, t: 'swamp' }, { x: 5, y: 5, t: 'swamp' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 4, y: 1, uid: euid() },
    { defId: 'bow', x: 2, y: 0, uid: euid() },
    { defId: 'sword', x: 6, y: 2, uid: euid() },
  ],
};

const s17: StageDefMvp = {
  id: 17,
  name: '第 17 关 · 毒沼围困',
  goldReward: 24,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 2, y: 3, t: 'swamp' }, { x: 3, y: 3, t: 'swamp' },
    { x: 5, y: 3, t: 'swamp' }, { x: 6, y: 3, t: 'swamp' },
    { x: 4, y: 4, t: 'swamp' },
  ]),
  enemies: [
    { defId: 'shield', x: 4, y: 1, uid: euid() },
    { defId: 'bow', x: 2, y: 1, uid: euid() },
    { defId: 'bow', x: 6, y: 1, uid: euid() },
    { defId: 'cavalry', x: 4, y: 0, uid: euid() },
  ],
  aiDifficulty: 'normal',
};

const s18: StageDefMvp = {
  id: 18,
  name: '第 18 关 · 沼泽渡河',
  goldReward: 24,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 0, y: 5, t: 'river' }, { x: 1, y: 5, t: 'river' }, { x: 2, y: 5, t: 'river' },
    { x: 3, y: 5, t: 'river' }, { x: 4, y: 5, t: 'river' }, { x: 5, y: 5, t: 'river' },
    { x: 6, y: 5, t: 'river' }, { x: 7, y: 5, t: 'river' }, { x: 8, y: 5, t: 'river' },
    { x: 9, y: 5, t: 'river' },
  ]),
  enemies: [
    { defId: 'bow', x: 3, y: 2, uid: euid() },
    { defId: 'bow', x: 6, y: 2, uid: euid() },
    { defId: 'shield', x: 5, y: 1, uid: euid() },
    { defId: 'sword', x: 4, y: 3, uid: euid() },
  ],
};

const s19: StageDefMvp = {
  id: 19,
  name: '第 19 关 · 迷雾沼泽',
  goldReward: 26,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 1, y: 3, t: 'swamp' }, { x: 3, y: 4, t: 'swamp' }, { x: 5, y: 3, t: 'swamp' },
    { x: 7, y: 4, t: 'swamp' }, { x: 2, y: 5, t: 'forest' }, { x: 6, y: 5, t: 'forest' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 2, y: 1, uid: euid() },
    { defId: 'cavalry', x: 7, y: 1, uid: euid() },
    { defId: 'sword', x: 5, y: 2, uid: euid() },
    { defId: 'shield', x: 5, y: 0, uid: euid() },
  ],
  aiDifficulty: 'hard',
};

const s20: StageDefMvp = {
  id: 20,
  name: '第 20 关 · 沼泽 Boss',
  goldReward: 32,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 3, y: 3, t: 'swamp' }, { x: 4, y: 3, t: 'swamp' }, { x: 5, y: 3, t: 'swamp' }, { x: 6, y: 3, t: 'swamp' },
    { x: 3, y: 4, t: 'swamp' }, { x: 6, y: 4, t: 'swamp' },
    { x: 4, y: 2, t: 'high' }, { x: 5, y: 2, t: 'high' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 5, y: 2, uid: euid() },
    { defId: 'shield', x: 4, y: 1, uid: euid() },
    { defId: 'bow', x: 2, y: 0, uid: euid() },
    { defId: 'bow', x: 7, y: 0, uid: euid() },
    { defId: 'sword', x: 3, y: 2, uid: euid() },
    { defId: 'sword', x: 6, y: 2, uid: euid() },
  ],
  isBoss: true,
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

// ─── Chapter 5: 龙岭战 (21-25) ───

const s21: StageDefMvp = {
  id: 21,
  name: '第 21 关 · 悬崖之战',
  goldReward: 26,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 0, y: 4, t: 'abyss' }, { x: 1, y: 4, t: 'abyss' },
    { x: 8, y: 4, t: 'abyss' }, { x: 9, y: 4, t: 'abyss' },
    { x: 4, y: 3, t: 'high' }, { x: 5, y: 3, t: 'high' },
  ]),
  enemies: [
    { defId: 'bow', x: 4, y: 1, uid: euid() },
    { defId: 'bow', x: 5, y: 1, uid: euid() },
    { defId: 'cavalry', x: 3, y: 2, uid: euid() },
    { defId: 'cavalry', x: 6, y: 2, uid: euid() },
  ],
  aiDifficulty: 'hard',
};

const s22: StageDefMvp = {
  id: 22,
  name: '第 22 关 · 龙岭隘口',
  goldReward: 28,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 0, y: 3, t: 'wall' }, { x: 1, y: 3, t: 'wall' }, { x: 2, y: 3, t: 'wall' },
    { x: 7, y: 3, t: 'wall' }, { x: 8, y: 3, t: 'wall' }, { x: 9, y: 3, t: 'wall' },
    { x: 4, y: 5, t: 'high' }, { x: 5, y: 5, t: 'high' },
  ]),
  enemies: [
    { defId: 'shield', x: 3, y: 1, uid: euid() },
    { defId: 'shield', x: 6, y: 1, uid: euid() },
    { defId: 'bow', x: 5, y: 0, uid: euid() },
    { defId: 'sword', x: 4, y: 2, uid: euid() },
    { defId: 'cavalry', x: 5, y: 2, uid: euid() },
  ],
  aiDifficulty: 'hard',
};

const s23: StageDefMvp = {
  id: 23,
  name: '第 23 关 · 火山裂谷',
  goldReward: 28,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 4, t: 'abyss' }, { x: 5, y: 4, t: 'abyss' },
    { x: 2, y: 3, t: 'swamp' }, { x: 7, y: 3, t: 'swamp' },
    { x: 3, y: 2, t: 'high' }, { x: 6, y: 2, t: 'high' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 5, y: 1, uid: euid() },
    { defId: 'bow', x: 3, y: 2, uid: euid() },
    { defId: 'bow', x: 6, y: 2, uid: euid() },
    { defId: 'sword', x: 4, y: 0, uid: euid() },
    { defId: 'shield', x: 5, y: 2, uid: euid() },
  ],
  aiDifficulty: 'hard',
};

const s24: StageDefMvp = {
  id: 24,
  name: '第 24 关 · 龙脊峰',
  goldReward: 30,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 3, y: 3, t: 'high' }, { x: 4, y: 3, t: 'high' }, { x: 5, y: 3, t: 'high' }, { x: 6, y: 3, t: 'high' },
    { x: 0, y: 5, t: 'abyss' }, { x: 9, y: 5, t: 'abyss' },
    { x: 2, y: 5, t: 'forest' }, { x: 7, y: 5, t: 'forest' },
  ]),
  enemies: [
    { defId: 'bow', x: 4, y: 3, uid: euid() },
    { defId: 'bow', x: 5, y: 3, uid: euid() },
    { defId: 'shield', x: 3, y: 2, uid: euid() },
    { defId: 'shield', x: 6, y: 2, uid: euid() },
    { defId: 'cavalry', x: 5, y: 1, uid: euid() },
  ],
  aiDifficulty: 'hard',
};

const s25: StageDefMvp = {
  id: 25,
  name: '第 25 关 · 龙王',
  goldReward: 40,
  terrain: withCells(withHighCells(emptyTerrain(11, 12), [
    { x: 5, y: 3 }, { x: 5, y: 4 },
  ]), [
    { x: 0, y: 5, t: 'abyss' }, { x: 10, y: 5, t: 'abyss' },
    { x: 1, y: 4, t: 'swamp' }, { x: 9, y: 4, t: 'swamp' },
    { x: 3, y: 3, t: 'forest' }, { x: 7, y: 3, t: 'forest' },
  ]),
  enemies: [
    { defId: 'cavalry', x: 5, y: 3, uid: euid() },
    { defId: 'shield', x: 4, y: 2, uid: euid() },
    { defId: 'shield', x: 6, y: 2, uid: euid() },
    { defId: 'bow', x: 3, y: 1, uid: euid() },
    { defId: 'bow', x: 7, y: 1, uid: euid() },
    { defId: 'sword', x: 5, y: 1, uid: euid() },
  ],
  isBoss: true,
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

export const STAGES_MVP: StageDefMvp[] = [
  s1, s2, s3, s4, s5,
  s6, s7, s8, s9, s10,
  s11, s12, s13, s14, s15,
  s16, s17, s18, s19, s20,
  s21, s22, s23, s24, s25,
];
