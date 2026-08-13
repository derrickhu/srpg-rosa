import type {
  BattleEvent,
  BattleReport,
  Faction,
  UnitArchetypeDef,
  UnitKind,
  UnitState,
  Vec2,
} from './types';
import { effectiveUnitDef } from './effectiveUnit';
import { canAttackFrom, chooseTurnAction, selectAttackTarget, type AiDifficulty } from './ai';
import { computeDamage, terrainAttackNote, terrainDefenseNote } from './damage';
import { POTION_DEFS } from '@/data/potionCatalog';
import { getTerrainAt, type TerrainGrid } from './grid';
import { MAX_BATTLE_ROUNDS } from './constants';
import { cellsFromDist, reachableCells, shortestPath4 } from './path';
import {
  castSkillManual,
  skillAiming,
  type SkillSlot,
  trySkillAfterMove,
  trySkillBeforeMove,
  unitSkillSpec,
  type SkillAiming,
} from './skills';
import { tickTimedBattleEffects } from './timedBattleEffects';
import { getTerrainSpec } from '@/data/terrainSpec';

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

function cloneUnits(units: UnitState[]): UnitState[] {
  return units.map((u) => ({
    uid: u.uid,
    defId: u.defId,
    faction: u.faction,
    hp: u.hp,
    pos: { ...u.pos },
    skillCd: u.skillCd ?? 0,
    movedInTurn: false,
    battleSkill: u.battleSkill,
    tempSkill: u.tempSkill,
    tempSkillCd: u.tempSkillCd ?? 0,
    skillMods: u.skillMods ? [...u.skillMods] : undefined,
    bonusAtk: u.bonusAtk,
    bonusSpd: u.bonusSpd,
    bonusMove: u.bonusMove,
    rosterId: u.rosterId,
    displayName: u.displayName,
    boss: u.boss,
    animSet: u.animSet,
    mercMaxHp: u.mercMaxHp,
    mercAtk: u.mercAtk,
    mercSpd: u.mercSpd,
    mercMove: u.mercMove,
    mercRange: u.mercRange,
    mercIsRanged: u.mercIsRanged,
    mercTaunt: u.mercTaunt,
    timedBattleEffects: u.timedBattleEffects?.map((e) => {
      switch (e.kind) {
        case 'taunt':
          return { kind: 'taunt' as const, roundsLeft: e.roundsLeft };
        case 'atkBonus':
          return { kind: 'atkBonus' as const, addAtk: e.addAtk, roundsLeft: e.roundsLeft };
        case 'atkDown':
          return { kind: 'atkDown' as const, subAtk: e.subAtk, roundsLeft: e.roundsLeft };
        case 'spdDown':
          return { kind: 'spdDown' as const, subSpd: e.subSpd, roundsLeft: e.roundsLeft };
        case 'spdBonus':
          return { kind: 'spdBonus' as const, addSpd: e.addSpd, roundsLeft: e.roundsLeft };
        case 'poison':
          return { kind: 'poison' as const, dmgPerRound: e.dmgPerRound, roundsLeft: e.roundsLeft };
      }
    }),
  }));
}

function buildBlocked(units: UnitState[], selfUid: string): Set<string> {
  const s = new Set<string>();
  for (const u of units) {
    if (u.hp <= 0) continue;
    if (u.uid === selfUid) continue;
    s.add(key(u.pos));
  }
  return s;
}

function bySpeedOrder(units: UnitState[], defs: Record<UnitKind, UnitArchetypeDef>): UnitState[] {
  return [...units]
    .filter((u) => u.hp > 0)
    .sort((a, b) => {
      const sa = effectiveUnitDef(a, defs).spd;
      const sb = effectiveUnitDef(b, defs).spd;
      if (sb !== sa) return sb - sa;
      return a.uid.localeCompare(b.uid);
    });
}

function checkWinner(units: UnitState[]): 'player' | 'enemy' | null {
  const p = units.some((u) => u.faction === 'player' && u.hp > 0);
  const e = units.some((u) => u.faction === 'enemy' && u.hp > 0);
  if (p && e) return null;
  if (p) return 'player';
  return 'enemy';
}

/**
 * `manual`：玩家单位逐个停下来等指令（走位 / 技能 / 普攻全由玩家决定）。
 * `auto`：全部交给 AI 代打，用于扫荡已通过的关卡。
 */
export type BattleMode = 'manual' | 'auto';

export interface BattleSimOptions {
  aiDifficulty?: AiDifficulty;
  /** 缺省 `auto`，保持 `runBattle` 等纯模拟调用方的行为不变 */
  mode?: BattleMode;
}

/**
 * 人工模式下当前单位的内部进度。
 *
 * 一个回合里**移动、技能、普攻各一次**，顺序不限。这里不采用「行动即结束回合」的经典
 * 战棋规则，因为 AI 走的 `actTurn` 是技能和普攻都打的（见 `actTurn`）——限制成二选一，
 * 人工输出就直接比自动低一截，扫荡会严格优于亲手打，那玩家没有理由认真玩。
 * 规则对齐 AI 之后，人工模式相对自动的优势才落在「走位和时机」这件唯一该由人做的事上。
 *
 * `startPos` 只为撤销移动留着。撤销不需要整份快照：移动只改 `pos` 和 `movedInTurn`
 * （地形每回合掉血在 `startRound` 结算，不在踏入时触发），复位这两个就是精确回滚。
 */
interface MutablePending {
  uid: string;
  moved: boolean;
  usedSkill: boolean;
  attacked: boolean;
  startPos: Vec2;
}

/** 一次 step 的结果：本步产生的事件 + 是否结束 */
export interface BattleStep {
  events: BattleEvent[];
  done: boolean;
  winner: Faction | null;
}

/**
 * 人工模式下，当前行动单位还剩哪些操作没用。
 *
 * `can*` 和 `did*` 都要给：光看 `canSkill: false` 分不清是「这回合已经放过了」
 * 还是「冷却中 / 范围里没目标」。玩家看到一个灰掉的按钮，这两种原因要求的
 * 下一步完全不同（前者是接着打普攻，后者是走位或换人），所以界面必须能区分。
 */
/** 两个技能槽的固定顺序，UI 生成按钮和引擎枚举可放槽位都按它走 */
const SKILL_SLOTS: readonly SkillSlot[] = ['main', 'temp'];

export interface PendingTurn {
  uid: string;
  /** 还能移动（每回合一次；与技能/普攻顺序不限，和 AI `actTurn` 一致） */
  canMove: boolean;
  /**
   * 还能放技能（任一槽）。
   *
   * 两个槽**共用**这一个额度：临时技能给的是「主技能在冷却时还有别的事可做」，
   * 不是每回合多打一发。具体哪些槽此刻放得出来看 `castableSlots`。
   */
  canSkill: boolean;
  /** 此刻放得出来的槽（主 / 临时），按钮按它来生成 */
  castableSlots: SkillSlot[];
  /** 还能普攻 */
  canAttack: boolean;
  /** 已经移动过、但还没出手，可以撤销回原位 */
  canUndoMove: boolean;
  didMove: boolean;
  didSkill: boolean;
  didAttack: boolean;
}

/**
 * 逐步战斗模拟器。
 *
 * 两种推进方式，视图侧按 `pending()` 是否为空来分流：
 * - `stepTurn()`：推进一个回合边界，或让一个 **AI 单位**打完整个回合（敌方 / 自动模式）。
 * - `command*()`：人工模式下逐个动作推进当前玩家单位，每个都返回本次产生的事件。
 *
 * 两条路产出的事件格式完全一致，所以回放层只需要一套 `playEvent`。
 */
export interface BattleSim {
  stepTurn(): BattleStep;
  /** 人工模式下正在等指令的单位；null = 该调 `stepTurn()` 了 */
  pending(): PendingTurn | null;
  /** 从当前位置可移动到的格（不含脚下那格） */
  legalMoveCells(uid: string): Vec2[];
  /** 从当前位置能普攻到的敌人 uid */
  legalAttackTargets(uid: string): string[];
  /** 技能瞄准信息；null = 当前放不出来（冷却 / 范围内无目标 / 已用过） */
  skillAiming(uid: string, slot?: SkillSlot): SkillAiming | null;
  /** 移动到指定格（必须在 `legalMoveCells` 内，否则原地不动返回空事件） */
  commandMove(uid: string, cell: Vec2): BattleStep;
  /** 撤销本回合的移动（仅在还没出手时可用） */
  commandUndoMove(uid: string): BattleStep;
  /**
   * 放技能。
   * - 单体点名：`targetUid` 见 `SkillAiming.candidates`
   * - 直线/范围确认：`aimCell` 见 `SkillAiming.aimCells`
   * - 无需瞄准：两者都可省略
   */
  commandSkill(uid: string, targetUid?: string, slot?: SkillSlot, aimCell?: Vec2): BattleStep;
  commandAttack(uid: string, targetUid: string): BattleStep;
  /** 结束该单位回合（待机） */
  commandWait(uid: string): BattleStep;
  /** 使用药剂（立即生效，返回产生的事件供回放展示） */
  usePotion(potionId: string): BattleEvent[];
  /**
   * 跳过：一口气模拟到结束，返回完整战报（含之前已消费的事件）。
   * 人工模式下也可用——剩下的交给 AI 代打，当前单位没用完的动作会被接着打完。
   */
  runToEnd(): BattleReport;
  /** 当前存活单位（实时状态，供 UI 读取血量/冷却） */
  getUnits(): UnitState[];
  getUnit(uid: string): UnitState | undefined;
  /**
   * 本回合还没动到的单位（uid）。
   * 当前正在行动的人已被弹出，不在这里——UI 要自己把 current 拼到队首。
   */
  roundOrder(): string[];
  /**
   * 出手顺序预览：当前行动者（可选）+ 本回合剩余 + 按速度预估的后续回合，
   * 凑满 `limit` 个。顺序条要靠这条做跨回合规划，不能只看本回合尾巴。
   */
  upcomingOrder(limit: number, currentUid?: string | null): string[];
  getRound(): number;
  isDone(): boolean;
}

export function createBattleSim(
  initialUnits: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  opts: BattleSimOptions = {},
): BattleSim {
  const units = cloneUnits(initialUnits);
  const aiDifficulty = opts.aiDifficulty ?? 'normal';
  const mode: BattleMode = opts.mode ?? 'auto';
  const allEvents: BattleEvent[] = [];
  /**
   * 跳过 / 扫荡时置位，之后玩家单位也由 AI 接手。
   * 和 `mode` 分开：`mode` 是这一局开局选的，`forceAuto` 是中途按了跳过——
   * 两者混成一个变量的话，跳过一次就等于永久改了这局的模式，回不去了。
   */
  let forceAuto = mode === 'auto';
  /** 人工模式下当前停下来等指令的单位 */
  let pendingTurn: MutablePending | null = null;
  let rounds = 0;
  let order: string[] = [];
  let done = false;
  let winner: Faction | null = null;

  function finish(w: Faction, events: BattleEvent[]): BattleStep {
    done = true;
    winner = w;
    pendingTurn = null;
    events.push({ type: 'end', winner: w });
    allEvents.push(...events);
    return { events, done: true, winner: w };
  }

  /** 沿最短路走到 `to`，逐格发 moveStep 供回放做动画 */
  function moveAlong(self: UnitState, to: Vec2): BattleEvent[] {
    const path = shortestPath4(self.pos, to, buildBlocked(units, self.uid), terrain);
    if (!path || path.length <= 1) return [];
    const events: BattleEvent[] = [];
    for (let i = 1; i < path.length; i++) {
      const from = { ...self.pos };
      const next = { ...path[i]! };
      self.pos = next;
      self.movedInTurn = true;
      events.push({ type: 'moveStep', uid: self.uid, from, to: next });
    }
    return events;
  }

  function liveUnit(uid: string): UnitState | null {
    const u = units.find((x) => x.uid === uid);
    return u && u.hp > 0 ? u : null;
  }

  function reachFrom(u: UnitState): Vec2[] {
    const atkDef = effectiveUnitDef(u, defs);
    const dist = reachableCells(u.pos, atkDef.move, buildBlocked(units, u.uid), terrain);
    return cellsFromDist(u.pos, dist).filter((c) => !(c.x === u.pos.x && c.y === u.pos.y));
  }

  function attackTargetsFrom(u: UnitState): string[] {
    const atkDef = effectiveUnitDef(u, defs);
    return units
      .filter((t) => t.hp > 0 && t.faction !== u.faction && canAttackFrom(atkDef, u.pos, t))
      .map((t) => t.uid);
  }

  function startRound(): BattleStep {
    rounds += 1;
    const events: BattleEvent[] = [{ type: 'round', round: rounds }];
    for (const t of tickTimedBattleEffects(units)) {
      events.push({
        type: 'dot',
        uid: t.uid,
        damage: t.damage,
        hpLeft: t.hpLeft,
        source: 'poison',
      });
      if (t.died) events.push({ type: 'death', uid: t.uid });
    }
    for (const u of units) {
      if (u.hp <= 0) continue;
      u.movedInTurn = false;
      if (u.skillCd > 0) u.skillCd -= 1;
      if ((u.tempSkillCd ?? 0) > 0) u.tempSkillCd = (u.tempSkillCd ?? 0) - 1;
      const tSpec = getTerrainSpec(getTerrainAt(terrain, u.pos));
      if (tSpec.dotPerRound > 0) {
        u.hp -= tSpec.dotPerRound;
        events.push({
          type: 'dot',
          uid: u.uid,
          damage: tSpec.dotPerRound,
          hpLeft: Math.max(0, u.hp),
          source: 'terrain',
        });
        if (u.hp <= 0) {
          events.push({ type: 'death', uid: u.uid });
        }
      }
    }
    order = bySpeedOrder(units, defs).map((u) => u.uid);
    const w = checkWinner(units);
    if (w) return finish(w, events);
    allEvents.push(...events);
    return { events, done: false, winner: null };
  }

  /**
   * AI 打完一个单位的整个回合。
   *
   * `resume` 是人工模式下按了跳过时传进来的进度：该单位可能已经走过、或已经放过技能。
   * 不传这个就只能二选一——要么让 AI 从头再走一遍（同一回合移动两次），要么直接丢掉
   * 它剩下的动作。后者在按跳过的那一刻会白送一次攻击机会，而玩家通常正是因为
   * 局势已定才按跳过的，凭空掉一刀会让结果和他的判断不符。
   */
  function actTurn(self: UnitState, resume?: MutablePending): BattleStep {
    const events: BattleEvent[] = [];
    const canSkill = !resume?.usedSkill;
    const canMove = !resume?.moved;
    const canAttack = !resume?.attacked;
    if (resume?.moved) self.movedInTurn = true;

    if (canSkill) {
      events.push(...trySkillBeforeMove(self, defs, units, terrain));
    }
    let w = checkWinner(units);
    if (w) return finish(w, events);

    const choice = chooseTurnAction(
      self, defs, units, terrain,
      self.faction === 'enemy' ? aiDifficulty : 'normal',
    );

    const atkDef = effectiveUnitDef(self, defs);
    if (canMove) {
      const blockedReach = buildBlocked(units, self.uid);
      const reachDist = reachableCells(self.pos, atkDef.move, blockedReach, terrain);
      events.push({
        type: 'moveRange',
        uid: self.uid,
        cells: cellsFromDist(self.pos, reachDist),
      });
    }

    if (canMove && choice.moveTo) {
      events.push(...moveAlong(self, choice.moveTo));
    }

    if (canSkill) {
      events.push(...trySkillAfterMove(self, defs, units, terrain));
    }
    w = checkWinner(units);
    if (w) return finish(w, events);

    // 已经由玩家走过位了，就不能沿用 choice 里那个「配着别的落点」算出来的目标
    const tgt = !canAttack
      ? null
      : canMove
        ? choice.attackTarget
        : selectAttackTarget(
          atkDef,
          self.pos,
          units.filter((u) => u.faction !== self.faction),
          defs,
          self.faction === 'enemy' ? aiDifficulty : 'normal',
        );
    if (tgt && tgt.hp > 0) {
      const tLive = units.find((u) => u.uid === tgt.uid);
      // 目标可能已被技能击杀，或因位移脱战
      if (tLive && tLive.hp > 0 && canAttackFrom(atkDef, self.pos, tLive)) {
        events.push(...basicAttack(self, tLive));
      }
    }

    w = checkWinner(units);
    if (w) return finish(w, events);
    allEvents.push(...events);
    return { events, done: false, winner: null };
  }

  /**
   * 一次普攻的结算。AI 回合和玩家指令共用，不要各写一份——
   * 冲锋加成、地形归因这些散在两条路上迟早会分叉，而分叉的表现是
   * 「同一招我打出 12、电脑打出 15」，玩家只会得出数值不可信的结论。
   */
  function basicAttack(self: UnitState, target: UnitState): BattleEvent[] {
    const atkDef = effectiveUnitDef(self, defs);
    const defT = effectiveUnitDef(target, defs);
    let dmg = computeDamage(atkDef, defT, terrain, self.pos, target.pos);
    const sk = atkDef.skill;
    // 走 `unitSkillSpec` 而不是 `getSkillSpec`：冲锋的倍率也吃词条（「蓄势」「践地」），
    // 读原始规格的话那两条选了等于没选，而表现只是普攻数字偏小，肉眼查不出来。
    const chargeMul = sk ? unitSkillSpec(self, sk.id)?.passiveBasicAttackMulIfMoved : undefined;
    const charged = Boolean(chargeMul) && self.movedInTurn;
    if (chargeMul && charged) {
      dmg = Math.max(1, Math.floor(dmg * chargeMul));
    }
    target.hp -= dmg;
    const events: BattleEvent[] = [{
      type: 'attack',
      attacker: self.uid,
      target: target.uid,
      damage: dmg,
      hpLeft: Math.max(0, target.hp),
      // 冲锋和地形一样，改了这一下的伤害就得说出来。骑兵的全部身份就是「先动再打更疼」，
      // 而在此之前它只体现为一个玩家无从比较的数字，等于这个被动不存在。
      attackLabel: charged ? '冲锋' : '普攻',
      charged: charged || undefined,
      // 地形改了这一下的伤害就说出来。地形之前「没用」很大一部分是因为它从不出声：
      // 高地 +25% 只体现为一个玩家无从比较的数字。
      atkTerrainNote: terrainAttackNote(terrain, self.pos) ?? undefined,
      defTerrainNote: terrainDefenseNote(terrain, target.pos) ?? undefined,
    }];
    if (target.hp <= 0) events.push({ type: 'death', uid: target.uid });
    return events;
  }

  function stepTurn(): BattleStep {
    if (done) return { events: [], done: true, winner };
    // 还有人在等指令时不许推进，否则玩家那个单位会被跳过
    if (pendingTurn) return { events: [], done: false, winner: null };
    // 回合边界
    if (order.length === 0) {
      const w0 = checkWinner(units);
      if (w0) return finish(w0, []);
      if (rounds >= MAX_BATTLE_ROUNDS) return finish('enemy', []);
      return startRound();
    }
    // 弹出下一个存活行动者
    while (order.length > 0) {
      const uid = order.shift()!;
      const self = units.find((u) => u.uid === uid);
      if (!self || self.hp <= 0) continue;
      const turnStart: BattleEvent = { type: 'turnStart', uid: self.uid, faction: self.faction };
      if (self.faction === 'player' && !forceAuto) {
        pendingTurn = {
          uid: self.uid,
          moved: false,
          usedSkill: false,
          attacked: false,
          startPos: { ...self.pos },
        };
        allEvents.push(turnStart);
        return { events: [turnStart], done: false, winner: null };
      }
      const step = actTurn(self);
      return { ...step, events: [turnStart, ...step.events] };
    }
    // 本回合行动者全部阵亡 → 直接进入下一回合边界
    return stepTurn();
  }

  // ============ 人工模式：逐指令推进 ============

  /** 当前等指令的单位；顺带处理它已经死了的情况（被反击/地形打死不会发生，但别留坑） */
  function activePending(uid: string): { p: MutablePending; u: UnitState } | null {
    if (done || !pendingTurn || pendingTurn.uid !== uid) return null;
    const u = liveUnit(uid);
    if (!u) return null;
    return { p: pendingTurn, u };
  }

  function pendingView(): PendingTurn | null {
    if (!pendingTurn) return null;
    const u = liveUnit(pendingTurn.uid);
    if (!u) return null;
    const acted = pendingTurn.usedSkill || pendingTurn.attacked;
    const castable = castableSlotsFor(u);
    return {
      uid: pendingTurn.uid,
      // 移动与出手顺序不限：AI 是先技能再走位再普攻的（见 `actTurn`），
      // 人工若「先放技能就锁死移动」，玩家永远学不会那套起手，也会白白丢掉走位。
      // 撤招只在「走过且还没出手」时开放——出手后再撤等于改写已经结算的伤害。
      canMove: !pendingTurn.moved,
      canSkill: castable.length > 0,
      castableSlots: castable,
      canAttack: !pendingTurn.attacked && attackTargetsFrom(u).length > 0,
      canUndoMove: pendingTurn.moved && !acted,
      didMove: pendingTurn.moved,
      didSkill: pendingTurn.usedSkill,
      didAttack: pendingTurn.attacked,
    };
  }

  function skillAimingFor(u: UnitState, slot: SkillSlot = 'main'): SkillAiming | null {
    if (pendingTurn?.uid === u.uid && pendingTurn.usedSkill) return null;
    return skillAiming(u, defs, units, terrain, slot);
  }

  function castableSlotsFor(u: UnitState): SkillSlot[] {
    return SKILL_SLOTS.filter((slot) => skillAimingFor(u, slot) !== null);
  }

  /**
   * 一个动作结算完之后：该结束回合就结束。
   *
   * 「无事可做就自动收尾」省掉了绝大多数回合里那一下多余的「结束」点击——
   * 常见回合就是走一步、砍一刀，技能在冷却，此时再要求玩家确认一次纯属噪音。
   * 但只要还有技能能放，就一定停下来等：替玩家决定放弃一次技能，比多一次点击糟得多。
   */
  function settleAfterAction(events: BattleEvent[]): BattleStep {
    const w = checkWinner(units);
    if (w) return finish(w, events);
    const v = pendingView();
    // 还有移动/出手额度，或还能撤销走位时，都停下来等。
    // 走完若立刻收尾，玩家来不及点撤销；先技能后走位也不能出手完就掐掉移动。
    if (!v || (!v.canMove && !v.canSkill && !v.canAttack && !v.canUndoMove)) {
      pendingTurn = null;
    }
    allEvents.push(...events);
    return { events, done: false, winner: null };
  }

  function noop(): BattleStep {
    return { events: [], done: false, winner: null };
  }

  function commandMove(uid: string, cell: Vec2): BattleStep {
    const cur = activePending(uid);
    if (!cur) return noop();
    const v = pendingView();
    if (!v?.canMove) return noop();
    if (!reachFrom(cur.u).some((c) => c.x === cell.x && c.y === cell.y)) return noop();
    const events = moveAlong(cur.u, cell);
    if (events.length === 0) return noop();
    cur.p.moved = true;
    // 走完若技能/普攻也没了，settle 会自动收尾；还有出手额度则继续等
    return settleAfterAction(events);
  }

  function commandUndoMove(uid: string): BattleStep {
    const cur = activePending(uid);
    if (!cur) return noop();
    const v = pendingView();
    if (!v?.canUndoMove) return noop();
    const from = { ...cur.u.pos };
    cur.u.pos = { ...cur.p.startPos };
    cur.u.movedInTurn = false;
    cur.p.moved = false;
    // 用一步 moveStep 直接跳回原位，回放层按普通移动播即可
    const events: BattleEvent[] = [
      { type: 'moveStep', uid, from, to: { ...cur.p.startPos } },
    ];
    allEvents.push(...events);
    return { events, done: false, winner: null };
  }

  function commandSkill(
    uid: string,
    targetUid?: string,
    slot: SkillSlot = 'main',
    aimCell?: Vec2,
  ): BattleStep {
    const cur = activePending(uid);
    if (!cur) return noop();
    const v = pendingView();
    if (!v?.castableSlots.includes(slot)) return noop();
    const events = castSkillManual(cur.u, defs, units, terrain, targetUid, slot, aimCell);
    if (events.length === 0) return noop();
    cur.p.usedSkill = true;
    return settleAfterAction(events);
  }

  function commandAttack(uid: string, targetUid: string): BattleStep {
    const cur = activePending(uid);
    if (!cur) return noop();
    const v = pendingView();
    if (!v?.canAttack) return noop();
    if (!attackTargetsFrom(cur.u).includes(targetUid)) return noop();
    const target = liveUnit(targetUid);
    if (!target) return noop();
    cur.p.attacked = true;
    return settleAfterAction(basicAttack(cur.u, target));
  }

  function commandWait(uid: string): BattleStep {
    const cur = activePending(uid);
    if (!cur) return noop();
    pendingTurn = null;
    return noop();
  }

  function usePotion(potionId: string): BattleEvent[] {
    if (done) return [];
    const def = POTION_DEFS[potionId];
    if (!def) return [];
    const events: BattleEvent[] = [{ type: 'potion', potionId, name: def.name }];
    const eff = def.effect;
    if (eff.kind === 'healAllies') {
      for (const u of units) {
        if (u.faction !== 'player' || u.hp <= 0) continue;
        const maxHp = effectiveUnitDef(u, defs).maxHp;
        const amount = Math.max(1, Math.floor(maxHp * eff.ratio));
        const healed = Math.min(maxHp, u.hp + amount) - u.hp;
        if (healed <= 0) continue;
        u.hp += healed;
        events.push({ type: 'heal', target: u.uid, amount: healed, hpLeft: u.hp });
      }
    } else if (eff.kind === 'atkBuffAllies') {
      for (const u of units) {
        if (u.faction !== 'player' || u.hp <= 0) continue;
        const baseAtk = effectiveUnitDef(u, defs).atk;
        const addAtk = Math.max(1, Math.floor(baseAtk * eff.atkRatio));
        const list = u.timedBattleEffects ?? [];
        // +1：tick 在回合开始统一 -1，保证 buff 覆盖 N 个完整回合
        list.push({ kind: 'atkBonus', addAtk, roundsLeft: eff.rounds + 1 });
        u.timedBattleEffects = list;
        events.push({ type: 'statusNote', target: u.uid, text: `攻+${addAtk}`, tone: 'buff' });
      }
    } else if (eff.kind === 'slowFoes') {
      for (const u of units) {
        if (u.faction !== 'enemy' || u.hp <= 0) continue;
        const list: typeof u.timedBattleEffects =
          (u.timedBattleEffects ?? []).filter((x) => x.kind !== 'spdDown');
        list.push({ kind: 'spdDown', subSpd: eff.subSpd, roundsLeft: eff.rounds + 1 });
        u.timedBattleEffects = list;
        events.push({
          type: 'statusNote',
          target: u.uid,
          text: `速-${eff.subSpd}`,
          tone: 'debuff',
        });
      }
    }
    allEvents.push(...events);
    return events;
  }

  function runToEnd(): BattleReport {
    // 之后全部交给 AI。当前单位如果已经走了一半，把剩下的动作接着打完（见 actTurn 的 resume）
    forceAuto = true;
    if (pendingTurn) {
      const resume = pendingTurn;
      pendingTurn = null;
      const u = liveUnit(resume.uid);
      if (u) actTurn(u, resume);
    }
    while (!done) stepTurn();
    return { events: allEvents, winner: winner ?? 'enemy', rounds };
  }

  return {
    stepTurn,
    pending: pendingView,
    legalMoveCells: (uid) => {
      const u = liveUnit(uid);
      return u ? reachFrom(u) : [];
    },
    legalAttackTargets: (uid) => {
      const u = liveUnit(uid);
      return u ? attackTargetsFrom(u) : [];
    },
    skillAiming: (uid, slot) => {
      const u = liveUnit(uid);
      return u ? skillAimingFor(u, slot ?? 'main') : null;
    },
    commandMove,
    commandUndoMove,
    commandSkill,
    commandAttack,
    commandWait,
    usePotion,
    runToEnd,
    getUnits: () => units,
    getUnit: (uid) => units.find((u) => u.uid === uid),
    roundOrder: () => [...order],
    upcomingOrder: (limit, currentUid) => {
      const alive = units.filter((u) => u.hp > 0);
      const aliveIds = new Set(alive.map((u) => u.uid));
      const out: string[] = [];
      if (currentUid && aliveIds.has(currentUid)) out.push(currentUid);
      for (const uid of order) {
        if (out.length >= limit) break;
        if (aliveIds.has(uid) && uid !== currentUid) out.push(uid);
      }
      // 本回合队列耗尽后，用当前速度序循环预估下一回合、下下回合……
      while (out.length < limit && alive.length > 0) {
        const next = bySpeedOrder(alive, defs).map((u) => u.uid);
        let added = 0;
        for (const uid of next) {
          if (out.length >= limit) break;
          out.push(uid);
          added++;
        }
        if (added === 0) break;
      }
      return out;
    },
    getRound: () => rounds,
    isDone: () => done,
  };
}

/** 一次性模拟到结束（全自动）；「跳过回放」与单测复用 */
export function runBattle(
  initialUnits: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  aiDifficulty: AiDifficulty = 'normal',
): BattleReport {
  const sim = createBattleSim(initialUnits, terrain, defs, { aiDifficulty, mode: 'auto' });
  return sim.runToEnd();
}
