import type { TerrainId, TroopKind, UnitKind } from '@/battle/types';
import { emptyTerrain, type TerrainGrid } from '@/battle/grid';
import type { AiDifficulty } from '@/battle/ai';
import { UNIT_DEFS } from '@/data/unitDefs';

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
  /** 全局序号（1 起）。由章节分组推出，**不要手写** */
  id: number;
  /** 展示名「第 N 关 · 标题」。由 `title` 加序号推出，**不要手写** */
  name: string;
  goldReward: number;
  terrain: TerrainGrid;
  enemies: StageEnemySpawn[];
  aiDifficulty?: AiDifficulty;
  /** If true, this is a boss stage with special rules. */
  /**
   * 这是一场 Boss 战。`dungeonCatalog.buildNodes` 据此把节点标成 `kind: 'boss'`
   * 并给 1.1 倍敌人缩放，所以每章**必须恰好有一关**标它（`stageIntegrity` 守着）。
   */
  isBoss?: boolean;
  /** 本关最大可上阵人数（默认 3） */
  maxDeploy?: number;
}

/**
 * 关卡蓝图：只写这一关自己的内容，不写它排第几。
 *
 * 之前每关手写 `id: 13` 和 `name: '第 13 关 · 城墙阻隔'`，章节归属还是
 * `dungeonCatalog` 里另一份手写下标数组 `buildNodes([12,13,14,15,16])`——
 * 同一个「第几关」被抄在三处。往中间插一关就要顺手改后面每一关的两个字段
 * 加一个数组，漏改不会报错：`id` 运行时没人读，错了只在完整性测试里现形；
 * 下标数组错了则是某关玩不到或两章共用一关。
 *
 * 现在序号只有一个来源——`CHAPTERS` 里的位置。插一关就是插一行。
 */
type StageBlueprint = Omit<StageDefMvp, 'id' | 'name'> & {
  /** 不含「第 N 关 · 」前缀的关卡名 */
  title: string;
};

/**
 * `t` 必须是 `TerrainId` 而不是 `string`：写错一个字母（`forset`）在渲染上只是
 * 静默退化成一格平原（`getTerrainSpec` 对未知 id 兜底成 plain），
 * 40 关手写数据里这种错肉眼几乎查不出来，交给编译器抓。
 */
function withCells(base: TerrainGrid, cells: { x: number; y: number; t: TerrainId }[]): TerrainGrid {
  const g = base.map((row) => [...row]);
  for (const c of cells) {
    if (g[c.y]?.[c.x] !== undefined) g[c.y]![c.x] = c.t;
  }
  return g;
}

function withHighCells(base: TerrainGrid, cells: { x: number; y: number }[]): TerrainGrid {
  return withCells(base, cells.map((c) => ({ ...c, t: 'high' as const })));
}

let eid = 0;
function euid(): string {
  eid += 1;
  return `e_${eid}`;
}

// ─── Chapter 1: 草原战线 ───
// 关卡序号由 CHAPTERS 里的位置推出，所以这些标题不再写「(1-7)」——
// 那种手写区间在往中间插一关之后就是错的，而错了也没人会发现。
// 教学曲线：接触战 → 远程威胁 → 河道隘口 → 骑兵突袭 → 高地攻坚 → 精英围剿 → Boss。
// 玩家从战场最下两行出发（deploy rows = h-2, h-1），敌人布置在北侧。
// 第一章敌人主体是「新兵」弱化变体：1 级首通阵容（无等级/精华积累）也能打过，
// 后续章节回归 enemyCatalog 标准数值。
//
// 外观是草原魔物，不是人形新兵。原来敌我共用四兵种美术、只靠一层红 tint 区分，
// 一眼扫过去分不清哪半边是自己的；换成魔物后阵营从剪影就读得出来。
// defId 仍是四兵种，数值、三角克制、程序决策全不变——换的只是 animSet。
// 定位靠剪影读：圆滚水滴＝近战、宽伞盖＝远程、四足低伏＝快、厚穹顶＝坦。
// 四只都只有一张静止图（没有行走/攻击图集），呼吸与出手位移由 AnimatedUnit 用代码补，
// 一章的杂兵不值得每只做四方向；精英和 Boss 才用完整图集。

/** 第一章杂兵模板。无尽试炼复用同一套，不要各抄一份数字。 */
export const CHAPTER1_ROOKIE: Record<TroopKind, { name: string; animSet: string; stats: StageEnemyStatOverride }> = {
  sword: { name: '黏泥怪', animSet: 'slime', stats: { maxHp: 78, atk: 15 } },
  bow: { name: '孢子菇', animSet: 'sporecap', stats: { maxHp: 48, atk: 18 } },
  cavalry: { name: '血牙狼', animSet: 'bloodwolf', stats: { maxHp: 70, atk: 16 } },
  shield: { name: '岩甲龟', animSet: 'rockshell', stats: { maxHp: 118, atk: 9 } },
};

const ROOKIE = CHAPTER1_ROOKIE;

function rookie(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  const r = ROOKIE[defId];
  return { defId, x, y, uid: euid(), name: r.name, animSet: r.animSet, stats: { ...r.stats } };
}

/** 关 1：两名剑士正面接触，玩家侧有两块高地可抢占（教移动与高地增伤） */
const c1_1: StageBlueprint = {
  title: '草原哨站',
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
const c1_2: StageBlueprint = {
  title: '猎手小径',
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
const c1_3: StageBlueprint = {
  title: '渡口之争',
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
const c1_4: StageBlueprint = {
  title: '骑兵突袭',
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
const c1_5: StageBlueprint = {
  title: '高地弓阵',
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
const c1_6: StageBlueprint = {
  title: '前哨围剿',
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
const c1_7: StageBlueprint = {
  title: '血牙酋长',
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
      // 这三只的血/攻是一起调出来的，别单独动其中一个。
      //
      // 原值（268 / 护卫 128 / 弓手 atk 19）让裸打胜率只有 2.2%：设计意图是
      // 「不备药会吃惩罚」，2.2% 传达的却是「你不可能赢」。降到 241/104/15
      // 之后裸打 25%、备药 93%，和第二章 Boss 的 24%/98% 同一口径。
      //
      // 调的时候注意这场仗是**消耗战且带取整断点**：Boss 血 240→242 只差 2 点，
      // 裸打胜率却从 37% 掉到 20%——因为这 2 点决定了要不要多补一刀，
      // 而多一刀就是多挨一整轮。所以微调也必须重跑 `chapter1Sim`，不能靠线性外推。
      stats: { maxHp: 241, atk: 20, spd: 6 },
      skillSkin: 'bloodfang_roar',
    },
    {
      // 护卫是拖延来源，不是伤害来源：血一高就让弓手多输出几轮
      ...rookie('shield', 4, 4),
      stats: { maxHp: 104, atk: 10 },
    },
    {
      // 弓手是这一关的主要掉血来源，攻击比血量敏感得多
      ...rookie('bow', 2, 2),
      stats: { maxHp: 52, atk: 15 },
    },
  ],
  isBoss: true,
  maxDeploy: 4,
};

// ─── Chapter 2: 密林深处 ───
// 教学曲线：标准数值初见 → 墙体断视线 → 松林可点燃 → 河林隘口 → 精英猎长 → Boss 萨满。
//
// 这一章的主题是**林子有两面**：它给双方 30% 闪避，所以既是玩家的掩体，
// 也是敌人的掩体；而它还能烧。整章反复问同一个问题——这片林子现在
// 对谁更有利，要不要一把火烧掉它。商店卖森林券和「松脂火把」正是为此配套。
//
// 敌人外观仍复用第一章那四只 + 血牙（美术留作后续专项）。
// 沿用第一章立下的读图规矩：野生魔物是杂兵，血牙部族是精英与 Boss——
// 剪影本身就是「这个不好惹」的信号。第一章打散的血牙残部退入密林，
// 精英/Boss 用同一套外观在叙事上也接得上。

/**
 * 第二章杂兵：和第一章同种魔物，但**回到 `UNIT_DEFS` 标准数值**。
 *
 * 第一章那批是打了约 78 折的弱化新兵（好让 1 级首通阵容打得过），
 * 这里不写 `stats` 就是标准值。刻意不抄一份数字进来：抄了就会和
 * `UNIT_DEFS` 走岔，而走岔的表现只是「第二章怪莫名变软」，没人查得出来。
 */
export const CHAPTER2_FOREST: Record<TroopKind, { name: string; animSet: string }> = {
  sword: { name: '树脂黏泥', animSet: 'slime' },
  bow: { name: '毒伞菇', animSet: 'sporecap' },
  cavalry: { name: '影林狼', animSet: 'bloodwolf' },
  shield: { name: '苔甲龟', animSet: 'rockshell' },
};

function forest(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  const f = CHAPTER2_FOREST[defId];
  return { defId, x, y, uid: euid(), name: f.name, animSet: f.animSet };
}

/** 幼体的面板比例。0.7 是实测出来的档位，见 `forestYoung` 的说明 */
const YOUNG_RATIO = 0.7;

/**
 * 第二章填充杂兵：同种魔物的**幼体**，约七折面板。
 *
 * 为什么需要这个档位：一只标准杂兵的存在感太大了。实测在同一张图上加减一只整兵，
 * 胜率会在 ~100% 和 ~75% 之间跳——中间没有档位可选，于是每一关只能在
 * 「毫无压力」和「比精英关还难」之间二选一。幼体让「场面上多一个威胁、
 * 但不多一份完整输出」成为可能，这是排推进关曲线时唯一缺的那块积木。
 *
 * 面板从 `UNIT_DEFS` 现算而不是手抄七折后的数字：抄下来就会和基准走岔，
 * 而走岔的表现只是「这只怪好像有点软」。
 */
function forestYoung(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  const f = CHAPTER2_FOREST[defId];
  const b = UNIT_DEFS[defId].base;
  return {
    defId, x, y, uid: euid(),
    name: `幼${f.name}`,
    animSet: f.animSet,
    stats: {
      maxHp: Math.round(b.maxHp * YOUNG_RATIO),
      atk: Math.round(b.atk * YOUNG_RATIO),
    },
  };
}

/** 关 8：敌人躲在林子里打（教「掩体对双方都生效」，第一章的林子只掩护过玩家） */
const c2_1: StageBlueprint = {
  title: '藤蔓小径',
  goldReward: 14,
  // 9x10 而不是更紧凑的 8x9：四只标准杂兵在小图上会同时贴上来，实测胜率掉到 55%——
  // 一章的开场关不该是全章最难的推进关。多两行接近距离就把节奏还回来了。
  terrain: withCells(emptyTerrain(9, 10), [
    // 两片林子都在敌人脚下：玩家第一次体会到 30% 闪避打在自己脸上
    { x: 2, y: 2, t: 'forest' }, { x: 3, y: 2, t: 'forest' },
    { x: 5, y: 3, t: 'forest' }, { x: 6, y: 3, t: 'forest' },
    // 玩家侧双高地：不烧林子也有正面解法（站高地吃增伤对冲闪避）
    { x: 3, y: 6, t: 'high' }, { x: 4, y: 6, t: 'high' },
  ]),
  enemies: [
    forest('bow', 3, 2),
    forest('sword', 5, 3),
    forest('cavalry', 1, 1),
    // 第四只用幼体且放在最北排：加一点场面压力，但不加一整份输出
    forestYoung('sword', 7, 0),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 9：一道横墙只留三个豁口，墙后的弓手看不见墙这侧。
 *
 * 这是全游戏第一关**必须读视线**的图：贴着墙走能安全推进到豁口边，
 * 从空地直接横穿则会同时吃到两个弓手。墙挡视线是这一章前才补上的机制，
 * 得有一关专门把它教明白。
 */
const c2_2: StageBlueprint = {
  title: '哨塔盲角',
  goldReward: 16,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 1, y: 4, t: 'wall' }, { x: 2, y: 4, t: 'wall' }, { x: 3, y: 4, t: 'wall' },
    { x: 5, y: 4, t: 'wall' }, { x: 6, y: 4, t: 'wall' }, { x: 7, y: 4, t: 'wall' },
    // 中路豁口正上方的高地：唯一能俯射中路的位置，也是玩家该抢的目标
    { x: 4, y: 2, t: 'high' },
    { x: 0, y: 6, t: 'forest' }, { x: 8, y: 6, t: 'forest' },
  ]),
  enemies: [
    forest('bow', 4, 2),
    // 躲在墙后：玩家没进豁口前它射不到人，进了才成为威胁
    forest('bow', 2, 3),
    forest('shield', 4, 3),
    forest('cavalry', 6, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 10：一整条松林带横断战场，两端顶墙——想过去只能穿林，或者先烧开。
 *
 * 排在第一个补给点之后，玩家此时刚买得到「松脂火把」。烧不烧都能过：
 * 穿林要吃两个弓手一轮齐射，烧开则要接受林子没了、自己也失去掩体，
 * 而且燃烧格本身会掉血。这一关就是把那个取舍摆到台面上。
 */
const c2_3: StageBlueprint = {
  title: '松脂林道',
  goldReward: 16,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 0, y: 4, t: 'wall' },
    { x: 1, y: 4, t: 'forest' }, { x: 2, y: 4, t: 'forest' }, { x: 3, y: 4, t: 'forest' },
    { x: 4, y: 4, t: 'forest' }, { x: 5, y: 4, t: 'forest' }, { x: 6, y: 4, t: 'forest' },
    { x: 7, y: 4, t: 'forest' },
    { x: 8, y: 4, t: 'wall' },
    { x: 4, y: 2, t: 'high' },
  ]),
  enemies: [
    // 两个弓手是这一关的压力来源：穿林要吃齐射，这才让「烧开」值得考虑。
    // 第四只用剑士而不是骑兵：骑兵会在玩家还在林带这侧时就绕过来贴脸，
    // 实测把胜率从 100% 直接压到 74%，取舍变成了「先处理侧袭」而不是「过不过林子」。
    forest('bow', 4, 2),
    // 第二个弓手退到最北排：林带本身已经让穿越慢一轮，两个弓手同时进射程时
    // 齐射会在玩家还陷在林子里时就打崩后排（实测 78%）。
    forest('bow', 2, 0),
    forest('sword', 6, 3),
    forestYoung('sword', 1, 1),
  ],
  aiDifficulty: 'normal',
};

/** 关 11：河道两处浅滩，滩口各一片林子当掩体；两翼影林狼包抄（隘口 + 反骑兵复习） */
const c2_4: StageBlueprint = {
  title: '涸河林隘',
  goldReward: 18,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 0, y: 5, t: 'river' }, { x: 1, y: 5, t: 'river' }, { x: 2, y: 5, t: 'river' },
    { x: 4, y: 5, t: 'river' },
    { x: 6, y: 5, t: 'river' }, { x: 7, y: 5, t: 'river' }, { x: 8, y: 5, t: 'river' },
    // 浅滩在 x=3 / x=5，滩口的林子是守方的便宜——烧掉它能把苔甲龟从掩体里赶出来
    { x: 3, y: 4, t: 'forest' }, { x: 5, y: 4, t: 'forest' },
    { x: 4, y: 3, t: 'high' },
  ]),
  enemies: [
    forest('shield', 3, 4),
    forest('bow', 4, 3),
    // 两翼骑兵摆在最北排：从 y=2 起手时它们第二轮就能贴上我方后排，
    // 玩家来不及在滩口列阵（实测 72%）。北移一行换来一个布防轮次。
    forest('cavalry', 1, 1),
    forestYoung('cavalry', 7, 1),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 12：精英猎长坐镇林间空地，两翼弓手 + 侧袭狼（Boss 前的综合考试）。
 *
 * 和第一章的百夫长一样**不带技能**、只靠面板压人。精英该考的是站位与集火，
 * 再叠一个技能会让这一关的失败原因变成「没看懂他那一招」。
 */
const c2_5: StageBlueprint = {
  title: '血牙猎长',
  goldReward: 20,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 4, y: 3, t: 'high' },
    { x: 2, y: 2, t: 'forest' }, { x: 6, y: 2, t: 'forest' },
    { x: 2, y: 6, t: 'forest' }, { x: 6, y: 6, t: 'forest' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 4, y: 3, uid: euid(),
      name: '猎长·图伦',
      animSet: 'bloodfang',
      // 上限在 235/27 附近：实测那一档胜率掉到 27%，比 Boss 还难。
      // 现在这档落在 ~75%，和推进关（86-93%）之间有肉眼可辨的台阶，
      // 又不至于变成第二个 Boss——精英关的作用是「该集火了」，不是卡关。
      stats: { maxHp: 235, atk: 25, spd: 6 },
    },
    forest('bow', 2, 2),
    forest('cavalry', 7, 4),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 13：Boss 血牙萨满踞守祭坛，四周环着松林——而他会**点燃自己脚下的林子**。
 *
 * 整章玩家都在用火烧掉敌人的掩体，这一关反过来：萨满的「燎原咒火」把
 * 玩家用来贴近的林子变成燃烧格，逼人离开掩体去打开阔地。
 * 所以这张图的林子刻意铺在通往高台的路上——那既是玩家想走的路，也是他的燃料。
 */
const c2_6: StageBlueprint = {
  title: '血牙萨满',
  goldReward: 26,
  terrain: withCells(withHighCells(emptyTerrain(9, 11), [{ x: 4, y: 2 }, { x: 4, y: 3 }]), [
    { x: 2, y: 3, t: 'wall' }, { x: 6, y: 3, t: 'wall' },
    // 通往高台的两条林道，也是萨满的燃料
    { x: 3, y: 5, t: 'forest' }, { x: 4, y: 5, t: 'forest' }, { x: 5, y: 5, t: 'forest' },
    { x: 1, y: 6, t: 'forest' }, { x: 7, y: 6, t: 'forest' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 4, y: 2, uid: euid(),
      name: '血牙萨满',
      boss: true,
      animSet: 'bloodfang',
      // Boss 节点还要再乘 1.1，所以这里写的数字上场时是 ~1.155 倍。
      //
      // 这一关调过三轮，值得记下来：拉低 Boss 的**攻击**几乎不动胜率（20→18 只从 4% 到 6.8%），
      // 因为这场仗输在**消耗赛**——实测双方每局输出 355 对 403，而我方总血 329、敌方总血 531，
      // 玩家是在打完对面之前先被磨光的。所以有效的旋钮是敌方**总血量**，不是单体攻击。
      stats: { maxHp: 235, atk: 18, spd: 6 },
      skillSkin: 'bloodfang_wildfire',
    },
    {
      // 护卫压到 120（标准 150）。第一章 Boss 关也把护卫压到了 128，同一个道理：
      // 标准盾卫只贡献 41 点伤害却带着 173 点血，它的作用全是拖长战斗，
      // 而战斗每多一轮，Boss 和弓手就多打一轮。血量高的坦克不会让 Boss 战更紧张，
      // 只会让它更长——那是两件不同的事。
      ...forest('shield', 4, 4),
      stats: { maxHp: 120 },
    },
    // 只留一个弓手。两个标准弓手在 Boss 缩放下各有 25 攻，一轮集火 50 点，
    // 而我方弓手满血 63——护卫阵容还没接上就先被点掉一个，那不是难度是抽签。
    forest('bow', 2, 2),
  ],
  isBoss: true,
  aiDifficulty: 'normal',
  maxDeploy: 4,
};

// ─── Chapter 3: 要塞攻防 ───
// 教学曲线：机关初见 → 闸门是捷径不是唯一路 → 开了门他们也出来 → 双闸取舍
//           → 精英城卫长 → Boss 城主。
//
// 这一章的主题是**地形可以被操作**。第一章的地形只能读（高地、森林），
// 第二章可以改写（点火烧掉林子），到这里第一次有了「开关」：站上机关，
// 下一轮闸门永久打开。整章反复问的是**什么时候开门**——
// 开门是为了进去，但开了他们也能出来，而按机关要押一个人一整回合。
//
// 一条硬约束（`stageIntegrity` 里有断言守着）：**每关不开闸门也要能打到所有敌人**。
// AI 不会主动去站机关，所以闸门若是唯一通路，托管和扫荡就会一直磨到回合上限。
// 这反过来定义了闸门的用法：它是捷径和优势，不是通行证。
//
// 敌人外观复用四兵种剪影（红 tint），不再用前两章的野生魔物：
// 这一章打的是**成建制的守军**，剪影从魔物换成士兵本身就是「这里不一样了」的信号。
// 叙事上接得住——血牙部族退到要塞后据城而守。

/**
 * 第三章守军：`UNIT_DEFS` 标准数值，外观走四兵种默认剪影。
 *
 * 不写 `animSet` 就是默认按兵种取图（敌方会自动加红 tint），
 * 所以这里只给名字。同样刻意不抄 `stats`——抄了就会和 `UNIT_DEFS` 走岔。
 */
export const CHAPTER3_GARRISON: Record<TroopKind, { name: string }> = {
  sword: { name: '血牙守卒' },
  bow: { name: '城头弓手' },
  cavalry: { name: '巡墙狼骑' },
  shield: { name: '闸门盾卫' },
};

function garrison(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return { defId, x, y, uid: euid(), name: CHAPTER3_GARRISON[defId].name };
}

/** 第三章的填充档位，同 `forestYoung`（七折面板），名字换成「新卒」 */
function garrisonGreen(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  const b = UNIT_DEFS[defId].base;
  return {
    defId, x, y, uid: euid(),
    name: `新募${CHAPTER3_GARRISON[defId].name.slice(-2)}`,
    stats: {
      maxHp: Math.round(b.maxHp * YOUNG_RATIO),
      atk: Math.round(b.atk * YOUNG_RATIO),
    },
  };
}

/**
 * 关 14：机关初见。
 *
 * 闸门只夹住一条中路窄道，两侧完全敞开——玩家不按机关也能绕过去打完，
 * 按了则少走四格。第一关要让「机关是干什么的」这件事零成本学会，
 * 所以代价压到最低：机关就在部署区抬脚可达的地方。
 */
const c3_1: StageBlueprint = {
  title: '闸门机关',
  goldReward: 18,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 3, y: 4, t: 'wall' }, { x: 5, y: 4, t: 'wall' },
    { x: 4, y: 4, t: 'gate_closed' },
    { x: 4, y: 7, t: 'lever' },
  ]),
  enemies: [
    garrison('sword', 4, 2),
    garrison('bow', 2, 1),
    garrison('sword', 6, 2),
    garrisonGreen('bow', 7, 1),
  ],
  aiDifficulty: 'easy',
};

/**
 * 关 15：闸门是捷径。
 *
 * 中路闸门后面就是弓手，绕行要多花两轮——而那两轮里弓手一直在射。
 * 这一关教的是「开门省下的不是路，是挨打的回合数」。
 */
const c3_2: StageBlueprint = {
  title: '瓮城窄道',
  goldReward: 20,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 2, y: 4, t: 'wall' }, { x: 3, y: 4, t: 'wall' },
    { x: 5, y: 4, t: 'wall' }, { x: 6, y: 4, t: 'wall' },
    { x: 4, y: 4, t: 'gate_closed' },
    { x: 7, y: 6, t: 'lever' },
    { x: 4, y: 2, t: 'high' },
  ]),
  enemies: [
    garrison('bow', 4, 2),
    garrison('sword', 3, 1),
    garrison('cavalry', 7, 2),
    garrison('shield', 4, 3),
    garrisonGreen('sword', 1, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 16：开了门他们也出来。
 *
 * 门后压着两个狼骑——机动最高的兵种。玩家如果一进场就去按机关，
 * 门开的那一轮狼骑直接冲进部署区；先清掉外面的再开门才是对的顺序。
 * 这是这一章「什么时候开门」这道题的第一次正式提问。
 */
const c3_3: StageBlueprint = {
  title: '放闸',
  goldReward: 22,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 3, y: 5, t: 'wall' }, { x: 4, y: 5, t: 'wall' },
    { x: 6, y: 5, t: 'wall' }, { x: 7, y: 5, t: 'wall' },
    { x: 5, y: 5, t: 'gate_closed' },
    { x: 1, y: 7, t: 'lever' },
    { x: 2, y: 3, t: 'forest' }, { x: 8, y: 3, t: 'forest' },
  ]),
  enemies: [
    // 门后的两个狼骑：不开门它们过不来，开门的那一轮它们就到脸上
    garrison('cavalry', 4, 3),
    garrison('cavalry', 6, 3),
    // 门外的守军，绕行路线上必须先处理掉
    garrison('sword', 1, 4),
    garrison('bow', 8, 4),
    garrison('shield', 5, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 17：两道闸门，一个机关。
 *
 * 机关是全开全关（`openGates` 一次开全场），所以这一关没法只开一边——
 * 开门就等于同时放开左右两条通道。取舍从「开不开」变成
 * 「我的阵型撑不撑得住两边同时来人」。
 */
const c3_4: StageBlueprint = {
  title: '双门齐落',
  goldReward: 22,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 1, y: 5, t: 'wall' }, { x: 3, y: 5, t: 'wall' },
    { x: 6, y: 5, t: 'wall' }, { x: 8, y: 5, t: 'wall' },
    { x: 2, y: 5, t: 'gate_closed' },
    { x: 7, y: 5, t: 'gate_closed' },
    { x: 5, y: 8, t: 'lever' },
    { x: 4, y: 4, t: 'high' }, { x: 5, y: 4, t: 'high' },
  ]),
  enemies: [
    garrison('shield', 4, 3),
    garrison('bow', 2, 2),
    garrison('sword', 7, 3),
    garrisonGreen('cavalry', 5, 1),
    garrisonGreen('bow', 8, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 18：精英 · 城卫长。
 *
 * 精英本体站在高地上，门后是弓手。这一关不给机关捷径的甜头——
 * 机关远在侧翼，去按的人这一轮完全脱离战线，所以多数打法是**不开门**硬啃。
 * 闸门在这里的作用是「一个你可以选择不用的选项」，精英关就该考清楚这个。
 */
const c3_5: StageBlueprint = {
  title: '城卫长',
  goldReward: 24,
  terrain: withCells(withHighCells(emptyTerrain(10, 11), [{ x: 4, y: 3 }, { x: 5, y: 3 }]), [
    { x: 3, y: 6, t: 'wall' }, { x: 4, y: 6, t: 'wall' },
    { x: 6, y: 6, t: 'wall' }, { x: 7, y: 6, t: 'wall' },
    { x: 5, y: 6, t: 'gate_closed' },
    { x: 0, y: 8, t: 'lever' },
  ]),
  enemies: [
    {
      ...garrison('sword', 4, 3),
      name: '血牙城卫长',
      stats: { maxHp: 250, atk: 26 },
    },
    garrison('bow', 6, 2),
    garrison('shield', 5, 5),
    garrisonGreen('sword', 2, 4),
  ],
  aiDifficulty: 'normal',
  maxDeploy: 4,
};

/**
 * 关 19：Boss · 血牙城主。
 *
 * 城主会放「破阵冲撞」——和玩家在这一章商店里买的「撞城槌」同一个形状。
 * 这是整章最后一课：玩家学了一路「直线穿透吃走廊的对齐」，
 * 而闸门通道会把自己也排成一列。**走廊对双方都成立。**
 *
 * 数值沿用前两章 Boss 那条实测结论——有效旋钮是敌方总血量而不是 Boss 的攻击，
 * 所以盾卫的血在这里显式压到 95（同第一二章的做法），免得它把战线拖到弓手打够本。
 *
 * 这一关的数值是**按四人上阵**标定的（关卡 `maxDeploy` 就是 4），和前两章按三人标定的
 * Boss 不是同一把尺子——两章的 Boss 用四人打其实是 78% / 91%。整套口径的统一
 * 见 `docs/玩法重设计.md` 的待办，那件事要等角色/等级/技能扩完再一起做。
 *
 * 调参时踩到的两条坑，写下来免得下次重走：
 *   - **Boss 攻击调高会同时压低裸打和带药胜率**。血 235 时攻 22/28/31 对应裸打
 *     72.7%/56.7%/41.3%、带 2 药 94.7%/75.3%/63.0%——单位被一轮打死之后治疗补不回来，
 *     所以攻击不是「难度」旋钮，是「把药废掉」旋钮。
 *   - **药的边际价值随战斗长度衰减**。第二章 8.9 回合时两瓶药值 +75pp，
 *     这一关拉到 11 回合就只值 +30pp。想让「备药能过」成立，仗必须短。
 */
const c3_6: StageBlueprint = {
  title: '血牙城主',
  goldReward: 28,
  terrain: withCells(withHighCells(emptyTerrain(10, 11), [{ x: 4, y: 2 }, { x: 5, y: 2 }]), [
    { x: 2, y: 6, t: 'wall' }, { x: 3, y: 6, t: 'wall' },
    { x: 6, y: 6, t: 'wall' }, { x: 7, y: 6, t: 'wall' },
    { x: 4, y: 6, t: 'gate_closed' }, { x: 5, y: 6, t: 'gate_closed' },
    { x: 9, y: 8, t: 'lever' },
  ]),
  enemies: [
    {
      ...garrison('sword', 4, 2),
      name: '血牙城主',
      boss: true,
      animSet: 'bloodfang',
      stats: { maxHp: 210, atk: 24, spd: 6 },
      skillSkin: 'bloodfang_breach',
    },
    {
      ...garrison('shield', 5, 4),
      stats: { maxHp: 95 },
    },
    garrison('bow', 2, 2),
  ],
  isBoss: true,
  aiDifficulty: 'normal',
  maxDeploy: 4,
};

// ─── Chapter 4: 沼泽战 ───

const c4_1: StageBlueprint = {
  title: '沼泽初遇',
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

const c4_2: StageBlueprint = {
  title: '毒沼围困',
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

const c4_3: StageBlueprint = {
  title: '沼泽渡河',
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

const c4_4: StageBlueprint = {
  title: '迷雾沼泽',
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

const c4_5: StageBlueprint = {
  title: '沼泽 Boss',
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

// ─── Chapter 5: 龙岭战 ───

const c5_1: StageBlueprint = {
  title: '悬崖之战',
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

const c5_2: StageBlueprint = {
  title: '龙岭隘口',
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

const c5_3: StageBlueprint = {
  title: '火山裂谷',
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

const c5_4: StageBlueprint = {
  title: '龙脊峰',
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

const c5_5: StageBlueprint = {
  title: '龙王',
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

/**
 * 章节 → 关卡，顺序即游戏顺序。这是关卡编号与章节归属的**唯一来源**。
 *
 * 第 i 章对应 `DUNGEON_DEFS[i]`（`stageIntegrity` 校验两边章数一致）。
 *
 * 关卡常量一律用**章内编号** `c<章>_<章内第几关>`，不要用全局序号（`s17` 那种）。
 * 全局序号看着直观，但往中间任何一章插一关，后面所有章的变量名都得跟着挪——
 * 第三章从 5 关加到 6 关时就撞上了这个：新的 Boss 关和原第四章第一关都叫 `s19`。
 * 关卡的**展示序号**由这张表的位置推导（见下面的 `STAGES_MVP`），
 * 所以变量名不承担编号职责，它只需要说清「这是第几章的第几关」。
 */
const CHAPTERS: StageBlueprint[][] = [
  [c1_1, c1_2, c1_3, c1_4, c1_5, c1_6, c1_7],
  [c2_1, c2_2, c2_3, c2_4, c2_5, c2_6],
  [c3_1, c3_2, c3_3, c3_4, c3_5, c3_6],
  [c4_1, c4_2, c4_3, c4_4, c4_5],
  [c5_1, c5_2, c5_3, c5_4, c5_5],
];

export const STAGES_MVP: StageDefMvp[] = CHAPTERS.flat().map(({ title, ...rest }, i) => ({
  id: i + 1,
  name: `第 ${i + 1} 关 · ${title}`,
  ...rest,
}));

/**
 * 每章占用的 `STAGES_MVP` 下标，供 `dungeonCatalog` 组装节点。
 *
 * 章节的关卡数变了，这里跟着变，不需要谁去同步下标数组。
 */
export const CHAPTER_STAGE_INDICES: readonly (readonly number[])[] = (() => {
  let next = 0;
  return CHAPTERS.map((stages) => stages.map(() => next++));
})();
