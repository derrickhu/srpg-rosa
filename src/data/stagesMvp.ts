import type { TerrainId, UnitKind } from '@/battle/types';
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
const s1: StageBlueprint = {
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
const s2: StageBlueprint = {
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
const s3: StageBlueprint = {
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
const s4: StageBlueprint = {
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
const s5: StageBlueprint = {
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
const s6: StageBlueprint = {
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
const s7: StageBlueprint = {
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
export const CHAPTER2_FOREST: Record<UnitKind, { name: string; animSet: string }> = {
  sword: { name: '树脂黏泥', animSet: 'slime' },
  bow: { name: '毒伞菇', animSet: 'sporecap' },
  cavalry: { name: '影林狼', animSet: 'bloodwolf' },
  shield: { name: '苔甲龟', animSet: 'rockshell' },
};

function forest(defId: UnitKind, x: number, y: number): StageEnemySpawn {
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
function forestYoung(defId: UnitKind, x: number, y: number): StageEnemySpawn {
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
const s8: StageBlueprint = {
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
const s9: StageBlueprint = {
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
const s10: StageBlueprint = {
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
const s11: StageBlueprint = {
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
const s12: StageBlueprint = {
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
const s13: StageBlueprint = {
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

// ─── Chapter 3: 要塞战 ───

const s14: StageBlueprint = {
  title: '城墙阻隔',
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

const s15: StageBlueprint = {
  title: '高地争夺',
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

const s16: StageBlueprint = {
  title: '双面夹攻',
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

const s17: StageBlueprint = {
  title: '城门攻防',
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

const s18: StageBlueprint = {
  title: '要塞 Boss',
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

// ─── Chapter 4: 沼泽战 ───

const s19: StageBlueprint = {
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

const s20: StageBlueprint = {
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

const s21: StageBlueprint = {
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

const s22: StageBlueprint = {
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

const s23: StageBlueprint = {
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

const s24: StageBlueprint = {
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

const s25: StageBlueprint = {
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

const s26: StageBlueprint = {
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

const s27: StageBlueprint = {
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

const s28: StageBlueprint = {
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
 */
const CHAPTERS: StageBlueprint[][] = [
  [s1, s2, s3, s4, s5, s6, s7],
  [s8, s9, s10, s11, s12, s13],
  [s14, s15, s16, s17, s18],
  [s19, s20, s21, s22, s23],
  [s24, s25, s26, s27, s28],
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
