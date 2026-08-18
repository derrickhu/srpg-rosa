import type { TerrainId } from '@/battle/types';

export interface TerrainSpec {
  id: TerrainId;
  name: string;
  /** 进入该格的移动消耗。Infinity = 不可通行 */
  moveCost: number;
  /** 站在此格时，本单位造成的伤害乘数 */
  atkMul: number;
  /** 站在此格时，本单位**受到**的伤害乘数（< 1 = 更耐打） */
  defMul: number;
  /** 站在此格时每回合流失的血量（0 = 无） */
  dotPerRound: number;
  /**
   * **贴图加载失败时**的兜底纯色（`createTerrainCell` 走不到纹理分支时用）。
   * 取值来自 `images/terrain/*.png` 的实测主色，见风格圣经 §2.2——改贴图时一并改这里，
   * 否则 CDN 抖动的那几秒棋盘会是另一套配色。深渊取洞口的黑而不是岩缘的灰，因为玩家
   * 读到的是中间那个洞。
   */
  color: number;
  /**
   * 被火点燃后变成哪种地形。**设了这个字段就等于「可燃」**，不另立 `flammable` 标记，
   * 否则会出现「标了可燃但没写变成什么」这种自相矛盾的配置。
   */
  ignitesTo?: TerrainId;
  /**
   * 定时自动转移：站够 `rounds` 个轮首后变成 `to`（燃烧烧尽成焦土）。
   * 计时器由 `TerrainRuntime` 持有，不写在格子里——格子只存当前是什么。
   */
  decay?: { rounds: number; to: TerrainId };
  /**
   * 挡住穿过这一格的远程攻击（见 `battle/sight.ts`）。
   *
   * 深渊同样不可通行，但**不**挡视线——箭从裂谷上方飞过去是合理的，
   * 而这个区别恰好让两种不可通行地形有了不同的战术用途：城墙造掩体，深渊只切断路线。
   */
  blocksSight?: boolean;
  /**
   * 机关：**玩家**单位站在这一格上，轮首会把全场闸门永久打开（见 `TerrainRuntime.openGates`）。
   *
   * 和 `ignitesTo` 同样的写法——设了这个字段就等于「是机关」，不另立 `isLever` 标记。
   */
  opensGates?: true;
  /** 闸门被打开后变成哪种地形。设了这个字段就等于「是闸门」 */
  opensTo?: TerrainId;
}

/**
 * 地形设计契约：**一种地形只有一个动词，且必须是确定性的。**
 *
 * 一个动词——玩家在布阵那 30 秒里要同时权衡站位、克制、射程，地形再带两条规则就读不完了。
 * 所以高地只管进攻、森林只管挨打、河流只管惩罚输出、沼泽只管掉血，各占一个词，
 * 布阵格上的角标也就能压进 5 个字（见 `renderHelpers.terrainBadgeText`）。
 *
 * 确定性——原先森林是 30% 闪避。战斗是全自动的、一场 40 秒，玩家对一次暗抛硬币既看不见
 * 也无法应对，它只会让同一套布阵有时赢有时输，把「策略有效」这件事变成噪声。改成固定减伤后
 * 布阵重新变成一道可解的题，这才撑得住「易上手难精通」。要加随机性得加在玩家能响应的地方。
 *
 * 另外注意：`defMul` 只对**可通行**地形有意义。历史上唯一带 `defMul` 的是城墙（0.5），
 * 而城墙 `moveCost` 是 Infinity，没有单位能站上去——那个 0.5 从写下那天就没生效过，
 * 却让人以为地形已经有防御维度了。新增减伤一律加在可通行地形上。
 *
 * ---
 * 补充（动态地形接入时）：**「一个动词」约束的是地形对站在上面的单位的持续影响**
 * ——`moveCost` 之外最多再占一条（加攻 / 减伤 / 掉血 / 回血）。地形之间的**转移边**
 * （`ignitesTo`、`decay`）不算动词。
 *
 * 理由是转移边不需要玩家在布阵那 30 秒里读：它只在发生的那一刻给一次飘字和一次贴图
 * 变化，属于「看得见的因果」而不是「要背的规则」。玩家不必事先知道森林可燃，他放了
 * 一发带火的技能、看到林子烧起来，这条规则就学会了，而且比写在角标上更记得住。
 *
 * 确定性依然要守：所有转移都是必然发生的（火命中必点燃、烧满固定回合必成焦土），
 * 不引入「有几成概率蔓延」这类玩家无法响应的暗抛硬币。
 *
 * ---
 * 补充（机关接入时）：机关是第三类——**动词作用在别的格子上**。
 *
 * 前两类（持续影响、转移边）说的都是「这一格对站在它上面的单位做什么」。机关不同：
 * 站上去对本单位毫无影响，它改的是**场上另一处**（闸门）。这不违反「一个动词」——
 * 机关格自己的持续影响仍是零条，角标那 5 个字写的是它对战场做什么（「开闸」），
 * 而不是它对你做什么。
 *
 * 为什么允许这一类：前两类地形玩家都只能**适应**（挑格子站、点火改写），
 * 机关是第一次让地形成为可以被**操作**的对象。这是第三章的主题，
 * 也是「地形是资源」这条线的自然下一步。
 *
 * 确定性同样要守，而且这里还多一条**只响应玩家**：守军没有理由开自家城门，
 * 敌人踩机关不触发。这既合主题，也避免 AI 在门口反复进出把战场变得读不懂。
 */
const SPECS: Record<TerrainId, TerrainSpec> = {
  plain: {
    id: 'plain',
    name: '平原',
    moveCost: 1,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0xcce43c,
  },
  high: {
    id: 'high',
    name: '高地',
    moveCost: 1,
    atkMul: 1.25,
    defMul: 1,
    dotPerRound: 0,
    color: 0xe4b46c,
  },
  // 与高地对称：一个 +25% 输出、一个 -25% 承伤，两个数字一样好记。
  // 移动消耗 2 是它的代价，否则远程躲进林子就没有取舍了。
  forest: {
    id: 'forest',
    name: '森林',
    moveCost: 2,
    atkMul: 1,
    defMul: 0.75,
    dotPerRound: 0,
    color: 0x3c8424,
    ignitesTo: 'burning',
  },
  river: {
    id: 'river',
    name: '河流',
    moveCost: 3,
    atkMul: 0.8,
    defMul: 1,
    dotPerRound: 0,
    color: 0x249cfc,
  },
  swamp: {
    id: 'swamp',
    name: '沼泽',
    moveCost: 2,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 5,
    color: 0x545424,
  },
  // 不可通行地形的 atkMul/defMul 恒为 1：没有单位能站上去，写别的值只会误导读者
  wall: {
    id: 'wall',
    name: '城墙',
    moveCost: Infinity,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x6c6c6c,
    blocksSight: true,
  },
  abyss: {
    id: 'abyss',
    name: '深渊',
    moveCost: Infinity,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x140322,
  },
  /**
   * 燃烧中：森林被点燃后的两回合。
   *
   * 动词是掉血，且比沼泽（5）更狠——沼泽是长期存在的地貌，玩家可以绕；火是玩家自己点的，
   * 位置和时机都由他挑，所以敢给到 8。同时 `moveCost` 掉回 1：树烧没了自然好走，
   * 也让「烧开一条路」成为除了拆掩体之外的第二种用法。
   *
   * 不保留森林的 -25% 承伤是关键——烧掩体这件事必须**立刻**兑现，
   * 否则玩家点了火却发现敌人还在吃减伤，会认为技能没生效。
   */
  burning: {
    id: 'burning',
    name: '燃烧',
    moveCost: 1,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 8,
    color: 0xe4642c,
    decay: { rounds: 2, to: 'scorched' },
  },
  /**
   * 机关：站上去零影响，作用在闸门上（见顶部契约「第三类」）。
   *
   * 移动消耗 1、不给任何加成，是故意的：机关的代价必须是**一个人一回合的站位**，
   * 而不是站上去还顺带吃个减伤。给了加成，占机关就从取舍变成好处，
   * 「什么时候开门」这道题也就不用做了。
   */
  lever: {
    id: 'lever',
    name: '机关',
    moveCost: 1,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x9c7cd4,
    opensGates: true,
  },
  /**
   * 闸门（关着）：规则上等同城墙——挡路且挡视线。
   *
   * 复用城墙的两条规则而不是只挡路，是因为「门后的弓手打不到你、你也打不到他」
   * 才让开门成为一个真的决定。只挡路的话，隔着门对射就把这一章的题目消掉了。
   */
  gate_closed: {
    id: 'gate_closed',
    name: '闸门',
    moveCost: Infinity,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x4c3c2c,
    blocksSight: true,
    opensTo: 'gate_open',
  },
  /**
   * 闸门（开了）：规则上等同平原（零动词），但单独留一种地形。
   *
   * 理由和焦土一致——棋盘上要留下痕迹，玩家得看出「这道门是我开的」。
   * 而且开了不会再关（见 `openGates`），所以这是终态。
   */
  gate_open: {
    id: 'gate_open',
    name: '闸门（开）',
    moveCost: 1,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x8c7c64,
  },
  /**
   * 焦土：烧完之后的终态，规则上等同平原（零动词）。
   *
   * 单独立一种地形而不是直接变回平原，是为了在棋盘上留下痕迹——玩家要能看出
   * 「这块地方是我烧出来的」，这份因果比省一个 TerrainId 值钱。
   */
  scorched: {
    id: 'scorched',
    name: '焦土',
    moveCost: 1,
    atkMul: 1,
    defMul: 1,
    dotPerRound: 0,
    color: 0x3c342c,
  },
};

export function getTerrainSpec(id: TerrainId): TerrainSpec {
  return SPECS[id] ?? SPECS.plain;
}

/** 全部已登记的地形 id */
export const TERRAIN_IDS = Object.keys(SPECS) as TerrainId[];

/**
 * 关卡数据校验用：`getTerrainSpec` 对未知 id 会兜底成平原，
 * 所以拼错的地形只会静默变成一格平原，光靠渲染看不出来。
 */
export function isKnownTerrainId(id: string): id is TerrainId {
  return id in SPECS;
}

export function isPassable(id: TerrainId): boolean {
  return SPECS[id].moveCost < Infinity;
}

export function terrainColor(id: TerrainId): number {
  return SPECS[id].color;
}
