import type { TerrainId } from '@/battle/types';
import { CHAPTER_STAGE_INDICES, STAGES_MVP, type StageDefMvp } from '@/data/stagesMvp';
import { ENDLESS_DUNGEON, ENDLESS_DUNGEON_ID } from '@/data/endlessCatalog';
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
}

const r = (rows: ShopPoolRow[]): ShopPoolRow[] => rows;

const POOL_GRASSLAND = r([
  { category: 'terrain', terrainId: 'high', price: 4 },
  { category: 'potion', potionId: 'heal', price: 5 },
  { category: 'potion', potionId: 'draught', price: 5 },
  { category: 'tempSkill', skillId: 'temp_gl_snare', price: 6 },
  { category: 'tempSkill', skillId: 'temp_gl_salve', price: 7 },
  { category: 'tempSkill', skillId: 'temp_gl_swarm', price: 8 },
  { category: 'tempSkill', skillId: 'temp_gl_horn', price: 7 },
]);

/**
 * 三章及以后暂时共用通用技能作临时技能。
 *
 * **这是欠的账，不是设计**：临时技能本该一章一套，玩家进新章节应该从技能名上
 * 就读出场景变了。草原（`temp_gl_*`）和密林（`temp_fo_*`）是范本，其余三章照着补即可——
 * 机制都现成，只是数据和图标。先这样是因为只有前两章过了数值回归，
 * 给还没调过的章节配专属内容，等于在会推翻的地基上堆东西。
 */
const TEMP_GENERIC = r([
  { category: 'tempSkill', skillId: 'war_shout', price: 8 },
  { category: 'tempSkill', skillId: 'field_bless', price: 8 },
]);

/**
 * 密林深处：卖森林券是这一章的关键一格。
 *
 * 森林在这一章既是掩体又是燃料，所以「买一片林子放下去」同时是防守手段和给
 * 「松脂火把」备料——同一张券有两种用法，而它们还互相冲突（烧了就没掩体了），
 * 这正是想要的那种决定。
 */
const POOL_FOREST = r([
  { category: 'terrain', terrainId: 'high', price: 4 },
  { category: 'terrain', terrainId: 'forest', price: 4 },
  { category: 'potion', potionId: 'heal', price: 5 },
  { category: 'potion', potionId: 'slow', price: 6 },
  { category: 'tempSkill', skillId: 'temp_fo_torch', price: 8 },
  { category: 'tempSkill', skillId: 'temp_fo_thorn', price: 7 },
  { category: 'tempSkill', skillId: 'temp_fo_bark', price: 8 },
  { category: 'tempSkill', skillId: 'temp_fo_warden', price: 7 },
]);

const POOL_FORTRESS = r([
  { category: 'terrain', terrainId: 'high', price: 5 },
  { category: 'terrain', terrainId: 'wall', price: 5 },
  { category: 'potion', potionId: 'heal', price: 6 },
  { category: 'potion', potionId: 'draught', price: 6 },
  ...TEMP_GENERIC,
]);

const POOL_SWAMP = r([
  { category: 'terrain', terrainId: 'high', price: 5 },
  { category: 'terrain', terrainId: 'forest', price: 5 },
  { category: 'potion', potionId: 'heal', price: 6 },
  { category: 'potion', potionId: 'slow', price: 7 },
  ...TEMP_GENERIC,
]);

const POOL_DRAGON = r([
  { category: 'terrain', terrainId: 'high', price: 5 },
  { category: 'terrain', terrainId: 'forest', price: 5 },
  { category: 'terrain', terrainId: 'wall', price: 6 },
  { category: 'potion', potionId: 'heal', price: 7 },
  { category: 'potion', potionId: 'draught', price: 7 },
  { category: 'potion', potionId: 'slow', price: 7 },
  ...TEMP_GENERIC,
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
    desc: '血牙部族入侵草原，新兵在此经受完整试炼。',
    nodes: buildNodes(chapterStages(1)),
    roguelikePool: POOL_GRASSLAND,
    metaReward: 10,
    enemyScaleBase: 1.0,
    maxParty: 4,
    unlock: { kind: 'default' },
    themeColor: 0x5a9e3a,
    art: 'chapter_grassland',
  },
  {
    id: 'dungeon_forest',
    name: '密林深处',
    desc: '林地伏击，远程与机动更危险。',
    nodes: buildNodes(chapterStages(2)),
    roguelikePool: POOL_FOREST,
    metaReward: 12,
    enemyScaleBase: 1.05,
    maxParty: 4,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_grassland' },
    themeColor: 0x2d7a4d,
  },
  {
    id: 'dungeon_fortress',
    name: '要塞攻防',
    desc: '城墙与高地纵横，正面强攻。',
    nodes: buildNodes(chapterStages(3)),
    roguelikePool: POOL_FORTRESS,
    metaReward: 14,
    enemyScaleBase: 1.12,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_forest' },
    themeColor: 0x8a7a5a,
  },
  {
    id: 'dungeon_swamp',
    name: '毒沼泥潭',
    desc: '沼泽减速，阵地与控制为王。',
    nodes: buildNodes(chapterStages(4)),
    roguelikePool: POOL_SWAMP,
    metaReward: 16,
    enemyScaleBase: 1.2,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_fortress' },
    themeColor: 0x5a7a3a,
  },
  {
    id: 'dungeon_dragon',
    name: '龙岭绝巅',
    desc: '终焉之地，龙王与精锐镇守。',
    nodes: buildNodes(chapterStages(5)),
    roguelikePool: POOL_DRAGON,
    metaReward: 20,
    enemyScaleBase: 1.3,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_swamp' },
    themeColor: 0x8a3a3a,
  },
];

const DUNGEON_BY_ID: Record<string, DungeonDef> = Object.fromEntries(
  DUNGEON_DEFS.map((d) => [d.id, d]),
);

export function getDungeonDef(id: string): DungeonDef | undefined {
  // 无尽试炼不进 DUNGEON_DEFS（那是冒险页章节表），但存档和 currentDungeon 仍按 id 查
  if (id === ENDLESS_DUNGEON_ID) return ENDLESS_DUNGEON;
  return DUNGEON_BY_ID[id];
}

/** 默认即解锁的副本 id */
export const DEFAULT_DUNGEON_IDS: readonly string[] = DUNGEON_DEFS.filter(
  (d) => d.unlock.kind === 'default',
).map((d) => d.id);
