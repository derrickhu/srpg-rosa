import type { TimedBattleEffect, UnitState } from './types';
import type {
  SkillCastAllyEffect,
  SkillCastFoeEffect,
  SkillCastSelfEffect,
  SkillSpec,
} from '@/data/skillCatalog';

/**
 * 战局新回合开始时调用：所有单位限时效果 `roundsLeft` -1，并结算中毒 / 流血伤害。
 *
 * 冰冻不在这里递减——它是「下一次行动跳过」的代币，轮到那个人出手时才消耗。
 *
 * 返回持续伤害造成的扣血，交给引擎转成飘字——不返回的话就是「血条自己少了一截」，
 * 玩家根本对不上是哪个词条在起作用，那这个词条选了等于没选。
 */
export function tickTimedBattleEffects(units: UnitState[]): PoisonTick[] {
  const ticks: PoisonTick[] = [];
  for (const u of units) {
    if (u.hp <= 0) {
      delete u.timedBattleEffects;
      continue;
    }
    if (!u.timedBattleEffects?.length) continue;

    // 先扣持续伤害再递减层数：这样「持续 2 回合」真的跳 2 次伤害。
    let poison = 0;
    let bleed = 0;
    for (const e of u.timedBattleEffects) {
      if (e.kind === 'poison' && e.roundsLeft > 0) poison += e.dmgPerRound;
      if (e.kind === 'bleed' && e.roundsLeft > 0) bleed += e.dmgPerRound;
    }
    if (poison > 0) {
      u.hp -= poison;
      ticks.push({
        uid: u.uid,
        damage: poison,
        hpLeft: Math.max(0, u.hp),
        died: u.hp <= 0,
        source: 'poison',
      });
    }
    if (bleed > 0 && u.hp > 0) {
      u.hp -= bleed;
      ticks.push({
        uid: u.uid,
        damage: bleed,
        hpLeft: Math.max(0, u.hp),
        died: u.hp <= 0,
        source: 'bleed',
      });
    }

    const next: TimedBattleEffect[] = [];
    for (const e of u.timedBattleEffects) {
      if (e.kind === 'freeze') {
        // 冰冻等出手时消耗，轮首原样留下
        if (e.roundsLeft > 0) next.push({ kind: 'freeze', roundsLeft: e.roundsLeft });
        continue;
      }
      const left = e.roundsLeft - 1;
      if (left <= 0) continue;
      switch (e.kind) {
        case 'taunt':
          next.push({ kind: 'taunt', roundsLeft: left });
          break;
        case 'atkBonus':
          next.push({ kind: 'atkBonus', addAtk: e.addAtk, roundsLeft: left });
          break;
        case 'atkDown':
          next.push({ kind: 'atkDown', subAtk: e.subAtk, roundsLeft: left });
          break;
        case 'spdDown':
          next.push({ kind: 'spdDown', subSpd: e.subSpd, roundsLeft: left });
          break;
        case 'spdBonus':
          next.push({ kind: 'spdBonus', addSpd: e.addSpd, roundsLeft: left });
          break;
        case 'poison':
          next.push({
            kind: 'poison',
            dmgPerRound: e.dmgPerRound,
            roundsLeft: left,
            ...(e.theme === 'frost' ? { theme: 'frost' as const } : {}),
          });
          break;
        case 'bleed':
          next.push({ kind: 'bleed', dmgPerRound: e.dmgPerRound, roundsLeft: left });
          break;
        case 'guard':
          next.push({ kind: 'guard', reduceRatio: e.reduceRatio, roundsLeft: left });
          break;
      }
    }
    if (next.length === 0) delete u.timedBattleEffects;
    else u.timedBattleEffects = next;
  }
  return ticks;
}

/** 一次轮首持续伤害结算 */
export interface PoisonTick {
  uid: string;
  damage: number;
  hpLeft: number;
  died: boolean;
  source: 'poison' | 'bleed';
}

/** 命中后实际挂上的敌方状态，给 hit 打标 / 回放用 */
export interface AppliedFoeFlags {
  poisoned?: true;
  frostbitten?: true;
  bleeding?: true;
  frozen?: true;
}

/** 成功施放技能后：施加 `onCastSelfEffects`（嘲讽同类新盖旧；攻击加成可多条并存） */
export function applySkillCastSelfEffects(self: UnitState, spec: SkillSpec): void {
  const raw = spec.onCastSelfEffects;
  if (!raw?.length) return;
  let list = [...(self.timedBattleEffects ?? [])];
  for (const e of raw) list = mergeCastSelfEffect(list, e);
  self.timedBattleEffects = list.length ? list : undefined;
}

function foeEffectHits(e: SkillCastFoeEffect, rng: () => number): boolean {
  return e.chance == null || rng() < e.chance;
}

/** 对技能选中的敌方施加 `onCastFoeEffects`（同类 atkDown / spdDown / 流血 / 冰冻 新盖旧） */
export function applySkillCastFoeEffects(
  target: UnitState,
  spec: SkillSpec,
  rng: () => number = Math.random,
  poisonTickAdd = 0,
): AppliedFoeFlags {
  const flags: AppliedFoeFlags = {};
  const raw = spec.onCastFoeEffects;
  if (!raw?.length) return flags;
  let list = [...(target.timedBattleEffects ?? [])];
  for (const e of raw) {
    if (!foeEffectHits(e, rng)) continue;
    // 冻伤是另一套表现，咒毒只加在中毒上
    const effect = e.kind === 'poison' && e.theme !== 'frost' && poisonTickAdd > 0
      ? { ...e, dmgPerRound: e.dmgPerRound + poisonTickAdd }
      : e;
    list = mergeFoeCastEffect(list, effect);
    if (e.kind === 'poison') {
      if (e.theme === 'frost') flags.frostbitten = true;
      else flags.poisoned = true;
    } else if (e.kind === 'bleed') {
      flags.bleeding = true;
    } else if (e.kind === 'freeze') {
      flags.frozen = true;
    }
  }
  target.timedBattleEffects = list.length ? list : undefined;
  return flags;
}

/** 对技能选中的友方施加 `onCastAllyEffects`（与自身 buff 共用 `TimedBattleEffect`，可多条并存） */
export function applySkillCastAllyEffects(target: UnitState, spec: SkillSpec): void {
  const raw = spec.onCastAllyEffects;
  if (!raw?.length) return;
  let list = [...(target.timedBattleEffects ?? [])];
  for (const e of raw) list = mergeAllyCastEffect(list, e);
  target.timedBattleEffects = list.length ? list : undefined;
}

function mergeCastSelfEffect(list: TimedBattleEffect[], e: SkillCastSelfEffect): TimedBattleEffect[] {
  if (e.kind === 'taunt') {
    const rest = list.filter((x) => x.kind !== 'taunt');
    return [...rest, { kind: 'taunt', roundsLeft: e.rounds }];
  }
  if (e.kind === 'guard') return mergeGuard(list, e.reduceRatio, e.rounds);
  if (e.kind === 'spdBonus') {
    return [...list, { kind: 'spdBonus', addSpd: e.addSpd, roundsLeft: e.rounds }];
  }
  return [...list, { kind: 'atkBonus', addAtk: e.addAtk, roundsLeft: e.rounds }];
}

/**
 * 减伤取**新盖旧**，而不是像增攻那样多条并存。
 *
 * 并存的话两条 25% 会乘成 44%、三条 58%，一路叠下去无限逼近免伤，而「刷盾刷到无敌」
 * 是这类游戏最经典的崩坏方式，且它出现得很隐蔽：单看一条减伤的数值永远是合理的。
 * 增攻可以并存是因为它线性叠加、不存在渐近上限。
 *
 * 同类相遇时保留**更强的那条**（比例更高，或比例相同但回合更长），不是无脑覆盖：
 * 玩家刚放完大减伤，又被小减伤盖掉会读成 bug。
 */
function mergeGuard(
  list: TimedBattleEffect[],
  reduceRatio: number,
  rounds: number,
): TimedBattleEffect[] {
  const cur = list.find((x) => x.kind === 'guard');
  if (
    cur?.kind === 'guard'
    && (cur.reduceRatio > reduceRatio
      || (cur.reduceRatio === reduceRatio && cur.roundsLeft >= rounds))
  ) {
    return list;
  }
  const rest = list.filter((x) => x.kind !== 'guard');
  return [...rest, { kind: 'guard', reduceRatio, roundsLeft: rounds }];
}

function mergeFoeCastEffect(list: TimedBattleEffect[], e: SkillCastFoeEffect): TimedBattleEffect[] {
  switch (e.kind) {
    case 'atkDown': {
      const rest = list.filter((x) => x.kind !== 'atkDown');
      return [...rest, { kind: 'atkDown', subAtk: e.subAtk, roundsLeft: e.rounds }];
    }
    case 'spdDown': {
      const rest = list.filter((x) => x.kind !== 'spdDown');
      return [...rest, { kind: 'spdDown', subSpd: e.subSpd, roundsLeft: e.rounds }];
    }
    case 'poison': {
      // 毒也是新盖旧：多层「淬毒」在词条侧已经合成一条更高的 dmgPerRound，
      // 这里再叠加就成了同一个词条按施放次数无限翻倍。
      const rest = list.filter((x) => x.kind !== 'poison');
      return [
        ...rest,
        {
          kind: 'poison',
          dmgPerRound: e.dmgPerRound,
          roundsLeft: e.rounds,
          ...(e.theme === 'frost' ? { theme: 'frost' as const } : {}),
        },
      ];
    }
    case 'bleed': {
      const rest = list.filter((x) => x.kind !== 'bleed');
      return [...rest, { kind: 'bleed', dmgPerRound: e.dmgPerRound, roundsLeft: e.rounds }];
    }
    case 'freeze': {
      const rest = list.filter((x) => x.kind !== 'freeze');
      return [...rest, { kind: 'freeze', roundsLeft: e.rounds }];
    }
  }
}

export function unitHasFreeze(u: UnitState): boolean {
  return (u.timedBattleEffects ?? []).some((x) => x.kind === 'freeze' && x.roundsLeft > 0);
}

export function unitHasBleed(u: UnitState): boolean {
  return (u.timedBattleEffects ?? []).some((x) => x.kind === 'bleed' && x.roundsLeft > 0);
}

/** 轮到该单位出手时调用：有冰冻就消耗一层并返回 true（调用方跳过整回合） */
export function consumeFreeze(u: UnitState): boolean {
  const list = u.timedBattleEffects ?? [];
  const idx = list.findIndex((x) => x.kind === 'freeze' && x.roundsLeft > 0);
  if (idx < 0) return false;
  const next: TimedBattleEffect[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i]!;
    if (i === idx && e.kind === 'freeze') {
      if (e.roundsLeft > 1) next.push({ kind: 'freeze', roundsLeft: e.roundsLeft - 1 });
      continue;
    }
    next.push(e);
  }
  if (next.length === 0) delete u.timedBattleEffects;
  else u.timedBattleEffects = next;
  return true;
}

function mergeAllyCastEffect(list: TimedBattleEffect[], e: SkillCastAllyEffect): TimedBattleEffect[] {
  // heal 不是限时效果，在 `pushAllyHeal` 里当场结算，不进这张表
  if (e.kind === 'heal') return list;
  if (e.kind === 'guard') return mergeGuard(list, e.reduceRatio, e.rounds);
  if (e.kind === 'atkBonus') return [...list, { kind: 'atkBonus', addAtk: e.addAtk, roundsLeft: e.rounds }];
  return [...list, { kind: 'spdBonus', addSpd: e.addSpd, roundsLeft: e.rounds }];
}

export function timedTauntActive(u: UnitState): boolean {
  return (u.timedBattleEffects ?? []).some((x) => x.kind === 'taunt' && x.roundsLeft > 0);
}

export function sumTimedAtkBonus(u: UnitState): number {
  let s = 0;
  for (const e of u.timedBattleEffects ?? []) {
    if (e.kind === 'atkBonus' && e.roundsLeft > 0) s += e.addAtk;
  }
  return s;
}

export function sumTimedAtkDown(u: UnitState): number {
  let s = 0;
  for (const e of u.timedBattleEffects ?? []) {
    if (e.kind === 'atkDown' && e.roundsLeft > 0) s += e.subAtk;
  }
  return s;
}

export function sumTimedSpdDown(u: UnitState): number {
  let s = 0;
  for (const e of u.timedBattleEffects ?? []) {
    if (e.kind === 'spdDown' && e.roundsLeft > 0) s += e.subSpd;
  }
  return s;
}

export function sumTimedSpdBonus(u: UnitState): number {
  let s = 0;
  for (const e of u.timedBattleEffects ?? []) {
    if (e.kind === 'spdBonus' && e.roundsLeft > 0) s += e.addSpd;
  }
  return s;
}

/**
 * 受到伤害的倍率（1 = 无减伤）。因为 `guard` 是新盖旧的单条，这里取最强的一条即可，
 * 不做连乘——理由见 `mergeGuard`。
 */
export function timedGuardMul(u: UnitState): number {
  let best = 0;
  for (const e of u.timedBattleEffects ?? []) {
    if (e.kind === 'guard' && e.roundsLeft > 0 && e.reduceRatio > best) best = e.reduceRatio;
  }
  // 夹在 [0, 0.9]：留 10% 是硬地板，免得将来某条词条把减伤推到 100% 变成无敌
  return 1 - Math.min(0.9, Math.max(0, best));
}
