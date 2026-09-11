import type { DeployZone } from '@/battle/deployZone';
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
   * 并给 1.1 倍敌人缩放。有 Boss 的章节必须恰好一关标它，且放在最后
   * （`stageIntegrity` 守着）；教学章没有 Boss，打完精英即通关。
   */
  isBoss?: boolean;
  /** 本关最大可上阵人数（默认 3） */
  maxDeploy?: number;
  /** 缺省南两行。第六章用左右翼 */
  deployZone?: DeployZone;
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
 * | 1 草原战线 | 3 |  4 | 高地 | 站上去打得更疼 |
 * | 2 密林深处 | 5 |  7 | 森林、燃烧 | 掩体对双方都生效，而且能烧 |
 * | 3 要塞攻防 | 6 |  8 | 城墙、机关/闸门 | 地形挡视线，而且可以被操作 |
 * | 4 毒沼泥潭 | 8 | 11 | 河流、沼泽 | 走得慢、打得软、还掉血 |
 * | 5 龙岭绝巅 | 8 | 11 | 深渊 | 绝壁切断路线但不挡箭 |
 * | 6 血牙祭坛 | 6 |  8 | 血池 | 争池续航；战后篇，终章仍是龙岭 |
 *
 * 节点数由 `dungeonCatalog.buildNodes` 从关数推出（每两场战斗插一个补给点），
 * 3/5/6/8/8/6 关对应 4/7/8/11/11/8 个节点。教学章打完精英即通关。酋长不进第六章。
 *
 * 推论：一关只能用**它所在章节及更早**登场过的地形。想给第四章的图摆一堵墙可以
 * （城墙第三章就登场了），想给第二章的图摆一条河不行。地形券的售卖章节同理，
 * 见 `dungeonCatalog` 的商店池。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 章内怎么排：同一种地形，摆法要接着往上走
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 上面那张表管的是「一章给几种地形」，管不住「同一种地形在章内怎么摆」——
 * 而那才是玩家最先感觉到的：一章里第一关和最后一关差不多，几堵墙很容易绕过，
 * 闸门没啥用。逐格量过一遍，这句话是能算出来的：六章的地形密度峰值全部落在
 * 各章前 40% 的关卡里，所有阻挡地形都只铺一行厚，四关闸门开门只省 2~3 点移动消耗。
 *
 * 四条规则，前两条由 `stageIntegrity` 的「关卡布局曲线」直接守着：
 *
 * 1. **章内递增**：每章末两关的地形密度不低于本章中位数（教学章豁免）。
 * 2. **闸门必须真的省路**：门当平地 / 当墙各跑一次最短移动消耗，差值 >= 6。
 *    要满足它，光收窄侧翼没用——绕行只是横向平移几格；必须给阻挡地形**纵深**：
 *    贴壁夹道往里压两三格，或者内外两道墙把敞口错开。
 * 3. **一种地形三种摆法**：同一章里别复用同一个形状。第三章三堵墙分别是
 *    「横墙 + 两条贴壁夹道」「内外错位双墙」「瓮城内院」；第五章的深渊分别是
 *    竖切、斜切、夹脊、双道上山路。换形状比换地形便宜。
 * 4. **增益格稀缺、代价地形留窄口**：高地/血池连片超过四格，「抢制高点」就没了；
 *    河流/沼泽铺满整行就不是隘口，是「全员一起慢一轮」，谁都没得选。
 *
 * **改地形前必须知道的引擎前提**：敌人 AI 的接近步走的是多源 Dijkstra 场
 * （`battle/path.ts` 的 `approachCostField`），不是曼哈顿直线。原先是直线贪心，
 * 而直线贪心在任何凹形地形前面都会把单位钉死在墙面上——绕行的第一步总是让直线
 * 距离变大。第一次把第三章后三关改成夹道时平均回合数从 8~11 跳到 29~30、胜率塌到 5%，
 * 就是两边隔着墙干瞪眼磨到回合上限。**关卡地形能摆成什么样，上限卡在那个函数上。**
 *
 * 调难度时的两条账（细节写在各关注释里）：
 *   - **横贯战场的掉血地带主要在削守方**——AI 永远朝玩家推进，趟泥的是它们。
 *     铺掉血地形不等于加难度，代价还是要在总血量上收。
 *   - **走廊会把 Boss 战变简单**（敌人排队出窄口，守住口一个一个点），
 *     但切过头会把队伍拆散，那时候药也救不回来。
 */

// ─── Chapter 1: 草原战线 · 高地 ───
//
// 三关：接触战 → 远程威胁 → 精英围剿。打完百夫长即通关。**整章只有平原和高地。**
// 原末战「血牙酋长」退役到试炼场，教学章不再用 Boss 收尾，祭坛也不再用他。
//
// 玩家要学的就三件事：怎么移动、站高地为什么打得更疼、怎么集火。
// 每张图都给一对可争夺的缓丘，三关反复问同一个问题——这个丘归谁。
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

/**
 * 关 3：精英百夫长坐镇中央高台，弓手两翼 + 骑兵侧袭（本章收尾）。
 *
 * 三格高地连成**一条中央高台**，而不是像前两关那样散着摆。
 * 这一章只有高地一种地形，三关的进阶就写在它的形状里：
 * 一关两座各自为战的小丘 → 二关敌我各一座对射 → 这一关只有一处制高点，
 * 而它归对面。「抢不抢」第一次变成一个非此即彼的决定。
 */
const c1_3: StageBlueprint = {
  title: '前哨围剿',
  goldReward: 18,
  terrain: withHighCells(emptyTerrain(9, 10), [
    { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
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
 * 投放曲线（第一章 0 条 → 第二、三章各 1 条 → 第四章 2 条 → 终章 4 条 → 祭坛 2 条）
 * 和技能本身的设计依据都在 `skillCatalog` 的杂兵技能段落。
 */
export interface MookTemplate {
  name: string;
  /** 七折填充档的名字。第三章走 `garrisonGreen` 自己拼前缀，不用这个字段 */
  youngName?: string;
  animSet: string;
  /** 底层 `SkillSpec` id（`enemyOnly`）。缺省 = 只普攻 */
  skillId?: string;
  /** 敌方技能皮肤。有皮肤时优先于 `skillId`，面板不会读成玩家招的名字 */
  skillSkin?: string;
}

function mook(t: MookTemplate, defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return {
    defId, x, y, uid: euid(),
    name: t.name,
    animSet: t.animSet,
    ...(t.skillSkin ? { skillSkin: t.skillSkin } : t.skillId ? { skillId: t.skillId } : {}),
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
    // 100 → 86。AI 的接近步换成按实际路程走之后（见 `battle/ai.ts`），
    // 这一关的四只怪不再各自撞进林子，包夹成形得更早，实测掉到 70.8%。
    // 一章的开场关不该是全章最难的推进关，所以把这一只的血退回去。
    { ...forest('sword', 5, 3), stats: { maxHp: 86 } },
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
    // 100 → 72，同 `c2_1` 那一只。AI 改成按实际路程接近之后，这只剑士不再对着
    // 林带原地磨，而是绕到林带尽头堵人，等于给两个弓手多买了两轮，实测掉到 67.9%。
    // 82 只买回 6pp（74.2%），还差一步，所以一路压到 72。
    { ...forest('sword', 6, 3), stats: { maxHp: 72 } },
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
  // 原版四片林子各占一个角，摆得很匀，但没有一处逼玩家做决定。
  // 现在收成**两条平行林道夹住一条明路**：走中间快，全程挨图伦和弓手的正面；
  // 钻林道慢一轮（移动消耗 2）但一路吃 -25% 承伤。
  // 这一关的题目从此写在地形上——你愿意用一轮时间换一层护甲吗。
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 4, y: 3, t: 'high' },
    { x: 2, y: 2, t: 'forest' }, { x: 2, y: 3, t: 'forest' }, { x: 2, y: 4, t: 'forest' },
    { x: 2, y: 5, t: 'forest' }, { x: 2, y: 6, t: 'forest' },
    { x: 6, y: 2, t: 'forest' }, { x: 6, y: 3, t: 'forest' }, { x: 6, y: 4, t: 'forest' },
    { x: 6, y: 5, t: 'forest' }, { x: 6, y: 6, t: 'forest' },
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
      // （同 `c6_1` 的注释）。所以**动完必须重跑 `chapter2Sim`**，线性外推一定错。
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
 *
 * 林子从五格散点扩成**环着高台的一整圈**（原版只在南面铺了三格，从两侧绕上去
 * 一棵树都不用碰，燎原咒火经常烧了个空）。现在不管从哪个方向贴近祭坛都要进林子，
 * 而那一整圈就是他的燃料——烧起来是每轮 8 点的火环，整章教的「林子对谁更有利」
 * 在这里被反问了最后一次。
 */
const c2_5: StageBlueprint = {
  title: '血牙萨满',
  goldReward: 26,
  terrain: withCells(withHighCells(emptyTerrain(9, 11), [{ x: 4, y: 2 }, { x: 4, y: 3 }]), [
    // 环着高台的松林，也是萨满的燃料。刻意隔开一格：紧贴高台铺会把整圈掩体
    // 白送给包夹上来的玩家（实测裸打从 52% 松到 75%），而这一章的林子是**路上的**，
    // 不是终点的。现在它围的是进场的三条路，祭坛脚下反而是开阔地。
    { x: 2, y: 2, t: 'forest' }, { x: 2, y: 3, t: 'forest' }, { x: 2, y: 4, t: 'forest' },
    { x: 6, y: 2, t: 'forest' }, { x: 6, y: 3, t: 'forest' }, { x: 6, y: 4, t: 'forest' },
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
 * 墙的形状**照抄上一关**：同样是一道横墙留三个豁口。区别只有一处——
 * 中路那个豁口这次是关着的门。玩家上一关刚学会贴墙走到豁口边，
 * 这一关一眼就能看出少了哪个口，机关是干什么的于是不用教。
 *
 * 捷径刻意压到最低（开门省 4 点移动消耗，两侧豁口一直开着），
 * 机关就在部署区抬脚可达的地方。第一关要让这件事零成本学会。
 */
const c3_3: StageBlueprint = {
  title: '闸门机关',
  goldReward: 20,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 1, y: 4, t: 'wall' }, { x: 2, y: 4, t: 'wall' }, { x: 3, y: 4, t: 'wall' },
    { x: 5, y: 4, t: 'wall' }, { x: 6, y: 4, t: 'wall' }, { x: 7, y: 4, t: 'wall' },
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
 * 上一关的三个豁口这次收成一个门 + 两条贴着墙根的一格夹道，而夹道还往北
 * 压了三格——绕行要一直摸到墙根尽头才能转进来，比开门多花 7 点移动消耗。
 * 这是这一章第一次让「不开门」有价格。
 *
 * 门后压着两个狼骑——机动最高的兵种。玩家如果一进场就去按机关，
 * 门开的那一轮狼骑直接冲进部署区；先清掉外面的再开门才是对的顺序。
 * 这是这一章「什么时候开门」这道题的正式提问。
 */
const c3_4: StageBlueprint = {
  title: '放闸',
  goldReward: 22,
  terrain: withCells(emptyTerrain(10, 11), [
    // 横贯的城墙，中路一道闸门
    { x: 1, y: 5, t: 'wall' }, { x: 2, y: 5, t: 'wall' }, { x: 3, y: 5, t: 'wall' },
    { x: 4, y: 5, t: 'wall' }, { x: 6, y: 5, t: 'wall' }, { x: 7, y: 5, t: 'wall' },
    { x: 8, y: 5, t: 'wall' },
    { x: 5, y: 5, t: 'gate_closed' },
    // 两条一格宽的贴壁夹道。往北再压三格是关键：不压的话绕行只是横向平移几步，
    // 门就白摆了（`stageIntegrity` 的「开门必须真的省路」守着这条）。
    { x: 1, y: 4, t: 'wall' }, { x: 1, y: 3, t: 'wall' }, { x: 1, y: 2, t: 'wall' },
    { x: 8, y: 4, t: 'wall' }, { x: 8, y: 3, t: 'wall' }, { x: 8, y: 2, t: 'wall' },
    { x: 1, y: 7, t: 'lever' },
    { x: 2, y: 3, t: 'forest' }, { x: 7, y: 3, t: 'forest' },
  ]),
  enemies: [
    // 门后的两个狼骑：不开门它们得绕整条夹道，开门的那一轮它们就到脸上。
    //
    // 两个都保留「撞阵」，第二个只掉一点血量。这里试过两个更粗的改法，都**过头**了：
    // 把它降到新募档（七折、且不继承技能）或者把门外弓手降到新募档，
    // 两者都把胜率从 73.6% 抬到 93%——比加技能之前的 ~75% 还松，
    // 这一关就不再是「什么时候开门」的考试了。
    //
    // 这一关和 `c2_4`、`c6_1` 一样卡在取整断点上，一个整兵的存在感就是 20pp，
    // 所以只能用显式面板做细旋钮。90 → 78 血（不动攻击）刚好买回那 2pp。
    // 夹道改造后又掉到 74.7%（绕行多花的回合让弓手多射两轮），再降到 70 买回 3pp。
    // **动完必须重跑 `chapter3Sim`**，别线性外推。
    garrison('cavalry', 4, 3),
    { ...garrison('cavalry', 6, 3), stats: { maxHp: 70 } },
    // 左夹道出口顶着一个剑士，出巷第一步就得打。血压到 82（标准 100）买 3pp 余量：
    // 76.4% 距离 75% 的下界不够这套测试的抽样波动。
    { ...garrison('sword', 2, 4), stats: { maxHp: 82 } },
    // 弓手退到中路而不是蹲在右夹道口：贴着巷口射会让「刚钻出来的人立刻挨一箭」，
    // 实测把这一关压到 74%。退两格后玩家出巷有一轮整队时间，回到 79%。
    garrison('bow', 6, 2),
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
 * 形状换了一种：**内外两道墙，敞口错开**。外墙的口在最左，内墙的口在右侧，
 * 两道门叠在中路一条线上。不开门就得从左边进夹层、横穿整个战场再从右边拐上去，
 * 比撞门多花 8 点移动消耗；夹层里还杵着一个盾卫专门拖时间。
 *
 * 而机关远在左下角，去按的人这一轮完全脱离战线。所以这一关问的不是
 * 「开不开门」，是「派谁去、什么时候派」——精英关就该考清楚这个。
 */
const c3_5: StageBlueprint = {
  title: '城卫长',
  goldReward: 24,
  terrain: withCells(withHighCells(emptyTerrain(10, 11), [{ x: 4, y: 3 }, { x: 5, y: 3 }]), [
    // 外墙：敞口只剩最左一格
    { x: 1, y: 6, t: 'wall' }, { x: 2, y: 6, t: 'wall' }, { x: 3, y: 6, t: 'wall' },
    { x: 5, y: 6, t: 'wall' }, { x: 6, y: 6, t: 'wall' }, { x: 7, y: 6, t: 'wall' },
    { x: 8, y: 6, t: 'wall' }, { x: 9, y: 6, t: 'wall' },
    { x: 4, y: 6, t: 'gate_closed' },
    // 内墙：敞口挪到右边。两个口错开，夹层就成了一条必须横穿的走廊
    { x: 0, y: 4, t: 'wall' }, { x: 1, y: 4, t: 'wall' }, { x: 2, y: 4, t: 'wall' },
    { x: 3, y: 4, t: 'wall' }, { x: 5, y: 4, t: 'wall' },
    { x: 8, y: 4, t: 'wall' }, { x: 9, y: 4, t: 'wall' },
    { x: 4, y: 4, t: 'gate_closed' },
    { x: 0, y: 8, t: 'lever' },
  ]),
  enemies: [
    {
      ...garrison('sword', 4, 3),
      name: '血牙城卫长',
      // 覆盖掉 garrison 给的守卒外观：这一章杂兵也是人形兽人，精英必须自己有脸，
      // 否则「该集火了」这个信号只能靠血条读出来。金肩甲 + 独眼是他的识别点。
      animSet: 'castellan',
      // 250 → 290：错位双墙让守军排队从右侧口出来，玩家守住口就能一个一个点，
      // 实测松到 90.9%（上界就是 90%）。走廊换来的便宜在总血量上还回去。
      stats: { maxHp: 290, atk: 26 },
    },
    garrison('bow', 6, 2),
    // 夹层里的盾卫：绕行路线正好从他身上碾过去，他的活就是把那趟横穿拖长
    garrison('shield', 5, 5),
    garrisonGreen('sword', 2, 2),
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
 * 地形是本章的毕业考，形状第三次换：一座**瓮城**。城主坐在方形内院里，
 * 南面两道并排的闸门撞开就是直通王座的走廊；不开门则要沿东西两条一格宽的
 * 贴壁夹道摸到最北边，再从内院背后那两格后门挤进来——多花 8 点移动消耗，
 * 而且全程排成一列，正好喂给破阵冲撞。这一关每一条路都是走廊。
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
    // 内城南墙：两道并排闸门，撞开就是直通王座的走廊
    { x: 1, y: 5, t: 'wall' }, { x: 2, y: 5, t: 'wall' }, { x: 3, y: 5, t: 'wall' },
    { x: 6, y: 5, t: 'wall' }, { x: 7, y: 5, t: 'wall' }, { x: 8, y: 5, t: 'wall' },
    { x: 4, y: 5, t: 'gate_closed' }, { x: 5, y: 5, t: 'gate_closed' },
    // 东西两壁，外面各留一条一格宽的贴壁夹道
    { x: 1, y: 4, t: 'wall' }, { x: 1, y: 3, t: 'wall' }, { x: 1, y: 2, t: 'wall' },
    { x: 8, y: 4, t: 'wall' }, { x: 8, y: 3, t: 'wall' }, { x: 8, y: 2, t: 'wall' },
    // 北墙只留中间两格的后门。不开闸的那条路要绕满一整圈才走得到这里
    { x: 2, y: 1, t: 'wall' }, { x: 3, y: 1, t: 'wall' },
    { x: 6, y: 1, t: 'wall' }, { x: 7, y: 1, t: 'wall' },
    { x: 9, y: 8, t: 'lever' },
  ]),
  enemies: [
    {
      ...garrison('sword', 4, 2),
      name: '血牙城主',
      boss: true,
      // 方形攻城盔 + 方肩甲 + 塔盾，全表最重的剪影，和这一章的钢青守军同色系。
      animSet: 'bloodcastellan',
      // 210 → 265：瓮城让守军排着队从后门出来，玩家守住巷口就能一个一个点，
      // 裸打实测从 ~73% 松到 88.4%。走廊换来的便宜必须在总血量上还回去。
      //
      // 攻击 24 → 20 是配套的。上面那条「攻击是把药废掉的旋钮」在这里正着用一次：
      // 265/24 时带药只有 84~86%，压着 85% 的下界；试过靠加血补（285/22）反而把
      // 裸打压到 53.2%，两头都只剩 1~3pp。**血量同向压两条，只有攻击能把两条拉开**，
      // 所以血退回 265、单独降攻。
      stats: { maxHp: 265, atk: 20, spd: 6 },
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
// 八关：河道隘口 → 浅滩林隘 → 沼泽初见 → 毒沼围困 → 全宽河道 → 迷雾沼泽 → 精英沼语者 → Boss。
//
// 这一章的两种地形是同一个动词的两个强度：**地形本身在削你**。
// 河流让人走得慢（消耗 3）、打得软（攻击 ×0.8），沼泽在此之上每回合还掉 5 血。
// 前三章的地形都是「站对了有便宜」，这一章第一次出现「站错了持续付账」，
// 所以商店池在这里转向续航（草药敷治、树皮庇护、攻城战旗、战场祝福）。
//
// 这也是节点数第一次到 11 的一章。前三章 4/7/8 个节点是在教东西，
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

/**
 * 关 20：河再宽一次，但这次有两处能挤。
 *
 * 原版把整行铺满、一个浅滩都不留——那就不是隘口了，是「全员一起慢一轮」，
 * 谁都没得选。现在留 x=3 和 x=7 两处浅滩，滩口踩的是烂泥：
 * 挤浅滩快但要掉血，趟河慢一轮还打不动人（河流攻击 ×0.8）。这才有取舍。
 */
const c4_5: StageBlueprint = {
  title: '沼泽渡河',
  goldReward: 25,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 0, y: 5, t: 'river' }, { x: 1, y: 5, t: 'river' }, { x: 2, y: 5, t: 'river' },
    { x: 4, y: 5, t: 'river' }, { x: 5, y: 5, t: 'river' }, { x: 6, y: 5, t: 'river' },
    { x: 8, y: 5, t: 'river' }, { x: 9, y: 5, t: 'river' },
    // 两处浅滩的滩口是烂泥：走近路要付掉血，绕开就得趟河
    { x: 3, y: 4, t: 'swamp' }, { x: 7, y: 4, t: 'swamp' },
  ]),
  enemies: [
    mire('bow', 3, 2),
    mire('bow', 6, 2),
    mire('shield', 5, 1),
    mire('sword', 4, 3),
  ],
};

/**
 * 关 21：泥不是散在图上的四个点，是两条斜着切过来的带子。
 *
 * 原版四格烂泥各站一个角落，绕开的成本是零——「每回合掉 5 血」这个动词
 * 从头到尾没机会触发。现在两条斜泥带从两侧压向中路，把干地挤成一个 Z 形通道：
 * 想走直线就得吃泥，不吃泥就得绕成 Z。地形第一次真的在收费。
 */
const c4_6: StageBlueprint = {
  title: '迷雾沼泽',
  goldReward: 26,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 1, y: 2, t: 'swamp' }, { x: 2, y: 3, t: 'swamp' },
    { x: 3, y: 4, t: 'swamp' }, { x: 4, y: 5, t: 'swamp' },
    { x: 8, y: 2, t: 'swamp' }, { x: 7, y: 3, t: 'swamp' },
    { x: 6, y: 4, t: 'swamp' }, { x: 5, y: 5, t: 'swamp' },
    { x: 2, y: 6, t: 'forest' }, { x: 7, y: 6, t: 'forest' },
  ]),
  enemies: [
    mire('cavalry', 2, 1),
    mire('cavalry', 7, 1),
    mire('sword', 5, 2),
    mire('shield', 5, 0),
  ],
  aiDifficulty: 'hard',
};

/**
 * 关：精英 · 沼语者。Boss 前的综合考试，对齐 2/3 章「猎长 / 城卫长」。
 *
 * 塔玛只普攻、靠面板压人。毒和沼泽掉血已经由吹箭虫、沼行鳄和地形提供，
 * 再给精英一招会让失败原因变成「没看懂那一招」，而不是「该集火了」。
 *
 * 地形是这一关真正的题：**他站的那座高台四面全是烂泥**。原版四格泥散在两侧，
 * 从正北直着走上去一格泥都不用踩，高地的 +25% 白送给了他。
 * 现在想贴上去打，就得先站进泥里挨一轮 5 点——「该不该现在冲」这道题
 * 有了一个用血算出来的答案。
 */
const c4_7: StageBlueprint = {
  title: '沼语者',
  goldReward: 28,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 3, t: 'high' }, { x: 5, y: 3, t: 'high' },
    // 围着高台的一圈烂泥，没有干路可以走上去
    { x: 3, y: 2, t: 'swamp' }, { x: 4, y: 2, t: 'swamp' },
    { x: 5, y: 2, t: 'swamp' }, { x: 6, y: 2, t: 'swamp' },
    { x: 3, y: 3, t: 'swamp' }, { x: 6, y: 3, t: 'swamp' },
    { x: 3, y: 4, t: 'swamp' }, { x: 4, y: 4, t: 'swamp' },
    { x: 5, y: 4, t: 'swamp' }, { x: 6, y: 4, t: 'swamp' },
    { x: 1, y: 5, t: 'forest' }, { x: 8, y: 5, t: 'forest' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 4, y: 3, uid: euid(),
      name: '沼语者·塔玛',
      animSet: 'mirespeaker',
      // 城卫长是 250/26。这一章 5 人 4 级 + 1.2 缩放，240 血会被秒成 100%。
      // 有效旋钮是总血量；毒和沼泽已经在扣，攻击只微调。
      //
      // 400 → 460 是高台围泥之后补的。这里有一条反直觉的账要记住：**横贯战场的
      // 掉血地带主要在削守方**——AI 永远朝玩家推进（见 `battle/ai.ts`），
      // 所以趟泥的是它们，实测这一关因此从 75.7% 松到 90.2%。
      // 铺掉血地形不等于加难度，代价还是要在总血量上收。
      stats: { maxHp: 460, atk: 25, spd: 6 },
    },
    mire('bow', 2, 2),
    mire('cavalry', 7, 2),
    mire('shield', 3, 1),
    mire('sword', 5, 1),
  ],
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

/**
 * 关 22：Boss · 沼母。这一章的动词在最后一关走到头。
 *
 * 原版那圈泥是个开口的 U 形，缺口正对着玩家——绕开就行，Boss 关反而是全章
 * 最不用管地形的一张图。现在把它闭合成一条**护城泥沟**，蛭后连同贴身护卫
 * 坐在沟中央的干土台上：不趟泥就够不着她，而趟进去每轮 5 点，
 * 叠上腐沼瘟息的每人 4 点 ×3 回合，就是这一章一直在教的那件事的期末考。
 */
const c4_8: StageBlueprint = {
  title: '沼母',
  goldReward: 32,
  terrain: withCells(emptyTerrain(10, 11), [
    // 闭合的护城泥沟
    { x: 3, y: 3, t: 'swamp' }, { x: 4, y: 3, t: 'swamp' },
    { x: 5, y: 3, t: 'swamp' }, { x: 6, y: 3, t: 'swamp' },
    { x: 3, y: 4, t: 'swamp' }, { x: 6, y: 4, t: 'swamp' },
    { x: 3, y: 5, t: 'swamp' }, { x: 4, y: 5, t: 'swamp' },
    { x: 5, y: 5, t: 'swamp' }, { x: 6, y: 5, t: 'swamp' },
    // 沟中央的干土台
    { x: 4, y: 4, t: 'high' }, { x: 5, y: 4, t: 'high' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 5, y: 4, uid: euid(),
      name: '沼母·蛭后',
      boss: true,
      animSet: 'mirequeen',
      // 面板照第三章城主（210/24/6）往上推一档，但**攻击给得比血量克制**：
      // 腐沼瘟息是半径 2 的群体中毒（每人 4 点 ×3 回合），压力来自持续掉血叠沼泽地形，
      // 不是来自单体挨一下有多疼。攻击再高会变成「一发 AoE 秒掉整个后排」。
      //
      // 调这一组必须重跑 `chapter4Sim`。有效旋钮是总血量，别只加攻击。
      //
      // 232 → 208：护城泥沟和上一关的高台围泥方向相反——这里趟泥的是**玩家**
      // （蛭后和护卫坐在沟中央的干土台上不动），裸打实测掉到 46%，低于 50% 的下界。
      // 泥沟收的那几十点血要在 Boss 血量上退回去。
      stats: { maxHp: 208, atk: 21, spd: 6 },
      skillSkin: 'mirequeen_miasma',
    },
    // 台上另一格给贴身护卫，玩家没法只靠射程隔着泥沟点 Boss
    mire('cavalry', 4, 4),
    // 沟外的四只：先把它们清掉才谈得上下泥
    {
      ...mire('shield', 2, 5),
      stats: { maxHp: 130 },
    },
    mire('bow', 2, 3),
    mire('bow', 7, 3),
    mire('sword', 7, 5),
  ],
  isBoss: true,
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

// ─── Chapter 5: 龙岭绝巅 · 深渊 ───
//
// 八关：绝壁初见 → 龙岭隘口 → 瓮城窄道 → 双门齐落 → 火山裂谷 → 龙脊峰 → 精英龙裔 → 龙王。
//
// 只新增一种地形，而它是靠**和城墙的对比**来定义的：深渊同样不可通行，
// 但**不挡视线**——箭从裂谷上方飞过去是合理的。于是两种不可通行地形第一次
// 有了不同的战术用途：城墙造掩体，深渊只切断路线。这个区别要到玩家已经
// 用熟城墙（第三章）之后才读得出来，所以它排在最后一章。
//
// 这一章还把第三章的两关闸门题搬了过来（瓮城窄道、双门齐落）：终章该是复习加压，
// 而闸门是全游戏唯一「可以被操作」的地形，值得在最后一次用满编阵容重考一遍。
//
// 调这一章必须重跑 `chapter5Sim`。有效旋钮是总血量，别只加攻击。
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

/**
 * 关 22：深渊初见——而它必须一上来就**切在路中间**。
 *
 * 原版把四格深渊贴在左右两条边上，那只是把边缘封住，玩家从中路六列直着走过去，
 * 一次也不用绕。深渊和城墙的区别（挡路但不挡箭）也就没机会演示。
 * 现在裂谷竖在正中，两侧各一条上山道，各带一座缓丘：
 * 双方隔着裂谷能对射、却谁也过不去，想贴身就得选一边绕。这才是这一章的第一课。
 */
const c5_1: StageBlueprint = {
  title: '悬崖之战',
  goldReward: 26,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 4, t: 'abyss' }, { x: 5, y: 4, t: 'abyss' },
    { x: 4, y: 5, t: 'abyss' }, { x: 5, y: 5, t: 'abyss' },
    { x: 4, y: 6, t: 'abyss' }, { x: 5, y: 6, t: 'abyss' },
    // 两条道各一座缓丘：选哪边都有制高点，选的是「先打哪一对」
    { x: 2, y: 3, t: 'high' }, { x: 7, y: 3, t: 'high' },
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
 * 中路闸门后面就是弓手，绕行要沿左边那条一格宽的窄道一路摸到最北再折回来，
 * 比撞门多花 6 点移动消耗——而那几轮里弓手一直在射。
 * 这一关教的是「开门省下的不是路，是挨打的回合数」。
 * 原本排在第三章第二关，挪到终章重考一遍：那时是三人阵容，这里是满编。
 */
const c5_3: StageBlueprint = {
  title: '瓮城窄道',
  goldReward: 29,
  terrain: withCells(emptyTerrain(9, 10), [
    { x: 1, y: 4, t: 'wall' }, { x: 2, y: 4, t: 'wall' }, { x: 3, y: 4, t: 'wall' },
    { x: 5, y: 4, t: 'wall' }, { x: 6, y: 4, t: 'wall' }, { x: 7, y: 4, t: 'wall' },
    { x: 8, y: 4, t: 'wall' },
    { x: 4, y: 4, t: 'gate_closed' },
    // 窄道往北压两格，不然绕行只是横着挪几步，门就白摆了
    { x: 1, y: 3, t: 'wall' }, { x: 1, y: 2, t: 'wall' },
    { x: 7, y: 6, t: 'lever' },
    { x: 4, y: 2, t: 'high' },
  ]),
  enemies: [
    drake('bow', 4, 2),
    drake('sword', 3, 1),
    drake('cavalry', 7, 2),
    drake('shield', 4, 3),
    drakeYoung('sword', 2, 2),
  ],
  aiDifficulty: 'hard',
};

/**
 * 关 25：两道闸门，一个机关。
 *
 * 机关是全开全关（`openGates` 一次开全场），所以这一关没法只开一边——
 * 开门就等于同时放开中路那两格。取舍从「开不开」变成
 * 「我的阵型撑不撑得住正面一次涌进来两列」。
 *
 * 原版两道门摆在 x=2 和 x=7，而中路 x=4/x=5 整段敞着——门从数据上就是装饰
 * （实测开门只省 2 点移动消耗）。现在门收回正中，绕行改走两侧贴壁道，
 * 而夹着那两条道的是**深渊不是城墙**：走绕行路线全程暴露在弓手视野里，
 * 因为深渊挡路不挡箭。这一章的动词在这里和闸门叠在一起用。
 */
const c5_4: StageBlueprint = {
  title: '双门齐落',
  goldReward: 30,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 1, y: 5, t: 'wall' }, { x: 2, y: 5, t: 'wall' }, { x: 3, y: 5, t: 'wall' },
    { x: 6, y: 5, t: 'wall' }, { x: 7, y: 5, t: 'wall' }, { x: 8, y: 5, t: 'wall' },
    { x: 4, y: 5, t: 'gate_closed' }, { x: 5, y: 5, t: 'gate_closed' },
    // 夹住两条贴壁道的是深渊：挡得住脚，挡不住箭
    { x: 1, y: 4, t: 'abyss' }, { x: 1, y: 3, t: 'abyss' }, { x: 1, y: 2, t: 'abyss' },
    { x: 8, y: 4, t: 'abyss' }, { x: 8, y: 3, t: 'abyss' }, { x: 8, y: 2, t: 'abyss' },
    { x: 5, y: 8, t: 'lever' },
    { x: 4, y: 4, t: 'high' }, { x: 5, y: 4, t: 'high' },
  ]),
  enemies: [
    drake('shield', 4, 3),
    drake('bow', 2, 2),
    drake('sword', 7, 3),
    drakeYoung('cavalry', 5, 1),
    drakeYoung('bow', 7, 1),
  ],
  aiDifficulty: 'hard',
};

/**
 * 关 26：裂谷是**斜**的。
 *
 * 前面几关的深渊都横平竖直，绕法只有「往左」或「往右」两种。这里两段裂谷错开半张图，
 * 左半场的口在最左两列、右半场的口在最右两列，中间那段要先横穿到另一侧才上得去。
 * 同一种地形，只是换了个摆法。
 */
const c5_5: StageBlueprint = {
  title: '火山裂谷',
  goldReward: 31,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 2, y: 4, t: 'abyss' }, { x: 3, y: 4, t: 'abyss' }, { x: 4, y: 4, t: 'abyss' },
    { x: 5, y: 5, t: 'abyss' }, { x: 6, y: 5, t: 'abyss' }, { x: 7, y: 5, t: 'abyss' },
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

/**
 * 关 27：峰顶只剩两格，而上峰只有一条脊。
 *
 * 原版把四格高地连成一片摆在中路，谁走过去都能站上去——「抢制高点」这道题
 * 在铺到第四格的时候就没了。现在峰顶收成两格，两侧用深渊夹出一条一格宽的窄脊，
 * 山脚的两块林子是上脊之前唯一的掩体。高地重新变成一个要抢的位置。
 */
const c5_6: StageBlueprint = {
  title: '龙脊峰',
  goldReward: 32,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 2, t: 'high' }, { x: 5, y: 2, t: 'high' },
    // 夹出中路窄脊
    { x: 3, y: 3, t: 'abyss' }, { x: 3, y: 4, t: 'abyss' },
    { x: 6, y: 3, t: 'abyss' }, { x: 6, y: 4, t: 'abyss' },
    // 两翼的口也收窄，绕上去要从 x=2 / x=7 挤
    { x: 0, y: 5, t: 'abyss' }, { x: 1, y: 5, t: 'abyss' },
    { x: 8, y: 5, t: 'abyss' }, { x: 9, y: 5, t: 'abyss' },
    { x: 2, y: 6, t: 'forest' }, { x: 7, y: 6, t: 'forest' },
  ]),
  enemies: [
    // 峰顶归他们：两个弓手吃着 +25% 往下射，玩家得先决定抢不抢这两格
    drake('bow', 4, 2),
    drake('bow', 5, 2),
    // 窄脊上一对盾墙，把中路那条捷径堵死
    drake('shield', 4, 3),
    drake('shield', 5, 3),
    drake('cavalry', 5, 1),
  ],
  aiDifficulty: 'hard',
};

/**
 * 关：精英 · 龙裔。终章 Boss 前的集火考试。
 *
 * 中路那条深渊拉成整整三格深的竖带，把战场真的劈成左右两半——原版只有两格，
 * 从上下任何一头都能一步绕过去，等于没切。现在选了哪一边就得打完那一边，
 * 卡尔萨站在右侧高地上，隔着裂谷只能对射不能贴脸。
 * 只普攻；火翼蝠和灰烬甲虫复习「先打会出手的，别硬啃硬化」。
 */
const c5_7: StageBlueprint = {
  title: '龙裔',
  goldReward: 34,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 3, t: 'abyss' }, { x: 5, y: 3, t: 'abyss' },
    { x: 4, y: 4, t: 'abyss' }, { x: 5, y: 4, t: 'abyss' },
    { x: 4, y: 5, t: 'abyss' }, { x: 5, y: 5, t: 'abyss' },
    { x: 2, y: 3, t: 'high' }, { x: 7, y: 3, t: 'high' },
    { x: 1, y: 5, t: 'forest' }, { x: 8, y: 5, t: 'forest' },
    { x: 2, y: 6, t: 'forest' }, { x: 7, y: 6, t: 'forest' },
    { x: 3, y: 6, t: 'forest' }, { x: 6, y: 6, t: 'forest' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 7, y: 3, uid: euid(),
      name: '龙裔·卡尔萨',
      animSet: 'drakekin',
      // 5 人 5 级 + 1.3 缩放时 250 血接近白给。压力留给切路，攻击不往上堆。
      stats: { maxHp: 380, atk: 26, spd: 6 },
    },
    drake('bow', 3, 2),
    drake('shield', 7, 2),
    drakeYoung('shield', 5, 2),
    drakeYoung('cavalry', 2, 1),
  ],
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

/**
 * 关 29：Boss · 龙王。
 *
 * 原版这张图是四种地形各摆两格的拼盘——深渊、沼泽、森林、高地各一对散在角落，
 * 哪一种都构不成一道题，读起来只是「装饰得比较满」。终章最后一关不该是这样。
 *
 * 现在整张图只讲一件事：**上王座的正路只有中间那条**。两道竖裂谷把战场切成
 * 左中右三条，中路三格宽、最后一段要穿过龙座前的两片林子——那是全程唯一的掩体，
 * 也正好是灭世龙息想要你挤在一起的地方。两翼绕得开，但要趟烂泥。
 *
 * 中路刻意留三格宽而不是切成两条一格道：试过在龙座正下方补一格深渊把中路也劈开，
 * 结果队伍被拆成两拨各个击破，带药胜率从 94% 掉到 83%——**药救得了掉血，
 * 救不了阵型被地形拆散**。切路可以，切到队伍站不到一起就过头了。
 */
const c5_8: StageBlueprint = {
  title: '龙王',
  goldReward: 40,
  terrain: withCells(withHighCells(emptyTerrain(11, 12), [
    { x: 5, y: 2 }, { x: 5, y: 3 },
  ]), [
    // 两道竖裂谷，中间夹出三格宽的正路
    { x: 3, y: 4, t: 'abyss' }, { x: 3, y: 5, t: 'abyss' }, { x: 3, y: 6, t: 'abyss' },
    { x: 7, y: 4, t: 'abyss' }, { x: 7, y: 5, t: 'abyss' }, { x: 7, y: 6, t: 'abyss' },
    // 王座前的两片林：正路的最后一段得从这里过
    { x: 4, y: 3, t: 'forest' }, { x: 6, y: 3, t: 'forest' },
    { x: 4, y: 4, t: 'forest' }, { x: 6, y: 4, t: 'forest' },
    // 绕外圈的账单
    { x: 1, y: 5, t: 'swamp' }, { x: 9, y: 5, t: 'swamp' },
    { x: 1, y: 6, t: 'swamp' }, { x: 9, y: 6, t: 'swamp' },
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
      // 调这一组必须重跑 `chapter5Sim`。第一章的教训是 Boss 血量 240→242
      // 就能让裸打胜率从 37% 掉到 20%。有效旋钮是总血量。
      stats: { maxHp: 215, atk: 24, spd: 6 },
      skillSkin: 'drake_cataclysm',
    },
    drake('cavalry', 5, 3),
    {
      ...drake('shield', 4, 2),
      stats: { maxHp: 125 },
    },
    drake('bow', 3, 1),
    drakeYoung('bow', 7, 1),
  ],
  isBoss: true,
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

// ─── Chapter 6: 血牙祭坛 ───
//
// 战后篇。终章身份仍是第五章龙岭。酋长不进本章（机制与脸已占用，试炼场可留）。
// 新动词：血池每回 +6。布阵走左右各 2 列南半区，中间过道留给池和敌人。

const CH6_FLANKS: DeployZone = { kind: 'flanks', cols: 2 };

/**
 * 第六章杂兵：祭仪构装。骨白浮在干血上。弓吸血、盾奶人，对标第四章两条毒。
 */
export const CHAPTER6_RITE: Record<TroopKind, MookTemplate> = {
  sword: { name: '骨俑', youngName: '残骨俑', animSet: 'bonepup' },
  bow: { name: '血鸦', youngName: '幼血鸦', animSet: 'gorecrow', skillId: 'rite_peck' },
  cavalry: { name: '祭牲犄兽', youngName: '幼犄兽', animSet: 'ritehorn' },
  shield: { name: '石坛守', youngName: '残坛守', animSet: 'slabward', skillId: 'rite_chant' },
};

function rite(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mook(CHAPTER6_RITE[defId], defId, x, y);
}

function riteYoung(defId: TroopKind, x: number, y: number): StageEnemySpawn {
  return mookYoung(CHAPTER6_RITE[defId], defId, x, y);
}

const c6_1: StageBlueprint = {
  title: '祭阶初登',
  goldReward: 28,
  deployZone: CH6_FLANKS,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 5, t: 'blood' }, { x: 5, y: 5, t: 'blood' },
  ]),
  enemies: [
    rite('sword', 4, 2),
    rite('bow', 5, 1),
  ],
  aiDifficulty: 'normal',
  maxDeploy: 5,
};

const c6_2: StageBlueprint = {
  title: '血渠夹道',
  goldReward: 30,
  deployZone: CH6_FLANKS,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 2, t: 'blood' }, { x: 4, y: 3, t: 'blood' },
    { x: 4, y: 4, t: 'blood' }, { x: 4, y: 5, t: 'blood' },
    { x: 4, y: 6, t: 'blood' }, { x: 4, y: 7, t: 'blood' },
  ]),
  enemies: [
    rite('shield', 4, 3),
    rite('sword', 5, 3),
    rite('bow', 4, 1),
  ],
  aiDifficulty: 'normal',
  maxDeploy: 5,
};

/**
 * 关：两个池子，一边一个，各自贴着一侧的布阵区。
 *
 * 原版两个池子都只有一格宽一格深——站得下一个人，于是「抢池」退化成
 * 「谁先动谁站上去」。扩成 2x2 之后一个池子能容下半支队伍，
 * 「要不要把整条侧翼压过去」才成为一个问题。
 */
const c6_3: StageBlueprint = {
  title: '双池对峙',
  goldReward: 31,
  deployZone: CH6_FLANKS,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 2, y: 5, t: 'blood' }, { x: 3, y: 5, t: 'blood' },
    { x: 2, y: 6, t: 'blood' }, { x: 3, y: 6, t: 'blood' },
    { x: 6, y: 5, t: 'blood' }, { x: 7, y: 5, t: 'blood' },
    { x: 6, y: 6, t: 'blood' }, { x: 7, y: 6, t: 'blood' },
  ]),
  enemies: [
    rite('sword', 3, 2),
    rite('bow', 3, 1),
    rite('sword', 6, 2),
    rite('bow', 6, 1),
  ],
  aiDifficulty: 'normal',
  maxDeploy: 5,
};

const c6_4: StageBlueprint = {
  title: '枯骨回廊',
  goldReward: 32,
  deployZone: CH6_FLANKS,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 2, t: 'high' }, { x: 5, y: 2, t: 'high' },
    { x: 4, y: 3, t: 'blood' }, { x: 5, y: 3, t: 'blood' },
    { x: 1, y: 6, t: 'high' }, { x: 8, y: 6, t: 'high' },
  ]),
  enemies: [
    rite('bow', 4, 2),
    rite('sword', 5, 3),
    rite('shield', 5, 2),
  ],
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

/**
 * 关：精英 · 守坛长。这一章的动词第一次调转枪口。
 *
 * 前四关的池子都是玩家的补给。这一关它是**赫兹的**：他泡在血渠正中，
 * 站着不动每轮回 6 点，护法也在池子里。玩家要么打得比他回得快，
 * 要么把自己也塞进这条两格宽的渠——但那意味着贴着他打，还得排成一列。
 * 从上一关的「抢池」到这一关的「他先占了池」。
 */
const c6_5: StageBlueprint = {
  title: '守坛祭司',
  goldReward: 36,
  deployZone: CH6_FLANKS,
  terrain: withCells(emptyTerrain(10, 11), [
    // 贯穿祭坛的血渠
    { x: 4, y: 2, t: 'blood' }, { x: 5, y: 2, t: 'blood' },
    { x: 4, y: 3, t: 'blood' }, { x: 5, y: 3, t: 'blood' },
    { x: 4, y: 4, t: 'blood' }, { x: 5, y: 4, t: 'blood' },
    { x: 4, y: 5, t: 'blood' }, { x: 5, y: 5, t: 'blood' },
    // 两侧的丘：不下渠的那条打法要靠这两格换增伤
    { x: 2, y: 6, t: 'high' }, { x: 7, y: 6, t: 'high' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 5, y: 3, uid: euid(),
      name: '守坛长·赫兹',
      animSet: 'altarwarden',
      // 6 级 5 人 + 1.35 缩放时 300 血接近白给（sim 98%）。总血量是台阶旋钮。
      // 460 → 530：血渠铺开后玩家能在池子里跟他对耗，实测 87.6% 顶着 90% 的上界，
      // 只剩 2.4pp——比这套测试自己的抽样标准差大不了多少，等于没有断言。
      stats: { maxHp: 530, atk: 30, spd: 6 },
    },
    rite('shield', 4, 4),
    rite('bow', 3, 2),
    riteYoung('sword', 6, 2),
  ],
  aiDifficulty: 'hard',
  maxDeploy: 5,
};

/**
 * 关：Boss · 祭主。整章的池子在这里连成一个十字。
 *
 * 竖的一笔是祭主脚下的血渠，横的一笔正对着左右两条布阵侧翼——玩家从哪一边压上来，
 * 都会先踩进池子。这是故意的：血池对双方一视同仁，而祭主的血祭还要从人身上吸。
 * 所以这一关的算术是三方的——他回、你回、他从你身上抽，
 * 「谁站在池子里」这一个决定同时决定了三项。
 */
const c6_6: StageBlueprint = {
  title: '血牙祭主',
  goldReward: 42,
  deployZone: CH6_FLANKS,
  terrain: withCells(emptyTerrain(10, 11), [
    { x: 4, y: 2, t: 'blood' }, { x: 5, y: 2, t: 'blood' },
    { x: 4, y: 3, t: 'blood' }, { x: 5, y: 3, t: 'blood' },
    { x: 4, y: 4, t: 'blood' }, { x: 5, y: 4, t: 'blood' },
    { x: 4, y: 5, t: 'blood' }, { x: 5, y: 5, t: 'blood' },
    { x: 2, y: 4, t: 'blood' }, { x: 3, y: 4, t: 'blood' },
    { x: 6, y: 4, t: 'blood' }, { x: 7, y: 4, t: 'blood' },
  ]),
  enemies: [
    {
      defId: 'sword', x: 5, y: 2, uid: euid(),
      name: '祭主·戈尔什',
      boss: true,
      animSet: 'ritespeaker',
      // 裸打 260 血在 6 级 5 人下是 94%。血祭会吸血，但先要活过第一轮集火。
      //
      // 攻击 28 → 26：血池十字铺开后带药那条实测 72.5%，只比 70% 的下界高 2.5pp。
      // 攻击是「把药废掉」的旋钮（同第三章城主的注释），降它抬的主要是带药那条；
      // 但它把裸打也一起抬到了 51.3%（上界 50%），所以再用血量压回来。
      // 两个旋钮方向不同：**攻击拉开裸打与带药的差，血量同向压两条**。
      // 最后落在 24/500：裸打 ~40%（区间中段）、带药 ~78%（下界 70% 上方留够余量）。
      stats: { maxHp: 500, atk: 24, spd: 6 },
      skillSkin: 'ritespeaker_drain',
    },
    rite('shield', 4, 3),
    rite('bow', 3, 1),
    riteYoung('sword', 6, 2),
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
  [c1_1, c1_2, c1_3],
  [c2_1, c2_2, c2_3, c2_4, c2_5],
  [c3_1, c3_2, c3_3, c3_4, c3_5, c3_6],
  [c4_1, c4_2, c4_3, c4_4, c4_5, c4_6, c4_7, c4_8],
  [c5_1, c5_2, c5_3, c5_4, c5_5, c5_6, c5_7, c5_8],
  [c6_1, c6_2, c6_3, c6_4, c6_5, c6_6],
];

function toStages(blueprints: readonly StageBlueprint[], startId: number): StageDefMvp[] {
  return blueprints.map(({ title, ...rest }, i) => ({
    id: startId + i,
    name: `第 ${startId + i} 关 · ${title}`,
    ...rest,
  }));
}

const OFFICIAL_STAGES = toStages(CHAPTERS.flat(), 1);

export const STAGES_MVP: StageDefMvp[] = OFFICIAL_STAGES;

/**
 * 每章占用的 `STAGES_MVP` 下标，供 `dungeonCatalog` 组装节点。
 *
 * 章节的关卡数变了，这里跟着变，不需要谁去同步下标数组。
 */
export const CHAPTER_STAGE_INDICES: readonly (readonly number[])[] = (() => {
  let next = 0;
  return CHAPTERS.map((ch) => ch.map(() => next++));
})();
