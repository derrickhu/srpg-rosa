import type { UnitKind } from '@/battle/types';
import { emptyTerrain, type TerrainGrid } from '@/battle/grid';
import type { AiDifficulty } from '@/battle/ai';

/** 精英/Boss 对 `enemyCatalog` 基础数值的覆盖（仍乘副本/节点缩放） */
export interface StageEnemyStatOverride {
  maxHp?: number;
  atk?: number;
  spd?: number;
  move?: number;
}

export interface StageEnemySpawn {
  defId: UnitKind;
  x: number;
  y: number;
  uid: string;
  /** 精英/Boss 显示名（覆盖兵种名） */
  name?: string;
  /** Boss：战场放大体型 + 头顶显示专名 */
  boss?: boolean;
  /** 数值覆盖 */
  stats?: StageEnemyStatOverride;
  /**
   * 敌方技能皮肤 id（见 `enemySkillCatalog`）。
   * 结算复用底层 SkillSpec，名字/图标/特效按怪种覆写。
   * 与 `skillId` 二选一；都缺省 = **无技能，只普攻**（第一章小怪的常态）。
   */
  skillSkin?: string;
  /**
   * 直接挂底层 SkillSpec id（无皮肤时的临时写法）。
   * 新内容优先用 `skillSkin`；这个字段留给还没做皮肤的过渡怪。
   */
  skillId?: string;
  /** 专属动画集 id（缺省用 defId），见 src/view/animSets.ts */
  animSet?: string;
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

// ─── Chapter 1: 草原战线 (1-7) ───
// 教学曲线：接触战 → 远程威胁 → 河道隘口 → 骑兵突袭 → 高地攻坚 → 精英围剿 → Boss。
// 玩家从战场最下两行出发（deploy rows = h-2, h-1），敌人布置在北侧。
// 第一章敌人主体是「新兵」弱化变体：1 级首通阵容（无等级/精华积累）也能打过，
// 后续章节回归 enemyCatalog 标准数值。
//
// 外观是草原魔物，不是人形新兵。原来敌我共用四兵种美术、只靠一层红 tint 区分，
// 一眼扫过去分不清哪半边是自己的；换成魔物后阵营从剪影就读得出来。
// defId 仍是四兵种，数值、三角克制、AI 全不变——换的只是 animSet。
// 定位靠剪影读：圆滚水滴＝近战、宽伞盖＝远程、四足低伏＝快、厚穹顶＝坦。
// 四只都只有一张静止图（没有行走/攻击图集），呼吸与出手位移由 AnimatedUnit 用代码补，
// 一章的杂兵不值得每只做四方向；精英和 Boss 才用完整图集。

/** 第一章杂兵模板。无尽试炼复用同一套，不要各抄一份数字。 */
export const CHAPTER1_ROOKIE: Record<UnitKind, { name: string; animSet: string; stats: StageEnemyStatOverride }> = {
  sword: { name: '黏泥怪', animSet: 'slime', stats: { maxHp: 78, atk: 15 } },
  bow: { name: '孢子菇', animSet: 'sporecap', stats: { maxHp: 48, atk: 18 } },
  cavalry: { name: '血牙狼', animSet: 'bloodwolf', stats: { maxHp: 70, atk: 16 } },
  shield: { name: '岩甲龟', animSet: 'rockshell', stats: { maxHp: 118, atk: 9 } },
};

const ROOKIE = CHAPTER1_ROOKIE;

function rookie(defId: UnitKind, x: number, y: number): StageEnemySpawn {
  const r = ROOKIE[defId];
  return { defId, x, y, uid: euid(), name: r.name, animSet: r.animSet, stats: { ...r.stats } };
}

/** 关 1：两名剑士正面接触，玩家侧有两块高地可抢占（教移动与高地增伤） */
const s1: StageDefMvp = {
  id: 1,
  name: '第 1 关 · 草原哨站',
  goldReward: 8,
  terrain: withCells(emptyTerrain(7, 8), [
    { x: 2, y: 5, t: 'high' }, { x: 4, y: 5, t: 'high' },
    { x: 3, y: 2, t: 'forest' },
  ]),
  enemies: [
    rookie('sword', 2, 1),
    rookie('sword', 4, 2),
  ],
  aiDifficulty: 'easy',
  maxDeploy: 2,
};

/** 关 2：高台弓手 + 护卫，路边森林提供 30% 闪避掩护（教远程威胁与地形掩护） */
const s2: StageDefMvp = {
  id: 2,
  name: '第 2 关 · 猎手小径',
  goldReward: 10,
  terrain: withCells(emptyTerrain(8, 9), [
    { x: 4, y: 1, t: 'high' },
    { x: 2, y: 4, t: 'forest' }, { x: 5, y: 4, t: 'forest' },
    { x: 1, y: 6, t: 'forest' }, { x: 6, y: 6, t: 'forest' },
  ]),
  enemies: [
    rookie('bow', 4, 1),
    rookie('bow', 2, 2),
    rookie('sword', 5, 2),
  ],
  aiDifficulty: 'easy',
};

/** 关 3：一条大河把战场拦腰截断，只留两处浅滩；盾卫堵桥头（教隘口与涉水惩罚） */
const s3: StageDefMvp = {
  id: 3,
  name: '第 3 关 · 渡口之争',
  goldReward: 12,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 0, y: 5, t: 'river' }, { x: 1, y: 5, t: 'river' },
    { x: 3, y: 5, t: 'river' }, { x: 4, y: 5, t: 'river' }, { x: 5, y: 5, t: 'river' },
    { x: 7, y: 5, t: 'river' }, { x: 8, y: 5, t: 'river' },
    { x: 2, y: 7, t: 'forest' }, { x: 6, y: 7, t: 'forest' },
  ]),
  enemies: [
    rookie('shield', 2, 4),
    rookie('sword', 6, 4),
    rookie('bow', 4, 3),
  ],
};

/** 关 4：开阔地两翼骑兵包抄 + 后排弓手，玩家侧有可依托的双高地（教集火与反骑兵） */
const s4: StageDefMvp = {
  id: 4,
  name: '第 4 关 · 骑兵突袭',
  goldReward: 14,
  terrain: withCells(emptyTerrain(8, 9), [
    { x: 3, y: 5, t: 'high' }, { x: 4, y: 5, t: 'high' },
    { x: 0, y: 3, t: 'forest' }, { x: 7, y: 3, t: 'forest' },
  ]),
  enemies: [
    rookie('cavalry', 1, 1),
    rookie('cavalry', 6, 1),
    rookie('bow', 4, 0),
  ],
};

/** 关 5：北部三连高台弓阵 + 中门盾卫，两侧城墙不可通行，必须仰攻中路（教破阵） */
const s5: StageDefMvp = {
  id: 5,
  name: '第 5 关 · 高地弓阵',
  goldReward: 16,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 3, y: 2, t: 'high' }, { x: 4, y: 2, t: 'high' }, { x: 5, y: 2, t: 'high' },
    { x: 2, y: 3, t: 'wall' }, { x: 6, y: 3, t: 'wall' },
    { x: 3, y: 6, t: 'forest' }, { x: 5, y: 6, t: 'forest' },
  ]),
  enemies: [
    rookie('bow', 3, 2),
    rookie('bow', 5, 2),
    rookie('shield', 4, 3),
  ],
};

/** 关 6：精英百夫长坐镇中央缓丘，弓手两翼 + 骑兵侧袭（Boss 前的综合考试） */
const s6: StageDefMvp = {
  id: 6,
  name: '第 6 关 · 前哨围剿',
  goldReward: 18,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 4, y: 3, t: 'high' },
    { x: 2, y: 5, t: 'forest' }, { x: 6, y: 5, t: 'forest' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 4, y: 2, uid: euid(),
      name: '百夫长·卡格',
      // 沿用 Boss 的血牙兽人外观：他是酋长的部下，也让玩家提前认脸。
      // 杂兵是野生魔物、精英与 Boss 是血牙部族，这一层区分本身就是「这个不好惹」的信号。
      animSet: 'bloodfang',
      // 第一章小怪/精英只普攻后，原先靠 whirl/charge/pierce 撑起的压力改由面板补回。
      stats: { maxHp: 188, atk: 23, spd: 6 },
    },
    {
      ...rookie('bow', 2, 1),
      stats: { maxHp: 55, atk: 20 },
    },
    {
      ...rookie('cavalry', 7, 3),
      // 失去冲锋被动（×1.35）后，用更高基础攻与血量保住侧袭威胁
      stats: { maxHp: 85, atk: 20 },
    },
  ],
};

/** 关 7：Boss 血牙酋长踞守祭坛高台（血牙咆哮 = savage_roar AoE+自强化），盾卫堵台下，弓手依墙 */
const s7: StageDefMvp = {
  id: 7,
  name: '第 7 关 · 血牙酋长',
  goldReward: 24,
  terrain: withCells(emptyTerrain(9, 11), [
    { x: 4, y: 2, t: 'high' }, { x: 4, y: 3, t: 'high' },
    { x: 2, y: 3, t: 'wall' }, { x: 6, y: 3, t: 'wall' },
    { x: 1, y: 6, t: 'forest' }, { x: 7, y: 6, t: 'forest' },
    { x: 3, y: 7, t: 'forest' }, { x: 5, y: 7, t: 'forest' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 4, y: 2, uid: euid(),
      name: '血牙酋长',
      boss: true,
      animSet: 'bloodfang',
      // 护卫去掉 bash/pierce 后 Boss 战变软；略抬本体与护卫面板，保住「备药仍有压力」
      stats: { maxHp: 268, atk: 20, spd: 6 },
      skillSkin: 'bloodfang_roar',
    },
    {
      ...rookie('shield', 4, 4),
      stats: { maxHp: 128, atk: 10 },
    },
    {
      ...rookie('bow', 2, 2),
      stats: { maxHp: 52, atk: 19 },
    },
  ],
  isBoss: true,
  maxDeploy: 4,
};

// ─── Chapter 2: 森林战 (8-12) ───

const s8: StageDefMvp = {
  id: 8,
  name: '第 8 关 · 林间伏击',
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

const s9: StageDefMvp = {
  id: 9,
  name: '第 9 关 · 密林之路',
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

const s10: StageDefMvp = {
  id: 10,
  name: '第 10 关 · 林中要塞',
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

const s11: StageDefMvp = {
  id: 11,
  name: '第 11 关 · 狭路相逢',
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

const s12: StageDefMvp = {
  id: 12,
  name: '第 12 关 · 森林 Boss',
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

// ─── Chapter 3: 要塞战 (13-17) ───

const s13: StageDefMvp = {
  id: 13,
  name: '第 13 关 · 城墙阻隔',
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

const s14: StageDefMvp = {
  id: 14,
  name: '第 14 关 · 高地争夺',
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

const s15: StageDefMvp = {
  id: 15,
  name: '第 15 关 · 双面夹攻',
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

const s16: StageDefMvp = {
  id: 16,
  name: '第 16 关 · 城门攻防',
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

const s17: StageDefMvp = {
  id: 17,
  name: '第 17 关 · 要塞 Boss',
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

// ─── Chapter 4: 沼泽战 (18-22) ───

const s18: StageDefMvp = {
  id: 18,
  name: '第 18 关 · 沼泽初遇',
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

const s19: StageDefMvp = {
  id: 19,
  name: '第 19 关 · 毒沼围困',
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

const s20: StageDefMvp = {
  id: 20,
  name: '第 20 关 · 沼泽渡河',
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

const s21: StageDefMvp = {
  id: 21,
  name: '第 21 关 · 迷雾沼泽',
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

const s22: StageDefMvp = {
  id: 22,
  name: '第 22 关 · 沼泽 Boss',
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

// ─── Chapter 5: 龙岭战 (23-27) ───

const s23: StageDefMvp = {
  id: 23,
  name: '第 23 关 · 悬崖之战',
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

const s24: StageDefMvp = {
  id: 24,
  name: '第 24 关 · 龙岭隘口',
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

const s25: StageDefMvp = {
  id: 25,
  name: '第 25 关 · 火山裂谷',
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

const s26: StageDefMvp = {
  id: 26,
  name: '第 26 关 · 龙脊峰',
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

const s27: StageDefMvp = {
  id: 27,
  name: '第 27 关 · 龙王',
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
  s1, s2, s3, s4, s5, s6, s7,
  s8, s9, s10, s11, s12,
  s13, s14, s15, s16, s17,
  s18, s19, s20, s21, s22,
  s23, s24, s25, s26, s27,
];
