import type { TerrainId } from '@/battle/types';
import { CHAPTER_STAGE_INDICES, STAGES_MVP, type StageDefMvp } from '@/data/stagesMvp';
import { ENDLESS_DUNGEON, ENDLESS_DUNGEON_ID } from '@/data/endlessCatalog';
import { SANDBOX_DUNGEON, SANDBOX_DUNGEON_ID } from '@/data/sandboxLab';
import { getTerrainSpec } from '@/data/terrainSpec';

/**
 * 副本（roguelike 局）数据。一个副本 = 一串有序节点（战斗/Boss/商店），
 * 复用 `STAGES_MVP` 的战斗蓝图作为战斗节点。每个副本有自己的 roguelike 池
 * （局内商店可出现的：药剂 / 地形券 / 场景专属临时技能）与 meta 通关奖励、解锁条件。
 *
 * 元素产出约定（详见 docs/系统设计-当前版本.md）：
 * - 精华不在商店出售，改为战斗胜利后三选一战利品掉落；
 * - 药剂购入后进入本局背包，在战斗回放中手动使用；
 * - 地形券按地形类型计数，布阵时放置。
 */

export type NodeKind = 'battle' | 'boss' | 'shop';

export interface NodeDef {
  kind: NodeKind;
  name: string;
  /** 战斗类节点：对应 `STAGES_MVP` 下标 */
  stageIndex?: number;
  /** 敌人数值缩放（与副本 `enemyScaleBase` 相乘）；缺省 1 */
  enemyScale?: number;
}

/**
 * 局内商店池行：只卖消耗品与临时技能。
 *
 * `tempSkill` 里**只能放通用技能**（`exclusiveProfession === null`）。
 * 临时技能不挑职业是有意的（见 `rosterEligibleForTempSkill`），
 * 放一个剑士专属技能进来，商店会允许把它卖给弓手。
 * 这条由 `dungeonCatalog.test.ts` 守着，不靠人肉复查。
 */
export type ShopPoolRow =
  | { category: 'terrain'; terrainId: TerrainId; price: number }
  | { category: 'potion'; potionId: string; price: number }
  | { category: 'tempSkill'; skillId: string; price?: number };

/** 玩家可通过地形券放置的地形类型 */
export const PLACEABLE_TERRAIN_IDS: readonly TerrainId[] = ['high', 'forest', 'wall'];

/** 地形券显示名（如「高地券」） */
export function terrainTicketName(id: TerrainId): string {
  return `${getTerrainSpec(id).name}券`;
}

export type DungeonUnlock =
  | { kind: 'default' }
  | { kind: 'clearDungeon'; dungeonId: string }
  | { kind: 'meta'; cost: number };

export interface DungeonDef {
  id: string;
  name: string;
  desc: string;
  nodes: NodeDef[];
  /** 局内商店（节点）可出现的 roguelike 池 */
  roguelikePool: ShopPoolRow[];
  /** 通关返回大厅的 meta 货币奖励 */
  metaReward: number;
  /** 全副本敌人基础缩放 */
  enemyScaleBase: number;
  /** 可带入本副本的最大角色数 */
  maxParty: number;
  unlock: DungeonUnlock;
  /** 章节地图卡主色（无插画时的降级底色） */
  themeColor: number;
  /**
   * 章节卡插图，`images/bg` 下的 key。宽高比固定 327:136（卡片上方 40%），
   * 画面重点必须落在中间横带上——不同机型卡高不同，上下会被裁掉一些。
   * 没有插图的章节退回 `themeColor` 平涂，不影响布局。
   */
  art?: string;
  /**
   * 布阵 / 战斗的俯视底图，`images/bg` 下的 key。
   * 平原格不画贴图、直接透出这张底，所以每章换一张才能读出「换场景了」。
   * 缺省走 `battle_bg`（第一章草地）；无尽 / 试炼不写，沿用草地。
   */
  battleBg?: string;
}

const r = (rows: ShopPoolRow[]): ShopPoolRow[] => rows;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 商店池的投放曲线
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 三条规矩，都是从「第一章一次抛完」这个毛病里补出来的：
 *
 * 1. **地形券只卖已经登场过的地形。** 第一章还没见过森林就卖森林券，等于让玩家
 *    花钱买一个他读不懂的东西。登场章节见 `stagesMvp` 的投放曲线总纲：
 *    高地（章 1）、森林（章 2）、城墙（章 3）。
 *
 * 2. **临时技能每章只新增 1/2/3/4/4 招。** 原先第一章一口气开四招——那是四段
 *    要读的说明文字，出现在玩家连高地都还没用熟的时候。现在第一章只有一招
 *    （野草缠足：最便宜、最好懂的控制），后面随着战斗变长再加。
 *
 * 3. **池子是「本章新增 + 上一章」的滑动窗口，不是全量累积。** 全量累积到第五章
 *    会有 14 招，而商店一次只 roll 3 件（还保底一件药剂）——想要的那招基本抽不到，
 *    「选一个流派」就退化成抽奖。滑动窗口让每章的池子由**本章的族**主导，
 *    上一章的留一轮作为过渡，玩家仍能把上一章顺手的招带过来。
 */

/** 各章**新增**的临时技能。总计 14 招，恰好是现有全部临时技能 */
const TEMP_NEW_BY_CHAPTER: ShopPoolRow[][] = [
  // 章 1 草原：一招就够。控制类里最便宜、最好懂的那个
  r([{ category: 'tempSkill', skillId: 'temp_gl_snare', price: 6 }]),
  // 章 2 密林：火把是这一章的关键一招（松脂林道那关就等着它）
  r([
    { category: 'tempSkill', skillId: 'temp_fo_torch', price: 8 },
    { category: 'tempSkill', skillId: 'temp_fo_thorn', price: 7 },
  ]),
  // 章 3 要塞：撞城槌和 Boss 的破阵冲撞同形，钩索配墙与闸门
  r([
    { category: 'tempSkill', skillId: 'temp_ft_ram', price: 9 },
    { category: 'tempSkill', skillId: 'temp_ft_suppress', price: 7 },
    { category: 'tempSkill', skillId: 'temp_ft_grapple', price: 7 },
  ]),
  // 章 4 毒沼：四招全是续航/增益。这一章的地形每回合在扣血，
  // 商店该给的是「扛得住」而不是「打得快」
  r([
    { category: 'tempSkill', skillId: 'temp_gl_salve', price: 7 },
    { category: 'tempSkill', skillId: 'temp_fo_bark', price: 8 },
    { category: 'tempSkill', skillId: 'temp_ft_banner', price: 8 },
    { category: 'tempSkill', skillId: 'field_bless', price: 8 },
  ]),
  // 章 5 龙岭：剩下的四招一起开，终章不再留新东西
  r([
    { category: 'tempSkill', skillId: 'temp_gl_horn', price: 7 },
    { category: 'tempSkill', skillId: 'temp_gl_swarm', price: 8 },
    { category: 'tempSkill', skillId: 'temp_fo_warden', price: 7 },
    { category: 'tempSkill', skillId: 'war_shout', price: 8 },
  ]),
];

/** 第 n 章（1 起）的临时技能池 = 本章新增 + 上一章新增 */
function tempSkillPool(chapter: number): ShopPoolRow[] {
  return [...(TEMP_NEW_BY_CHAPTER[chapter - 2] ?? []), ...(TEMP_NEW_BY_CHAPTER[chapter - 1] ?? [])];
}

/**
 * 章 1 草原战线：只有高地券。
 *
 * 这一章整个只有平原和高地两种地形（见 `stagesMvp`），所以能卖的券也只有一种。
 * 这不是内容少，是**这一章要问的问题只有一个**：这个丘归谁。一张券配一个问题。
 */
const POOL_GRASSLAND = r([
  { category: 'terrain', terrainId: 'high', price: 4 },
  { category: 'potion', potionId: 'heal', price: 5 },
  { category: 'potion', potionId: 'draught', price: 5 },
  ...tempSkillPool(1),
]);

/**
 * 章 2 密林深处：森林券是这一章的关键一格。
 *
 * 森林在这一章既是掩体又是燃料，所以「买一片林子放下去」同时是防守手段和给
 * 「松脂火把」备料——同一张券有两种用法，而它们还互相冲突（烧了就没掩体了），
 * 这正是想要的那种决定。
 */
const POOL_FOREST = r([
  { category: 'terrain', terrainId: 'high', price: 4 },
  { category: 'terrain', terrainId: 'forest', price: 4 },
  { category: 'potion', potionId: 'heal', price: 5 },
  { category: 'potion', potionId: 'draught', price: 5 },
  { category: 'potion', potionId: 'slow', price: 6 },
  ...tempSkillPool(2),
]);

/**
 * 章 3 要塞攻防：城墙券是这一章的关键一格。
 *
 * 城墙在这一章既挡路又挡视线，所以「买一堵墙放下去」是玩家手里唯一能主动
 * 制造掩体的手段——闸门开启之后门口那条走廊会变成对射场，
 * 一堵墙就能把它切断。和机关的关系是互补的：机关开路，墙封路。
 */
const POOL_FORTRESS = r([
  { category: 'terrain', terrainId: 'high', price: 5 },
  { category: 'terrain', terrainId: 'forest', price: 5 },
  { category: 'terrain', terrainId: 'wall', price: 5 },
  { category: 'potion', potionId: 'heal', price: 6 },
  { category: 'potion', potionId: 'draught', price: 6 },
  { category: 'potion', potionId: 'slow', price: 6 },
  ...tempSkillPool(3),
]);

/**
 * 章 4 毒沼泥潭：券的作用第一次变成「铺一条不掉血的路」。
 *
 * 前三章买券是为了拿便宜（站高地、躲林子、造掩体），这一章沼泽每回合扣 5 血，
 * 于是「在泥潭里垫一格高地」变成了一条通路而不是一个增益。同一张高地券，
 * 换个地形环境就换了用途——这是不加新机制就能加深度的地方。
 */
const POOL_SWAMP = r([
  { category: 'terrain', terrainId: 'high', price: 5 },
  { category: 'terrain', terrainId: 'forest', price: 5 },
  { category: 'terrain', terrainId: 'wall', price: 5 },
  { category: 'potion', potionId: 'heal', price: 6 },
  { category: 'potion', potionId: 'draught', price: 7 },
  { category: 'potion', potionId: 'slow', price: 7 },
  ...tempSkillPool(4),
]);

const POOL_DRAGON = r([
  { category: 'terrain', terrainId: 'high', price: 5 },
  { category: 'terrain', terrainId: 'forest', price: 5 },
  { category: 'terrain', terrainId: 'wall', price: 6 },
  { category: 'potion', potionId: 'heal', price: 7 },
  { category: 'potion', potionId: 'draught', price: 7 },
  { category: 'potion', potionId: 'slow', price: 7 },
  ...tempSkillPool(5),
]);

/**
 * 把一段连续战斗关卡按「打几场插一个商店、Boss 关收尾」编排为节点序列。
 *
 * Boss 由关卡自己的 `StageDefMvp.isBoss` 决定，不再按「数组最后一个」推。
 * 那个字段以前写了却没人读——5 章的 Boss 关都标着 `isBoss: true`，而节点类型
 * 是从位置推出来的，两套说法并存且谁也不校验谁。改成读字段之后它成了唯一来源：
 * 新章漏标就会得到一章没有 Boss 节点，`stageIntegrity` 当场跑红，
 * 而不是等到玩到最后一关发现没有 Boss 的 1.1 倍缩放和奖励。
 */
/**
 * 第 n 章（1 起）的关卡下标。章节增删关卡时这里自动跟上。
 *
 * 越界直接抛：副本表比章节表多一章的话，`buildNodes([])` 会安静地产出一个
 * 没有战斗节点的副本，玩家点进去就是空的。
 */
function chapterStages(n: number): number[] {
  const idx = CHAPTER_STAGE_INDICES[n - 1];
  if (!idx) throw new Error(`第 ${n} 章没有关卡数据（stagesMvp 的 CHAPTERS 只有 ${CHAPTER_STAGE_INDICES.length} 章）`);
  return [...idx];
}

function buildNodes(stageIndices: number[]): NodeDef[] {
  const nodes: NodeDef[] = [];
  stageIndices.forEach((si, i) => {
    const stage: StageDefMvp | undefined = STAGES_MVP[si];
    const isBoss = stage?.isBoss === true;
    nodes.push({
      kind: isBoss ? 'boss' : 'battle',
      name: stage?.name ?? `节点 ${i + 1}`,
      stageIndex: si,
      enemyScale: isBoss ? 1.1 : 1,
    });
    // 每两场战斗后、且不在 Boss 前最后插一个商店节点
    if (!isBoss && i % 2 === 1) {
      nodes.push({ kind: 'shop', name: '补给点' });
    }
  });
  return nodes;
}

export const DUNGEON_DEFS: DungeonDef[] = [
  {
    id: 'dungeon_grassland',
    name: '草原战线',
    desc: '血牙部族踏进草原。四场遭遇战，先学会抢那两块缓丘。',
    nodes: buildNodes(chapterStages(1)),
    roguelikePool: POOL_GRASSLAND,
    metaReward: 10,
    enemyScaleBase: 1.0,
    maxParty: 4,
    unlock: { kind: 'default' },
    themeColor: 0x5a9e3a,
    art: 'chapter_grassland',
    battleBg: 'battle_bg',
  },
  {
    id: 'dungeon_forest',
    name: '密林深处',
    desc: '林子替谁挡伤，谁就占便宜——而它烧得起来。',
    nodes: buildNodes(chapterStages(2)),
    roguelikePool: POOL_FOREST,
    metaReward: 12,
    enemyScaleBase: 1.05,
    maxParty: 4,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_grassland' },
    themeColor: 0x2d7a4d,
    art: 'chapter_forest',
    battleBg: 'battle_bg_forest',
  },
  {
    id: 'dungeon_fortress',
    name: '要塞攻防',
    desc: '墙挡路，也挡箭。闸门是唯一能被你亲手操作的地形。',
    nodes: buildNodes(chapterStages(3)),
    roguelikePool: POOL_FORTRESS,
    metaReward: 14,
    enemyScaleBase: 1.12,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_forest' },
    themeColor: 0x8a7a5a,
    art: 'chapter_fortress',
    battleBg: 'battle_bg_fortress',
  },
  {
    id: 'dungeon_swamp',
    name: '毒沼泥潭',
    desc: '河水拖慢脚步，泥潭每回合抽血。这里的地形一直在扣你的账。',
    nodes: buildNodes(chapterStages(4)),
    roguelikePool: POOL_SWAMP,
    metaReward: 16,
    enemyScaleBase: 1.2,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_fortress' },
    themeColor: 0x5a7a3a,
    art: 'chapter_swamp',
    battleBg: 'battle_bg_swamp',
  },
  {
    id: 'dungeon_dragon',
    name: '龙岭绝巅',
    desc: '绝壁能切断退路，却挡不住一支箭。龙王在最高处。',
    nodes: buildNodes(chapterStages(5)),
    roguelikePool: POOL_DRAGON,
    metaReward: 20,
    enemyScaleBase: 1.3,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_swamp' },
    themeColor: 0x8a3a3a,
    art: 'chapter_dragon',
    battleBg: 'battle_bg_dragon',
  },
];

const DUNGEON_BY_ID: Record<string, DungeonDef> = Object.fromEntries(
  DUNGEON_DEFS.map((d) => [d.id, d]),
);

export function getDungeonDef(id: string): DungeonDef | undefined {
  // 无尽试炼 / 特效试炼都不进 DUNGEON_DEFS（那是冒险页正式章节表）
  if (id === ENDLESS_DUNGEON_ID) return ENDLESS_DUNGEON;
  if (id === SANDBOX_DUNGEON_ID) return SANDBOX_DUNGEON;
  return DUNGEON_BY_ID[id];
}

/** 布阵 / 战斗底图。没写的副本（无尽、试炼）回落到第一章草地。 */
export function dungeonBattleBgKey(dungeon: Pick<DungeonDef, 'battleBg'> | undefined): string {
  return dungeon?.battleBg ?? 'battle_bg';
}

/** 默认即解锁的副本 id */
export const DEFAULT_DUNGEON_IDS: readonly string[] = DUNGEON_DEFS.filter(
  (d) => d.unlock.kind === 'default',
).map((d) => d.id);
