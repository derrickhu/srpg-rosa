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
 * 29 关手写数据里这种错肉眼几乎查不出来，交给编译器抓。
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 章节投放曲线（这份表的总纲，改任何一章前先读这里）
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 一条硬规矩：**每章只新增 1~2 种地形，且一章一个动词。**
 *
 * 这条规矩是补出来的。原先第一章七关一次铺开高地、森林、河流、城墙四种地形
 * 加四个临时技能，节点数 10 个——是全游戏最长的一章，而它本该是教学章。
 * 后面几章反而越来越短（8/8/7/7），曲线是倒的：玩家在最不懂的时候承受最大信息量，
 * 学会之后反而没有新东西。
 *
 * 现在的分布：
 *
 * | 章 | 关数 | 节点 | 新地形 | 这一章教的动词 |
 * |---|---:|---:|---|---|
 * | 1 草原战线 | 4 |  5 | 高地 | 站上去打得更疼 |
 * | 2 密林深处 | 5 |  7 | 森林、燃烧 | 掩体对双方都生效，而且能烧 |
 * | 3 要塞攻防 | 6 |  8 | 城墙、机关/闸门 | 地形挡视线，而且可以被操作 |
 * | 4 毒沼泥潭 | 7 | 10 | 河流、沼泽 | 走得慢、打得软、还掉血 |
 * | 5 龙岭绝巅 | 7 | 10 | 深渊 | 绝壁切断路线但不挡箭 |
 *
 * 节点数由 `dungeonCatalog.buildNodes` 从关数推出（每两场战斗插一个补给点），
 * 4/5/6/7/7 关正好对应 5/7/8/10/10 个节点——**10 是上限**，再多一局就疲劳。
 *
 * 推论：一关只能用**它所在章节及更早**登场过的地形。想给第四章的图摆一堵墙可以
 * （城墙第三章就登场了），想给第二章的图摆一条河不行。地形券的售卖章节同理，
 * 见 `dungeonCatalog` 的商店池。
 */

// ─── Chapter 1: 草原战线 · 高地 ───
//
// 四关：接触战 → 远程威胁 → 精英围剿 → Boss。**整章只有平原和高地。**
//
// 玩家要学的就三件事：怎么移动、站高地为什么打得更疼、怎么集火。
// 每张图都给一对可争夺的缓丘，四关反复问同一个问题——这个丘归谁。
// 森林/河流/城墙都推到后面章节，因为它们各自是另一个动词，
// 而第一次上手的人分不清「这格让我更耐打」和「这格让我打得更疼」。
//
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
  terrain: withHighCells(emptyTerrain(7, 8), [{ x: 2, y: 5 }, { x: 4, y: 5 }]),
  enemies: [
    rookie('sword', 2, 1),
    rookie('sword', 4, 2),
  ],
  aiDifficulty: 'easy',
  maxDeploy: 2,
};

/**
 * 关 2：高台弓手 + 护卫，中场一对缓丘（教远程威胁，以及「抢丘对射」这个解法）。
 *
 * 原版这里铺了四片森林当掩体。掩体是第二章的答案，放在这里等于同一关里
 * 抛出两个新概念，而玩家连高地都还没用熟。现在把那四格换成两块中场高地：
 * 问题（弓手站在高处打你）和解法（你也上去）用的是同一条规则。
 */
const c1_2: StageBlueprint = {
  title: '猎手小径',
  goldReward: 10,
  terrain: withHighCells(emptyTerrain(8, 9), [
    { x: 4, y: 1 },
    { x: 2, y: 4 }, { x: 5, y: 4 },
  ]),
  enemies: [
    rookie('bow', 4, 1),
    rookie('bow', 2, 2),
    rookie('sword', 5, 2),
  ],
  aiDifficulty: 'easy',
};

/** 关 3：精英百夫长坐镇中央缓丘，弓手两翼 + 骑兵侧袭（Boss 前的综合考试） */
const c1_3: StageBlueprint = {
  title: '前哨围剿',
  goldReward: 18,
  terrain: withHighCells(emptyTerrain(9, 10), [
    { x: 4, y: 3 },
    // 两翼缓丘换掉了原来的两片森林：玩家要么抢丘对射，要么绕侧翼贴上去
    { x: 2, y: 5 }, { x: 6, y: 5 },
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

/**
 * 关 4：Boss 血牙酋长踞守祭坛高台（血牙咆哮 = savage_roar AoE+自强化）。
 *
 * 原版这张图在高台两侧摆了城墙、在南侧铺了四片森林。城墙和森林都推到后面章节了，
 * 换成祭坛前的两块缓丘——玩家仍然有「先占位再压上去」的中继点，
 * 但这一关考的仍然是第一章教的那一件事，不夹带新规则。
 */
const c1_4: StageBlueprint = {
  title: '血牙酋长',
  goldReward: 24,
  terrain: withHighCells(emptyTerrain(9, 11), [
    { x: 4, y: 2 }, { x: 4, y: 3 },
    { x: 3, y: 7 }, { x: 5, y: 7 },
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

// ─── Chapter 2: 密林深处 · 森林 + 燃烧 ───
//
// 五关：林中伏击 → 骑兵包抄 → 松脂林道（可点燃） → 精英猎长 → Boss 萨满。
//
// 这一章的主题是**林子有两面**：它给站在上面的人减伤，所以既是玩家的掩体，
// 也是敌人的掩体；而它还能烧。整章反复问同一个问题——这片林子现在
// 对谁更有利，要不要一把火烧掉它。商店卖森林券和「松脂火把」正是为此配套，
// Boss 则反过来烧玩家脚下的林子，把这一课收尾。
//
// 燃烧算在森林名下、不单独占一章：它是森林的**转移边**而不是一个要背的新规则
// （见 `terrainSpec` 的地形设计契约）。玩家放一发火、看到林子烧起来，这条就学会了。
//
// 杂兵换成**本章专属的四只腐生植物**（藤缚茧/喷孢囊/林影豹/苔石像），数值**回到标准**。
// 沿用第一章立下的读图规矩：野生魔物是杂兵，血牙部族是精英与 Boss——
// 剪影本身就是「这个不好惹」的信号。第一章打散的血牙残部退入密林，
// 精英/Boss 走血牙部族的外观在叙事上也接得上。
//
// 剪影语法和第一章一一对应（圆滚/宽伞/横长/穹顶 = sword/bow/cavalry/shield），
// 换的只是题材与配色。玩家已经学过一遍这套对应关系，每章重学一遍是不划算的，
// 设计依据见 docs/敌人图鉴.md §1.1。

/**
 * 一章四只杂兵的模板。第二至五章共用这个形状，第一章不走这条路（它的四只带弱化数值）。
 *
 * `skillId` 是**杂兵技能的投放口径**：技能挂在**怪种**上而不是关卡上，
 * 所以同一只怪在这一章的每一关都是同样的威胁。挂在关卡上迟早会出现
 * 「第 17 关的吹箭虫会下毒、第 18 关的不会」，而玩家只会觉得这游戏的怪不讲道理。
 *
 * 投放曲线（第一章 0 条 → 第二、三章各 1 条 → 第四章 2 条 → 终章 4 条）
 * 和技能本身的设计依据都在 `skillCatalog` 的杂兵技能段落。
 */
export interface MookTemplate {
  name: string;
  /** 七折填充档的名字。第三章走 `garrisonGreen` 自己拼前缀，不用这个字段 */
  youngName?: string;
  animSet: string;
  /** 底层 `SkillSpec` id（`enemyOnly`）。缺省 = 只普攻 */
  skillId?: string;
}

function mook(t: MookTemplate, defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return {
    defId, x, y, uid: euid(),
    name: t.name,
    animSet: t.animSet,
    ...(t.skillId ? { skillId: t.skillId } : {}),
  };
}

/** 幼体的面板比例。0.7 是实测出来的档位，理由见 `mookYoung` */
const YOUNG_RATIO = 0.7;

/**
 * 七折填充档（幼体 / 新募）。
 *
 * 为什么需要这个档位：一只标准杂兵的存在感太大了。实测在同一张图上加减一只整兵，
 * 胜率会在 ~100% 和 ~75% 之间跳——中间没有档位可选，于是每一关只能在
 * 「毫无压力」和「比精英关还难」之间二选一。幼体让「场面上多一个威胁、
 * 但不多一份完整输出」成为可能，这是排推进关曲线时唯一缺的那块积木。
 *
 * 面板从 `UNIT_DEFS` 现算而不是手抄七折后的数字：抄下来就会和基准走岔，
 * 而走岔的表现只是「这只怪好像有点软」。
 *
 * **幼体不继承 `skillId`**，出于同一个理由：给它技能就把这块积木变回了整兵，
 * 而整兵和没有之间正是当初缺档位的那个跳变。
 */
function mookYoung(t: MookTemplate, defId: TroopKind, x: number, y: number): StageEnemySpawn {
  const b = UNIT_DEFS[defId].base;
  return {
    defId, x, y, uid: euid(),
    name: t.youngName ?? t.name,
    animSet: t.animSet,
    stats: {
      maxHp: Math.round(b.maxHp * YOUNG_RATIO),
      atk: Math.round(b.atk * YOUNG_RATIO),
    },
  };
}

/**
 * 第二章杂兵：和第一章同种魔物，但**回到 `UNIT_DEFS` 标准数值**。
 *
 * 第一章那批是打了约 78 折的弱化新兵（好让 1 级首通阵容打得过），
 * 这里不写 `stats` 就是标准值。刻意不抄一份数字进来：抄了就会和
 * `UNIT_DEFS` 走岔，而走岔的表现只是「第二章怪莫名变软」，没人查得出来。
 */
export const CHAPTER2_FOREST: Record<TroopKind, MookTemplate> = {
  sword: { name: '藤缚茧', youngName: '幼藤茧', animSet: 'vinecocoon' },
  // 全游戏第一个会出手的杂兵。挑弓手位是因为它站后排最容易被忽略，
  // 而中了毒必须回头处理——这一下教的是「后排也是威胁」
  bow: { name: '喷孢囊', youngName: '幼孢囊', animSet: 'sporesac', skillId: 'spore_spray' },
  cavalry: { name: '林影豹', youngName: '幼影豹', animSet: 'leafpanther' },
  // 石像没有幼体，所以弱化档走「残」而不是「幼」——`幼苔石像` 读不通
  shield: { name: '苔石像', youngName: '残石像', animSet: 'mosswarden' },
};

function forest(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mook(CHAPTER2_FOREST[defId], defId, x, y);
}

/** 第二章填充杂兵：同种魔物的幼体，约七折面板 */
function forestYoung(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mookYoung(CHAPTER2_FOREST[defId], defId, x, y);
}

/** 关 5：敌人躲在林子里打（教「掩体对双方都生效」，也是森林的首次登场） */
const c2_1: StageBlueprint = {
  title: '藤蔓小径',
  goldReward: 14,
  // 9x10 而不是更紧凑的 8x9：四只标准杂兵在小图上会同时贴上来，实测胜率掉到 55%——
  // 一章的开场关不该是全章最难的推进关。多两行接近距离就把节奏还回来了。
  terrain: withCells(emptyTerrain(9, 10), [
    // 两片林子都在敌人脚下：玩家第一次体会到减伤打在自己脸上
    { x: 2, y: 2, t: 'forest' }, { x: 3, y: 2, t: 'forest' },
    { x: 5, y: 3, t: 'forest' }, { x: 6, y: 3, t: 'forest' },
    // 玩家侧双高地：不烧林子也有正面解法（站高地吃增伤对冲减伤）
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
 * 关 6：开阔地两翼骑兵包抄 + 后排弓手（教集火与反骑兵）。
 *
 * 这一关原本排在第一章第四位，那时敌人是七折的弱化新兵。挪到这里之后敌人换成
 * 标准数值的密林魔物——同一张图，压力来自面板而不是重新摆位。
 * 中场那对高地和两翼的林子给玩家两种应对：抢丘对射，或者退进林子拖一轮。
 */
const c2_2: StageBlueprint = {
  title: '骑兵突袭',
  goldReward: 15,
  terrain: withCells(emptyTerrain(8, 9), [
    { x: 3, y: 5, t: 'high' }, { x: 4, y: 5, t: 'high' },
    { x: 0, y: 3, t: 'forest' }, { x: 7, y: 3, t: 'forest' },
  ]),
  enemies: [
    forest('cavalry', 1, 1),
    forest('cavalry', 6, 1),
    forest('bow', 4, 0),
    // 三只时实测 100%、4.9 回合——两翼骑兵一头撞进阵型就没了，包抄根本没成形。
    // 第四只用幼体剑士补在后排：多一个要处理的目标，但不多一份完整输出。
    forestYoung('sword', 4, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 7：一整条松林带横断战场——想过去只能穿林，或者先烧开。
 *
 * 排在第一个补给点之后，玩家此时刚买得到「松脂火把」。烧不烧都能过：
 * 穿林要吃两个弓手一轮齐射（林带移动消耗 2，慢一轮），烧开则要接受林子没了、
 * 自己也失去掩体，而且燃烧格本身会掉血。这一关就是把那个取舍摆到台面上。
 *
 * 林带铺满整行（原版两端是城墙）。城墙是第三章的地形，而它在这里的作用只是
 * 「别从边上绕过去」——那件事让林子自己做更好：绕不开，但可以穿，也可以烧。
 */
const c2_3: StageBlueprint = {
  title: '松脂林道',
  goldReward: 16,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 0, y: 4, t: 'forest' }, { x: 1, y: 4, t: 'forest' }, { x: 2, y: 4, t: 'forest' },
    { x: 3, y: 4, t: 'forest' }, { x: 4, y: 4, t: 'forest' }, { x: 5, y: 4, t: 'forest' },
    { x: 6, y: 4, t: 'forest' }, { x: 7, y: 4, t: 'forest' }, { x: 8, y: 4, t: 'forest' },
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

/**
 * 关 8：精英猎长坐镇林间空地，两翼弓手 + 侧袭狼（Boss 前的综合考试）。
 *
 * 和第一章的百夫长一样**不带技能**、只靠面板压人。精英该考的是站位与集火，
 * 再叠一个技能会让这一关的失败原因变成「没看懂他那一招」。
 */
const c2_4: StageBlueprint = {
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
      animSet: 'torun',
      // 现在这档落在 ~70%，和推进关（84-92%）之间有肉眼可辨的台阶，
      // 又不至于变成第二个 Boss——精英关的作用是「该集火了」，不是卡关。
      //
      // 这一格极度敏感，扫出来的实测值记在这里，免得下次又靠外推。
      // 前一列是这一章的弓手位还没有技能时测的，后一列是喷孢囊拿到「孢子喷散」之后：
      //   235/27 → 27%（比 Boss 还难）  235/25 → 60%  230/25 → ~70% → 加技能后 51%
      //   225/24 → 80% → 加技能后 ~65%
      // 5 点血 + 1 点攻能动 20pp，因为这场仗输赢卡在「要不要多补一刀」这个取整断点上
      // （同 `c1_4` 的注释）。所以**动完必须重跑 `chapter2Sim`**，线性外推一定错。
      //
      // 这一关场上有一只喷孢囊，它的毒等于给猎长白送两轮输出。降面板买回来的是
      // 那两轮，不是难度——精英关的定位仍然是「该集火了」。
      stats: { maxHp: 225, atk: 24, spd: 6 },
    },
    forest('bow', 2, 2),
    forest('cavalry', 7, 4),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 9：Boss 血牙萨满踞守祭坛，四周环着松林——而他会**点燃自己脚下的林子**。
 *
 * 整章玩家都在用火烧掉敌人的掩体，这一关反过来：萨满的「燎原咒火」把
 * 玩家用来贴近的林子变成燃烧格，逼人离开掩体去打开阔地。
 * 所以这张图的林子刻意铺在通往高台的路上——那既是玩家想走的路，也是他的燃料。
 *
 * 原版高台两侧有两堵城墙。城墙第三章才登场，去掉之后高台变得更好包夹，
 * 但这一关真正的压力从来不是「够不够得着他」，而是脚下的林子会不会烧起来。
 */
const c2_5: StageBlueprint = {
  title: '血牙萨满',
  goldReward: 26,
  terrain: withCells(withHighCells(emptyTerrain(9, 11), [{ x: 4, y: 2 }, { x: 4, y: 3 }]), [
    // 通往高台的两条林道，也是萨满的燃料
    { x: 3, y: 5, t: 'forest' }, { x: 4, y: 5, t: 'forest' }, { x: 5, y: 5, t: 'forest' },
    { x: 1, y: 6, t: 'forest' }, { x: 7, y: 6, t: 'forest' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 4, y: 2, uid: euid(),
      name: '血牙萨满',
      boss: true,
      // 骨角冠 + 法杖 + 佝偻长袍，和酋长同部族但三个识别位全换。
      // 原先这里和第一、三章 Boss 共用 `bloodfang` 一张图。
      animSet: 'bloodshaman',
      // Boss 节点还要再乘 1.1，所以这里写的数字上场时是 ~1.155 倍。
      //
      // 这一关调过三轮，值得记下来：拉低 Boss 的**攻击**几乎不动胜率（20→18 只从 4% 到 6.8%），
      // 因为这场仗输在**消耗赛**——实测双方每局输出 355 对 403，而我方总血 329、敌方总血 531，
      // 玩家是在打完对面之前先被磨光的。所以有效的旋钮是敌方**总血量**，不是单体攻击。
      //
      // 235 → 212 是第四轮：第一章缩短后玩家进这一章少一点精华，235 血时
      // 「带两瓶药」实测只有 87.5%，离 85% 的下界 2.5pp——比这套测试自己的
      // 抽样标准差（~1.5pp）还小，等于没有断言。降血是为了买回余量，不是为了让它变简单。
      stats: { maxHp: 212, atk: 18, spd: 6 },
      skillSkin: 'bloodfang_wildfire',
    },
    {
      // 护卫压到 120（标准 150）。第一章 Boss 关也把护卫压到了 104，同一个道理：
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

// ─── Chapter 3: 要塞攻防 · 城墙 + 机关/闸门 ───
//
// 六关：城墙初见 → 墙断视线 → 机关初见 → 什么时候开门 → 精英城卫长 → Boss 城主。
//
// 这一章有两个动词，但它们是同一件事的两半：**墙是不能动的地形，闸门是能动的墙**。
// 先用两关把「墙挡路、墙也挡箭」教明白（前两章的地形全都不挡视线），
// 再引入机关——站上去，下一轮全场闸门永久打开。整章反复问的是**什么时候开门**：
// 开门是为了进去，但开了他们也能出来，而按机关要押一个人一整回合。
//
// 一条硬约束（`stageIntegrity` 里有断言守着）：**每关不开闸门也要能打到所有敌人**。
// AI 不会主动去站机关（那是玩家的决定，见 `terrainSpec` 的机关契约），
// 所以如果一关的敌人只能穿过闸门才能打到，托管和扫荡就会一直磨到回合上限。
// 这反过来定义了闸门的用法：它是捷径和优势，不是通行证。
//
// 敌人外观换成**本章专属的兽人守军**，不再用前两章的野生魔物：
// 这一章打的是**成建制的守军**，剪影从魔物换成士兵本身就是「这里不一样了」的信号。
// 叙事上接得住——血牙部族退到要塞后据城而守。
//
// 这是全五章唯一的人形敌人，也是唯一需要按严格口径算配色的一章（人形对人形，
// 形状不再自动把话说完）。绿皮 + 暗铁是统一色，区分靠剪影 + 一个饰色，
// 钢青被明确排除——它撞我方盾卫。推演见 docs/敌人图鉴.md §2 第 3 章。

/**
 * 第三章守军：`UNIT_DEFS` 标准数值，**本章专属的兽人守军外观**。
 *
 * 刻意不抄 `stats`——抄了就会和 `UNIT_DEFS` 走岔。
 *
 * 这一章是全五章唯一的**人形**敌人。它故意打破「敌方非人形」这条读图规矩
 * （圣经 §4.2），因为这一章教的就是「你在打一支有建制的军队」，而建制感只有人形能给。
 * 代价是配色必须按严格口径和我方四职业逐个算——细节见 docs/敌人图鉴.md §2 第 3 章。
 *
 * 也因为是人形，它们**不进 `MOOK_ART_SETS`**：按英雄身高渲染，读成一支对等的正规军。
 */
export const CHAPTER3_GARRISON: Record<TroopKind, MookTemplate> = {
  sword: { name: '血牙守卒', animSet: 'fangtrooper' },
  bow: { name: '城头弩手', animSet: 'wallbalist' },
  // 这一章唯一会出手的杂兵。「撞阵」要隔一格才够得着，贴脸反而不行——
  // 这一章教的是墙和闸门，全是空间题，所以它的技能也该是空间题
  cavalry: { name: '巡墙狼骑', animSet: 'wallrider', skillId: 'wall_ram' },
  shield: { name: '闸门盾卫', animSet: 'gatewarden' },
};

function garrison(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mook(CHAPTER3_GARRISON[defId], defId, x, y);
}

/** 第三章的填充档位，同 `mookYoung`，但名字是「新募X」而不是「幼X」——守军没有幼体 */
function garrisonGreen(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  const t = CHAPTER3_GARRISON[defId];
  return mookYoung({ ...t, youngName: `新募${t.name.slice(-2)}` }, defId, x, y);
}

/**
 * 关 10：城墙初见。北部三连高台弓阵 + 中门盾卫，两侧城墙不可通行，必须仰攻中路。
 *
 * 这一关原本是第一章第五关。挪到这里是因为它教的其实是城墙：
 * 两堵墙把战场收窄成一条中路，玩家第一次遇到「这条路不能走」。
 * 敌人换成成建制守军的标准数值，压力从「新兵」抬到这一章的基线。
 */
const c3_1: StageBlueprint = {
  title: '高地弓阵',
  goldReward: 18,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 3, y: 2, t: 'high' }, { x: 4, y: 2, t: 'high' }, { x: 5, y: 2, t: 'high' },
    { x: 2, y: 3, t: 'wall' }, { x: 6, y: 3, t: 'wall' },
    { x: 3, y: 6, t: 'forest' }, { x: 5, y: 6, t: 'forest' },
  ]),
  enemies: [
    garrison('bow', 3, 2),
    garrison('bow', 5, 2),
    garrison('shield', 4, 3),
    // 三只时实测 100%、5.7 回合：两堵墙把路收窄之后，弓手的射界反而只覆盖中路，
    // 玩家贴着墙走上去就赢了。加一个新募狼骑绕侧翼，让「收窄」变成代价而不是保护。
    garrisonGreen('cavalry', 7, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 11：一道横墙只留三个豁口，墙后的弓手看不见墙这侧。
 *
 * 这是全游戏第一关**必须读视线**的图：贴着墙走能安全推进到豁口边，
 * 从空地直接横穿则会同时吃到两个弓手。墙挡视线是前两章的地形都没有的性质
 * （森林减伤但不挡箭），所以紧跟着城墙初见排一关专门把它教明白。
 */
const c3_2: StageBlueprint = {
  title: '哨塔盲角',
  goldReward: 19,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 1, y: 4, t: 'wall' }, { x: 2, y: 4, t: 'wall' }, { x: 3, y: 4, t: 'wall' },
    { x: 5, y: 4, t: 'wall' }, { x: 6, y: 4, t: 'wall' }, { x: 7, y: 4, t: 'wall' },
    // 中路豁口正上方的高地：唯一能俯射中路的位置，也是玩家该抢的目标
    { x: 4, y: 2, t: 'high' },
    { x: 0, y: 6, t: 'forest' }, { x: 8, y: 6, t: 'forest' },
  ]),
  enemies: [
    garrison('bow', 4, 2),
    // 躲在墙后：玩家没进豁口前它射不到人，进了才成为威胁
    garrison('bow', 2, 3),
    garrison('shield', 4, 3),
    garrison('cavalry', 6, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 12：机关初见。
 *
 * 闸门只夹住一条中路窄道，两侧完全敞开——玩家不按机关也能绕过去打完，
 * 按了则少走四格。第一关要让「机关是干什么的」这件事零成本学会，
 * 所以代价压到最低：机关就在部署区抬脚可达的地方。
 */
const c3_3: StageBlueprint = {
  title: '闸门机关',
  goldReward: 20,
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
 * 关 13：开了门他们也出来。
 *
 * 门后压着两个狼骑——机动最高的兵种。玩家如果一进场就去按机关，
 * 门开的那一轮狼骑直接冲进部署区；先清掉外面的再开门才是对的顺序。
 * 这是这一章「什么时候开门」这道题的正式提问。
 */
const c3_4: StageBlueprint = {
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
    // 门后的两个狼骑：不开门它们过不来，开门的那一轮它们就到脸上。
    //
    // 两个都保留「撞阵」，第二个只掉一点血量。这里试过两个更粗的改法，都**过头**了：
    // 把它降到新募档（七折、且不继承技能）或者把门外弓手降到新募档，
    // 两者都把胜率从 73.6% 抬到 93%——比加技能之前的 ~75% 还松，
    // 这一关就不再是「什么时候开门」的考试了。
    //
    // 这一关和 `c2_4`、`c1_4` 一样卡在取整断点上，一个整兵的存在感就是 20pp，
    // 所以只能用显式面板做细旋钮。90 → 78 血（不动攻击）刚好买回那 2pp。
    // **动完必须重跑 `chapter3Sim`**，别线性外推。
    garrison('cavalry', 4, 3),
    { ...garrison('cavalry', 6, 3), stats: { maxHp: 78 } },
    // 门外的守军，绕行路线上必须先处理掉
    garrison('sword', 1, 4),
    garrison('bow', 8, 4),
    // 盾卫降到新募档（七折面板）。五只标准守军实测 69%、9.8 回合——
    // 卡关的原因不是这一关难，是它**长**：盾卫 173 点血只换来 41 点输出，
    // 拖出来的每一轮都让弓手和门后的狼骑多打一次。
    garrisonGreen('shield', 5, 2),
  ],
  aiDifficulty: 'normal',
};

/**
 * 关 14：精英 · 城卫长。
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
      // 覆盖掉 garrison 给的守卒外观：这一章杂兵也是人形兽人，精英必须自己有脸，
      // 否则「该集火了」这个信号只能靠血条读出来。金肩甲 + 独眼是他的识别点。
      animSet: 'castellan',
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
 * 关 15：Boss · 血牙城主。
 *
 * 城主会放「破阵冲撞」——和玩家在这一章商店里买的「撞城槌」同一个形状。
 * 这是整章最后一课：玩家学了一路「直线穿透吃走廊的对齐」，
 * 而闸门通道会把自己也排成一列。**走廊对双方都成立。**
 *
 * 数值沿用前两章 Boss 那条实测结论——有效旋钮是敌方总血量而不是 Boss 的攻击，
 * 所以盾卫的血在这里显式压到 95（同前两章的做法），免得它把战线拖到弓手打够本。
 *
 * 这一关的数值是**按四人上阵**标定的（关卡 `maxDeploy` 就是 4），和前两章按三人标定的
 * Boss 不是同一把尺子——那两章的 Boss 用四人打其实是 78% / 91%。整套口径的统一
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
      // 方形攻城盔 + 方肩甲 + 塔盾，全表最重的剪影，和这一章的钢青守军同色系。
      animSet: 'bloodcastellan',
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

// ─── Chapter 4: 毒沼泥潭 · 河流 + 沼泽 ───
//
// 七关：河道隘口 → 浅滩林隘 → 沼泽初见 → 毒沼围困 → 全宽河道 → 迷雾沼泽 → Boss。
//
// 这一章的两种地形是同一个动词的两个强度：**地形本身在削你**。
// 河流让人走得慢（消耗 3）、打得软（攻击 ×0.8），沼泽在此之上每回合还掉 5 血。
// 前三章的地形都是「站对了有便宜」，这一章第一次出现「站错了持续付账」，
// 所以商店池在这里转向续航（草药敷治、树皮庇护、攻城战旗、战场祝福）。
//
// 这也是节点数第一次到 10 的一章。前三章 5/7/8 个节点是在教东西，
// 到这里玩家该学的地形已经齐了，可以开始要求耐力。
//
// 敌人换成**本章专属的四只沼生节肢**。它们的共同特点是「叠加持续伤害」：
// 地形每回合扣血，怪再补一层毒，这一章第一次让玩家真的去算续航。

/**
 * 第四章杂兵：毒沼节肢，`UNIT_DEFS` 标准数值。
 *
 * 配色上这是全五章最紧的一章：「毒」的自然联想是病态紫，而**紫做不出来**——
 * 抠色键是品红，紫会被连着素材一起吃掉。所以毒感靠酸黄绿 + 近黑的明度两极表达，
 * 推演见 docs/敌人图鉴.md §2 第 4 章与 docs/prompt/mobs_ch4_v1_prompt.txt。
 */
/**
 * 第四章杂兵。**这一章第一次有两只怪会出手，而且施加的是同一个 debuff。**
 *
 * 吹箭虫远程下毒、沼行鳄近战下毒，玩家第一次遇到「躲开一只还有另一只」。
 * 再叠上沼泽地形每回合 −5，这一章的商店池转向续航不是巧合，是给这套压力配的解药。
 */
export const CHAPTER4_MIRE: Record<TroopKind, MookTemplate> = {
  sword: { name: '泥沼手', youngName: '残泥手', animSet: 'mirehand' },
  bow: { name: '吹箭虫', youngName: '幼箭虫', animSet: 'dartbug', skillId: 'venom_dart' },
  cavalry: { name: '沼行鳄', youngName: '幼沼鳄', animSet: 'miregator', skillId: 'mire_bite' },
  shield: { name: '泥壳蟹', youngName: '幼泥蟹', animSet: 'mudcarapace' },
};

function mire(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mook(CHAPTER4_MIRE[defId], defId, x, y);
}

/** 第四章的填充档位，同 `mookYoung` */
function mireYoung(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mookYoung(CHAPTER4_MIRE[defId], defId, x, y);
}

/**
 * 关 16：一条大河把战场拦腰截断，只留两处浅滩；盾卫堵滩口（河流初见）。
 *
 * 这一关原本是第一章第三关，那时敌人是七折弱化新兵。挪到这里之后换成标准数值，
 * 因为它教的是河流——而河流是这一章的地形。前三章都没有不可绕行的横向阻隔，
 * 所以这张图仍然是「隘口」这个概念的第一课，只是提问的时机晚了十几关。
 */
const c4_1: StageBlueprint = {
  title: '渡口之争',
  goldReward: 20,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 0, y: 5, t: 'river' }, { x: 1, y: 5, t: 'river' },
    { x: 3, y: 5, t: 'river' }, { x: 4, y: 5, t: 'river' }, { x: 5, y: 5, t: 'river' },
    { x: 7, y: 5, t: 'river' }, { x: 8, y: 5, t: 'river' },
    { x: 2, y: 7, t: 'forest' }, { x: 6, y: 7, t: 'forest' },
  ]),
  enemies: [
    mire('shield', 2, 4),
    mire('sword', 6, 4),
    mire('bow', 4, 3),
  ],
  aiDifficulty: 'normal',
};

/** 关 17：河道两处浅滩，滩口各一片林子当掩体；两翼林影豹包抄（隘口 + 反骑兵复习） */
const c4_2: StageBlueprint = {
  title: '涸河林隘',
  goldReward: 21,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 0, y: 5, t: 'river' }, { x: 1, y: 5, t: 'river' }, { x: 2, y: 5, t: 'river' },
    { x: 4, y: 5, t: 'river' },
    { x: 6, y: 5, t: 'river' }, { x: 7, y: 5, t: 'river' }, { x: 8, y: 5, t: 'river' },
    // 浅滩在 x=3 / x=5，滩口的林子是守方的便宜——烧掉它能把盾位怪从掩体里赶出来
    { x: 3, y: 4, t: 'forest' }, { x: 5, y: 4, t: 'forest' },
    { x: 4, y: 3, t: 'high' },
  ]),
  enemies: [
    mire('shield', 3, 4),
    mire('bow', 4, 3),
    // 两翼骑兵摆在最北排：从 y=2 起手时它们第二轮就能贴上我方后排，
    // 玩家来不及在滩口列阵（实测 72%）。北移一行换来一个布防轮次。
    mire('cavalry', 1, 1),
    mireYoung('cavalry', 7, 1),
  ],
  aiDifficulty: 'normal',
};

/** 关 18：沼泽初见。中央一片泥潭，绕开要多走两格，硬穿每回合掉 5 血 */
const c4_3: StageBlueprint = {
  title: '沼泽初遇',
  goldReward: 22,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 3, y: 4, t: 'swamp' }, { x: 4, y: 4, t: 'swamp' }, { x: 5, y: 4, t: 'swamp' },
    { x: 3, y: 5, t: 'swamp' }, { x: 5, y: 5, t: 'swamp' },
  ]),
  enemies: [
    mire('cavalry', 4, 1),
    mire('bow', 2, 0),
    mire('sword', 6, 2),
  ],
};

const c4_4: StageBlueprint = {
  title: '毒沼围困',
  goldReward: 24,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 2, y: 3, t: 'swamp' }, { x: 3, y: 3, t: 'swamp' },
    { x: 5, y: 3, t: 'swamp' }, { x: 6, y: 3, t: 'swamp' },
    { x: 4, y: 4, t: 'swamp' },
  ]),
  enemies: [
    mire('shield', 4, 1),
    mire('bow', 2, 1),
    mire('bow', 6, 1),
    mire('cavalry', 4, 0),
  ],
  aiDifficulty: 'normal',
};

const c4_5: StageBlueprint = {
  title: '沼泽渡河',
  goldReward: 25,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 0, y: 5, t: 'river' }, { x: 1, y: 5, t: 'river' }, { x: 2, y: 5, t: 'river' },
    { x: 3, y: 5, t: 'river' }, { x: 4, y: 5, t: 'river' }, { x: 5, y: 5, t: 'river' },
    { x: 6, y: 5, t: 'river' }, { x: 7, y: 5, t: 'river' }, { x: 8, y: 5, t: 'river' },
    { x: 9, y: 5, t: 'river' },
  ]),
  enemies: [
    mire('bow', 3, 2),
    mire('bow', 6, 2),
    mire('shield', 5, 1),
    mire('sword', 4, 3),
  ],
};

const c4_6: StageBlueprint = {
  title: '迷雾沼泽',
  goldReward: 26,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 1, y: 3, t: 'swamp' }, { x: 3, y: 4, t: 'swamp' }, { x: 5, y: 3, t: 'swamp' },
    { x: 7, y: 4, t: 'swamp' }, { x: 2, y: 5, t: 'forest' }, { x: 6, y: 5, t: 'forest' },
  ]),
  enemies: [
    mire('cavalry', 2, 1),
    mire('cavalry', 7, 1),
    mire('sword', 5, 2),
    mire('shield', 5, 0),
  ],
  aiDifficulty: 'hard',
};

const c4_7: StageBlueprint = {
  title: '沼母',
  goldReward: 32,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 3, y: 3, t: 'swamp' }, { x: 4, y: 3, t: 'swamp' }, { x: 5, y: 3, t: 'swamp' }, { x: 6, y: 3, t: 'swamp' },
    { x: 3, y: 4, t: 'swamp' }, { x: 6, y: 4, t: 'swamp' },
    { x: 4, y: 2, t: 'high' }, { x: 5, y: 2, t: 'high' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 5, y: 2, uid: euid(),
      name: '沼母·蛭后',
      boss: true,
      animSet: 'mirequeen',
      // 面板照第三章城主（210/24/6）往上推一档，但**攻击给得比血量克制**：
      // 腐沼瘟息是半径 2 的群体中毒（每人 4 点 ×3 回合），压力来自持续掉血叠沼泽地形，
      // 不是来自单体挨一下有多疼。攻击再高会变成「一发 AoE 秒掉整个后排」。
      //
      // 和第四、五章的其余数值一样，这组**是没量过的**——这两章没有 `chapter*Sim`
      // 那样的胜率回归。要动之前先照前三章补一个 sim，别凭手感调。
      stats: { maxHp: 232, atk: 21, spd: 6 },
      skillSkin: 'mirequeen_miasma',
    },
    mire('cavalry', 5, 3),
    mire('shield', 4, 1),
    mire('bow', 2, 0),
    mire('bow', 7, 0),
    mire('sword', 3, 2),
  ],
  isBoss: true,
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

// ─── Chapter 5: 龙岭绝巅 · 深渊 ───
//
// 七关：绝壁初见 → 龙岭隘口 → 瓮城窄道 → 双门齐落 → 火山裂谷 → 龙脊峰 → 龙王。
//
// 只新增一种地形，而它是靠**和城墙的对比**来定义的：深渊同样不可通行，
// 但**不挡视线**——箭从裂谷上方飞过去是合理的。于是两种不可通行地形第一次
// 有了不同的战术用途：城墙造掩体，深渊只切断路线。这个区别要到玩家已经
// 用熟城墙（第三章）之后才读得出来，所以它排在最后一章。
//
// 这一章还把第三章的两关闸门题搬了过来（瓮城窄道、双门齐落）：终章该是复习加压，
// 而闸门是全游戏唯一「可以被操作」的地形，值得在最后一次用满编阵容重考一遍。
//
// 这一章没有难度回归测试（前三章有 `chapter*Sim`），所以数值是没量过的。
//
// 敌人换成**本章专属的四只火山生物**。搬过来的两关闸门题也用本章的怪，不留第三章的
// 兽人守军：终章同屏出现两套阵营美术会冲淡章节辨识度，而「古龙岭的旧关隘被火山生物
// 占据」叙事上也说得通（AI 本来就不会去操作机关，守军身份不承载玩法）。

/**
 * 第五章杂兵：龙岭火山属，`UNIT_DEFS` 标准数值。
 *
 * 熔岩裂纹是这一章统一的视觉签名，四只里有三只带；灰烬甲虫刻意**不发光**，
 * 是全章唯一的暗块——一整章都在发亮时，不亮的那个才是最好认的。
 *
 * 剑士位刻意做成无腿的熔岩块而不是四足猛兽：骑兵位已经是四足的岩鳞龙兽，
 * 两个四足剪影在 40px 下会糊成一类。推演见 docs/prompt/mobs_ch5_v1_prompt.txt。
 */
/**
 * 第五章杂兵。**四个兵位全部有技能**，这是投放曲线的终点。
 *
 * 四条的动词铺满四个方向——群伤 / 远程点 / 打断阵型 / 自保，没有一条重复。
 * 灰烬甲虫的「硬化」是全游戏唯一会自保的杂兵，它把「先集火脆皮」
 * 从一个习惯变成必须：硬啃这只等于把回合数送给它后面那三个会出手的同伴。
 */
export const CHAPTER5_DRAKE: Record<TroopKind, MookTemplate> = {
  sword: { name: '熔岩块', youngName: '熔岩砾', animSet: 'magmacore', skillId: 'magma_burst' },
  bow: { name: '火翼蝠', youngName: '幼翼蝠', animSet: 'emberbat', skillId: 'cinder_breath' },
  cavalry: { name: '岩鳞龙兽', youngName: '幼龙兽', animSet: 'scalewyrm', skillId: 'wyrm_dash' },
  shield: { name: '灰烬甲虫', youngName: '幼甲虫', animSet: 'ashshell', skillId: 'ash_harden' },
};

function drake(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mook(CHAPTER5_DRAKE[defId], defId, x, y);
}

/** 第五章的填充档位，同 `mookYoung` */
function drakeYoung(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mookYoung(CHAPTER5_DRAKE[defId], defId, x, y);
}

const c5_1: StageBlueprint = {
  title: '悬崖之战',
  goldReward: 26,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 0, y: 4, t: 'abyss' }, { x: 1, y: 4, t: 'abyss' },
    { x: 8, y: 4, t: 'abyss' }, { x: 9, y: 4, t: 'abyss' },
    { x: 4, y: 3, t: 'high' }, { x: 5, y: 3, t: 'high' },
  ]),
  enemies: [
    drake('bow', 4, 1),
    drake('bow', 5, 1),
    drake('cavalry', 3, 2),
    drake('cavalry', 6, 2),
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
    drake('shield', 3, 1),
    drake('shield', 6, 1),
    drake('bow', 5, 0),
    drake('sword', 4, 2),
    drake('cavalry', 5, 2),
  ],
  aiDifficulty: 'hard',
};

/**
 * 关 24：闸门是捷径。
 *
 * 中路闸门后面就是弓手，绕行要多花两轮——而那两轮里弓手一直在射。
 * 这一关教的是「开门省下的不是路，是挨打的回合数」。
 * 原本排在第三章第二关，挪到终章重考一遍：那时是三人阵容，这里是满编。
 */
const c5_3: StageBlueprint = {
  title: '瓮城窄道',
  goldReward: 29,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 2, y: 4, t: 'wall' }, { x: 3, y: 4, t: 'wall' },
    { x: 5, y: 4, t: 'wall' }, { x: 6, y: 4, t: 'wall' },
    { x: 4, y: 4, t: 'gate_closed' },
    { x: 7, y: 6, t: 'lever' },
    { x: 4, y: 2, t: 'high' },
  ]),
  enemies: [
    drake('bow', 4, 2),
    drake('sword', 3, 1),
    drake('cavalry', 7, 2),
    drake('shield', 4, 3),
    drakeYoung('sword', 1, 2),
  ],
  aiDifficulty: 'hard',
};

/**
 * 关 25：两道闸门，一个机关。
 *
 * 机关是全开全关（`openGates` 一次开全场），所以这一关没法只开一边——
 * 开门就等于同时放开左右两条通道。取舍从「开不开」变成
 * 「我的阵型撑不撑得住两边同时来人」。
 */
const c5_4: StageBlueprint = {
  title: '双门齐落',
  goldReward: 30,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 1, y: 5, t: 'wall' }, { x: 3, y: 5, t: 'wall' },
    { x: 6, y: 5, t: 'wall' }, { x: 8, y: 5, t: 'wall' },
    { x: 2, y: 5, t: 'gate_closed' },
    { x: 7, y: 5, t: 'gate_closed' },
    { x: 5, y: 8, t: 'lever' },
    { x: 4, y: 4, t: 'high' }, { x: 5, y: 4, t: 'high' },
  ]),
  enemies: [
    drake('shield', 4, 3),
    drake('bow', 2, 2),
    drake('sword', 7, 3),
    drakeYoung('cavalry', 5, 1),
    drakeYoung('bow', 8, 2),
  ],
  aiDifficulty: 'hard',
};

const c5_5: StageBlueprint = {
  title: '火山裂谷',
  goldReward: 31,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 4, t: 'abyss' }, { x: 5, y: 4, t: 'abyss' },
    { x: 2, y: 3, t: 'swamp' }, { x: 7, y: 3, t: 'swamp' },
    { x: 3, y: 2, t: 'high' }, { x: 6, y: 2, t: 'high' },
  ]),
  enemies: [
    drake('cavalry', 5, 1),
    drake('bow', 3, 2),
    drake('bow', 6, 2),
    drake('sword', 4, 0),
    drake('shield', 5, 2),
  ],
  aiDifficulty: 'hard',
};

const c5_6: StageBlueprint = {
  title: '龙脊峰',
  goldReward: 32,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 3, y: 3, t: 'high' }, { x: 4, y: 3, t: 'high' }, { x: 5, y: 3, t: 'high' }, { x: 6, y: 3, t: 'high' },
    { x: 0, y: 5, t: 'abyss' }, { x: 9, y: 5, t: 'abyss' },
    { x: 2, y: 5, t: 'forest' }, { x: 7, y: 5, t: 'forest' },
  ]),
  enemies: [
    drake('bow', 4, 3),
    drake('bow', 5, 3),
    drake('shield', 3, 2),
    drake('shield', 6, 2),
    drake('cavalry', 5, 1),
  ],
  aiDifficulty: 'hard',
};

const c5_7: StageBlueprint = {
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
    {
      defId: 'sword', x: 5, y: 2, uid: euid(),
      name: '龙王·安卡洛斯',
      boss: true,
      animSet: 'drakelord',
      // 全游戏最后一个单位，面板是照第三章城主（210/24/6）往上推的，
      // 但**血量给得比攻击克制**：这一关玩家有 5 个上场位，压力主要来自
      // 灭世龙息按最大血量收费（护甲堆不动它），再往上加单体攻击只会变成随机秒人。
      //
      // 第四、五章没有 `chapter*Sim` 那样的胜率回归，所以这组数字**是没量过的**。
      // 要动之前先照前三章的做法补一个 sim，别凭手感调——第一章的教训是
      // Boss 血量 240→242 就能让裸打胜率从 37% 掉到 20%。
      stats: { maxHp: 260, atk: 26, spd: 6 },
      skillSkin: 'drake_cataclysm',
    },
    drake('cavalry', 5, 3),
    drake('shield', 4, 2),
    drake('shield', 6, 2),
    drake('bow', 3, 1),
    drake('bow', 7, 1),
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
 * 全局序号看着直观，但往中间任何一章插一关，后面所有章的变量名都得跟着挪。
 * 关卡的**展示序号**由这张表的位置推导（见下面的 `STAGES_MVP`），
 * 所以变量名不承担编号职责，它只需要说清「这是第几章的第几关」。
 *
 * 推论：把一关从一章挪到另一章时，**要连变量名一起改**。不改的话文件里就会
 * 出现「`c1_4` 排在第二章」这种自相矛盾的东西，而它不会报错——
 * 唯一的表现是下一个读这个文件的人（很可能是三个月后的自己）读错章节归属。
 */
const CHAPTERS: StageBlueprint[][] = [
  [c1_1, c1_2, c1_3, c1_4],
  [c2_1, c2_2, c2_3, c2_4, c2_5],
  [c3_1, c3_2, c3_3, c3_4, c3_5, c3_6],
  [c4_1, c4_2, c4_3, c4_4, c4_5, c4_6, c4_7],
  [c5_1, c5_2, c5_3, c5_4, c5_5, c5_6, c5_7],
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
  return CHAPTERS.map((ch) => ch.map(() => next++));
})();
