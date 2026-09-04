import type { TerrainId, TimedBattleEffect, UnitKind, Vec2 } from '@/battle/types';
import type { StageDefMvp } from '@/data/stagesMvp';
import { STAGES_MVP } from '@/data/stagesMvp';
import { isSandboxDungeon, SANDBOX_STAGE } from '@/data/sandboxLab';
import {
  DEFAULT_DUNGEON_IDS,
  getDungeonDef,
  type DungeonDef,
  type NodeDef,
} from '@/data/dungeonCatalog';
import { emptyRunStarStats, type RunStarStats } from '@/data/chapterStars';
import { ENDLESS_DUNGEON_ID, isEndlessDungeon } from '@/data/endlessCatalog';
import { mergeTerrainOverlay, type TerrainGrid } from '@/battle/grid';
import { createStarterRoster } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';

/**
 * 两层状态：
 * - MetaState（持久）：名册 + 等级/技能、meta 货币、副本解锁。
 * - RunState（单副本一局，临时）：节点进度、局内金币、局内 roguelike 构筑。
 * MvpGameState 为运行时聚合：`meta` 常驻，`run` 是当前在打的那一局，
 * `parkedRun` 停着另一条线（冒险 ↔ 无尽）的进度。
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
   * 各副本**已打通过的节点数**，用来判节点首通魂晶。
   *
   * 扫荡改成整章入口之后，这个字段不再决定能不能扫——整章通关看 `clearedDungeonIds`。
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
   * 无尽试炼到过的最高波数。可选：老存档没有这个字段，读的时候按 0 算
   * （`endlessBestFloor()`）。同版本内加一个数，不升档。
   */
  endlessBestFloor?: number;
  /**
   * 各章已领奖的星（3bit）。可选：老档没有，读档时按 `clearedDungeonIds` 补满，
   * 避免把已经拿过的整笔 metaReward 再发一遍。
   */
  chapterStarsByDungeonId?: Record<string, number>;
  /**
   * 新手引导步骤。可选：老档没有，读档时按通关/名册补成已完成。
   * 不升 META_VERSION。
   */
  tutorialStep?: number;
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
  /** 本节点广告额外上阵位。入口先关掉，字段还留着以免旧档对不上 */
  adExtraSlot: number;
  /** 战斗胜利后待选的三选一战利品（选完 / 跳过后清空） */
  pendingLoot: LootOption[] | null;
  lastReportWinner: 'player' | 'enemy' | null;
  /** 刚打完那场的结算奖励，供战后弹窗显示；领完清空 */
  lastVictory: VictoryReward | null;
  /**
   * 无尽试炼局内状态。主线 run 为 undefined。
   *
   * 波次不走 `nodeIndex`：无尽是同一张图连打，布阵只做一次。
   * 用节点推进会清掉部署、把玩家踢回布阵页，和「清完一波原地刷下一波」对着干。
   */
  endless?: EndlessRunState;
  /** 本局评星累计。出副本即弃 */
  starStats: RunStarStats;
}

/** 无尽试炼里一名我方单位跨波带过去的状态 */
export interface EndlessCarry {
  rosterId: string;
  uid: string;
  hp: number;
  pos: Vec2;
  skillCd: number;
  tempSkillCd?: number;
  timedBattleEffects?: TimedBattleEffect[];
}

export interface EndlessRunState {
  /** 当前正在打 / 刚打完的波，从 1 起 */
  wave: number;
  /** 当前这一波是否已经打赢。用来区分「第 3 波进行中」和「第 3 波刚清完」 */
  clearedCurrent: boolean;
  /** 上一波结束时还活着的我方。第一波布阵前是 null */
  carry: EndlessCarry[] | null;
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
  /** 当前正在打的那一局（布阵 / 战斗 / 商店） */
  run: RunState | null;
  /**
   * 另一条线的挂起进度。冒险和无尽各占一条线，互不覆盖：
   * 进无尽时把冒险停在这里，打完无尽还能接着推章节。
   */
  parkedRun: RunState | null;
  phase: GamePhase;
  lastEventsLen: number;
}

/** 副本页那条线（无尽 / 日后的活动）；其余都算冒险 */
export function isChallengeLaneRun(run: RunState | null | undefined): boolean {
  return !!run && isEndlessDungeon(run.dungeonId);
}

export function adventureRunOf(state: MvpGameState): RunState | null {
  if (state.run && !isChallengeLaneRun(state.run)) return state.run;
  if (state.parkedRun && !isChallengeLaneRun(state.parkedRun)) return state.parkedRun;
  return null;
}

export function challengeRunOf(state: MvpGameState): RunState | null {
  if (isChallengeLaneRun(state.run)) return state.run;
  if (isChallengeLaneRun(state.parkedRun)) return state.parkedRun;
  return null;
}

/**
 * 把指定线切到前台。另一条线有进度就停到 `parkedRun`。
 * 返回 false 表示这条线没有可恢复的局。
 */
export function activateRunLane(state: MvpGameState, lane: 'adventure' | 'challenge'): boolean {
  const match = (run: RunState | null): boolean =>
    !!run && (lane === 'challenge') === isChallengeLaneRun(run);
  if (match(state.run)) return true;
  if (!match(state.parkedRun)) return false;
  const swap = state.run;
  state.run = state.parkedRun;
  state.parkedRun = swap;
  return true;
}

/** 开新局前：把另一条线的进度停住，同线旧局直接丢掉 */
export function prepareLaneForStart(state: MvpGameState, next: RunState): void {
  const nextIsChallenge = isChallengeLaneRun(next);
  if (state.run && isChallengeLaneRun(state.run) !== nextIsChallenge) {
    state.parkedRun = state.run;
    return;
  }
  if (!state.run && state.parkedRun && isChallengeLaneRun(state.parkedRun) === nextIsChallenge) {
    state.parkedRun = null;
  }
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
    chapterStarsByDungeonId: {},
    tutorialStep: 0,
  };
}

export function createInitialState(): MvpGameState {
  resetPid();
  return {
    meta: createInitialMeta(),
    run: null,
    parkedRun: null,
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
    starStats: emptyRunStarStats(),
    endless: dungeonId === ENDLESS_DUNGEON_ID
      ? { wave: 1, clearedCurrent: false, carry: null }
      : undefined,
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

/** 本场实际上场的角色（布阵格上有人）。战后词条只发给这些人。 */
export function deployedCharacters(state: MvpGameState): Character[] {
  const run = state.run;
  if (!run) return [];
  const on = new Set(run.placements.map((p) => p.rosterId));
  return partyCharacters(state).filter((m) => on.has(m.rosterId));
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
  const run = requireRun(state);
  if (isSandboxDungeon(run.dungeonId)) return SANDBOX_STAGE;
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
