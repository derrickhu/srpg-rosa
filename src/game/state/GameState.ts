import type { TerrainId, UnitKind, Vec2 } from '@/battle/types';
import type { StageDefMvp } from '@/data/stagesMvp';
import { STAGES_MVP } from '@/data/stagesMvp';
import {
  DEFAULT_DUNGEON_IDS,
  getDungeonDef,
  type DungeonDef,
  type NodeDef,
} from '@/data/dungeonCatalog';
import { mergeTerrainOverlay, type TerrainGrid } from '@/battle/grid';
import { createStarterRoster } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';

/**
 * 两层状态：
 * - MetaState（持久）：名册 + 等级/技能、meta 货币、副本解锁。
 * - RunState（单副本一局，临时）：节点进度、局内金币、局内 roguelike 构筑。
 * MvpGameState 为运行时聚合：`meta` 常驻，`run` 仅在副本中存在。
 */

export type GamePhase = 'hub' | 'deploy' | 'battle' | 'result' | 'shop' | 'run_done';

export type ShopOffer =
  | {
      type: 'tempSkill';
      skillId: string;
      name: string;
      price: number;
    }
  | { type: 'terrain'; terrainId: TerrainId; name: string; price: number }
  | { type: 'potion'; potionId: string; name: string; price: number };

/**
 * 战斗胜利后的三选一：只放**局内强化**。
 *
 * 这里曾经还有一档「金币袋」，已删。金币在结算第一屏作为固定奖励发放，
 * 两边都出会让玩家分不清战后给的和商店卖的到底是不是一回事（见 `rollLoot`）。
 */
export type LootOption =
  | {
      kind: 'skillMod';
      modId: string;
      /** 加给谁。词条按角色记，所以这是结算的主键 */
      rosterId: string;
      /** 他当前带的技能，仅用于卡面展示图标和文案，不参与结算 */
      skillId: string;
      name: string;
      desc: string;
    }
  | { kind: 'potion'; potionId: string; name: string; desc: string };

export interface PlacementEntry {
  uid: string;
  rosterId: string;
  pos: Vec2;
}

export interface TerrainOverlayCell {
  x: number;
  y: number;
  terrain: TerrainId;
}

export const META_VERSION = 3 as const;

/** 持久 meta 存档 */
export interface MetaState {
  version: typeof META_VERSION;
  roster: Character[];
  /** meta 货币（魂晶） */
  metaCurrency: number;
  unlockedDungeonIds: string[];
  clearedDungeonIds: string[];
  /**
   * 各副本**已打通过的战斗节点数**，用来判定某个节点能不能扫荡（见 `canSweep`）。
   *
   * 按节点记而不是按副本记：扫荡的用途是「把已经会打的关快速过掉」，
   * 而玩家通常是卡在某一关反复重来的。要求整章通关才给扫荡，等于在他最需要少受折磨的
   * 那段路上一直不给——而通关之后他也不太会再回来刷了。
   */
  clearedNodesByDungeonId: Record<string, number>;
  /**
   * 每日扫荡配额的消耗记录：dungeonId → 那天用了几次。
   *
   * 扫荡直接发全额奖励（含整章重复通关的魂晶），所以刷取的天花板只能靠次数来定。
   * 记 `date` 而不是记「剩余次数」：剩余次数需要有人在跨天时主动去重置，而这个游戏
   * 没有服务端 tick，玩家不开客户端就没人跑那段代码。存「哪天用了多少」则是自证的——
   * 读的时候比一下日期就知道该不该归零。
   */
  sweepUsageByDungeonId: Record<string, { date: string; used: number }>;
  /**
   * 无尽试炼到过的最深层数。可选：老存档没有这个字段，读的时候按 0 算
   * （`endlessBestFloor()`）。玩法还没实装，先把存档位留出来——
   * 等真做的时候再改 `MetaState` 就得连着迁版本，而这只是一个数。
   */
  endlessBestFloor?: number;
}

/** 单副本一局的临时状态（roguelike 构筑都在这里，结束即弃） */
export interface RunState {
  dungeonId: string;
  /** 当前节点下标（指向 dungeon.nodes） */
  nodeIndex: number;
  /** 局内金币 */
  gold: number;
  /** 带入本局的角色 rosterId 列表 */
  partyRosterIds: string[];
  placements: PlacementEntry[];
  /** 地形券库存：terrainId → 剩余放置次数 */
  terrainCharges: Record<string, number>;
  terrainOverlay: TerrainOverlayCell[];
  /** 药剂库存（战斗回放中手动使用） */
  potions: Record<string, number>;
  /**
   * 局内技能词条：**rosterId** → 已挂的词条 id 列表（同一个 id 出现几次就是几层）。
   *
   * 曾经按 skillId 记，理由是「旋风斩附带中毒」比「雷恩附带中毒」更好读。
   * 换成按角色记有两个按 skillId 记做不到的事：
   *
   * 1. **三选一卡片能指名道姓**。队里两个剑士都带旋风斩时，按技能记意味着这条词条
   *    两个人一起吃，卡面上放谁的头像都是假的。玩家要看的是「这次强化归谁」。
   * 2. **换技能不清零**。角色换主技能（布阵页切换 / 买到临时技能）时，攒的词条跟着人走，
   *    不会凭空蒸发。按 skillId 记时换一次技能等于把投入全丢了，而且界面上不提示。
   *
   * 代价是换技能后个别词条可能不适用（「横扫」挂到单体技能上），这种由
   * `effectiveSkillSpec` 的 `canApply` 静默跳过——**休眠不是丢失**，换回去就恢复。
   * 战前由 `DeployManager` 烘焙进 `UnitState.skillMods`。
   */
  skillMods: Record<string, string[]>;
  /**
   * 局内临时技能槽：rosterId → skillId。第二个技能位，只由商店发放。
   *
   * 独立于主技能槽而不是覆盖它：商店以前直接改 `runEquip`，等于拿一个没冷却过的
   * 新技能换掉你攒了半局词条的旧技能，而且是买完自动生效、不给选择。
   * 现在是纯加法——买到只会多一个按钮，不会少任何东西。
   */
  runTempSkill: Record<string, string>;
  /** 局内主技能装配覆盖（rosterId → skillId），不写回 meta */
  runEquip: Record<string, string>;
  /** 本节点看广告额外解锁的上阵位数（每节点重置） */
  adExtraSlot: number;
  /** 战斗胜利后待选的三选一战利品（选完 / 跳过后清空） */
  pendingLoot: LootOption[] | null;
  lastReportWinner: 'player' | 'enemy' | null;
  /** 刚打完那场的结算奖励，供战后弹窗显示；领完清空 */
  lastVictory: VictoryReward | null;
}

/** 一场战斗胜利的固定奖励（三选一不含在内，那是另一步） */
export interface VictoryReward {
  gold: number;
  /** 已直接入账 `meta.metaCurrency` 的魂晶；0 = 这个节点以前通过了，不再给 */
  soul: number;
  /** 这个节点是不是第一次通过 */
  firstClear: boolean;
}

export interface MvpGameState {
  meta: MetaState;
  run: RunState | null;
  phase: GamePhase;
  lastEventsLen: number;
}

export type BuyShopContext = {
  /** 临时技能买给谁；临时技能不挑职业，队里任何人都能装 */
  tempSkillTargetRosterId?: string;
};

let pid = 0;
export function nextPid(): string {
  pid += 1;
  return `p_${pid}`;
}
export function resetPid(): void {
  pid = 0;
}

export function createInitialMeta(): MetaState {
  return {
    version: META_VERSION,
    roster: createStarterRoster(),
    metaCurrency: 0,
    unlockedDungeonIds: [...DEFAULT_DUNGEON_IDS],
    clearedDungeonIds: [],
    clearedNodesByDungeonId: {},
    sweepUsageByDungeonId: {},
  };
}

export function createInitialState(): MvpGameState {
  resetPid();
  return {
    meta: createInitialMeta(),
    run: null,
    phase: 'hub',
    lastEventsLen: 0,
  };
}

/** 新建一局副本 run（不改变 meta；nodeIndex 从 0 开始） */
export function createRunState(dungeonId: string, partyRosterIds: string[]): RunState {
  return {
    dungeonId,
    nodeIndex: 0,
    gold: 0,
    partyRosterIds: [...partyRosterIds],
    placements: [],
    terrainCharges: {},
    terrainOverlay: [],
    potions: {},
    skillMods: {},
    runTempSkill: {},
    runEquip: {},
    adExtraSlot: 0,
    pendingLoot: null,
    lastReportWinner: null,
    lastVictory: null,
  };
}

export function requireRun(state: MvpGameState): RunState {
  if (!state.run) throw new Error('No active run');
  return state.run;
}

export function getCharacter(state: MvpGameState, rosterId: string): Character | undefined {
  return state.meta.roster.find((m) => m.rosterId === rosterId);
}

/** 带入本局的角色（按 party 顺序） */
export function partyCharacters(state: MvpGameState): Character[] {
  const run = state.run;
  if (!run) return [];
  const out: Character[] = [];
  for (const id of run.partyRosterIds) {
    const m = getCharacter(state, id);
    if (m) out.push(m);
  }
  return out;
}

/** 替补席：本局阵容中尚未上阵者 */
export function benchCharacters(state: MvpGameState): Character[] {
  const run = state.run;
  if (!run) return [];
  const on = new Set(run.placements.map((p) => p.rosterId));
  return partyCharacters(state).filter((m) => !on.has(m.rosterId));
}

export function currentDungeon(state: MvpGameState): DungeonDef {
  const run = requireRun(state);
  const d = getDungeonDef(run.dungeonId);
  if (!d) throw new Error(`Unknown dungeon ${run.dungeonId}`);
  return d;
}

export function currentNode(state: MvpGameState): NodeDef {
  const d = currentDungeon(state);
  const run = requireRun(state);
  return d.nodes[run.nodeIndex]!;
}

/**
 * 距下一个 Boss 节点还有几个节点（0 = 当前就是 Boss）；后面没有 Boss 则 null。
 *
 * 用途是**在玩家还能行动的时刻**提醒备药。Boss 布阵页再提示已经太晚——
 * 补给点在 Boss 前一个节点，那时候钱还在、药还买得到。
 */
export function nodesUntilBoss(state: MvpGameState): number | null {
  const d = currentDungeon(state);
  const run = requireRun(state);
  for (let i = run.nodeIndex; i < d.nodes.length; i += 1) {
    if (d.nodes[i]!.kind === 'boss') return i - run.nodeIndex;
  }
  return null;
}

/** 当前战斗节点的关卡蓝图（仅战斗/Boss 节点有效） */
export function currentStage(state: MvpGameState): StageDefMvp {
  const node = currentNode(state);
  const si = node.stageIndex ?? 0;
  return STAGES_MVP[si]!;
}

/** 当前节点敌人数值缩放 = 副本基础 × 节点缩放 */
export function currentEnemyScale(state: MvpGameState): number {
  const d = currentDungeon(state);
  const node = currentNode(state);
  return d.enemyScaleBase * (node.enemyScale ?? 1);
}

export function battleTerrain(state: MvpGameState): TerrainGrid {
  const run = requireRun(state);
  return mergeTerrainOverlay(currentStage(state).terrain, run.terrainOverlay);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
