import type { TimedBattleEffect, UnitState } from './types';
import type {
  SkillCastAllyEffect,
  SkillCastFoeEffect,
  SkillCastSelfEffect,
  SkillSpec,
} from '@/data/skillCatalog';

/**
 * 战局新回合开始时调用：所有单位限时效果 `roundsLeft` -1，并结算中毒伤害。
 *
 * 返回中毒造成的扣血，交给引擎转成飘字——不返回的话中毒就是「血条自己少了一截」，
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

    // 先扣毒伤再递减层数：这样「持续 2 回合」真的跳 2 次伤害。
    let poison = 0;
    for (const e of u.timedBattleEffects) {
      if (e.kind === 'poison' && e.roundsLeft > 0) poison += e.dmgPerRound;
    }
    if (poison > 0) {
      u.hp -= poison;
      ticks.push({ uid: u.uid, damage: poison, hpLeft: Math.max(0, u.hp), died: u.hp <= 0 });
    }

    const next: TimedBattleEffect[] = [];
    for (const e of u.timedBattleEffects) {
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
          next.push({ kind: 'poison', dmgPerRound: e.dmgPerRound, roundsLeft: left });
          break;
      }
    }
    if (next.length === 0) delete u.timedBattleEffects;
    else u.timedBattleEffects = next;
  }
  return ticks;
}

/** 一次轮首中毒结算 */
export interface PoisonTick {
  uid: string;
  damage: number;
  hpLeft: number;
  died: boolean;
}

/** 成功施放技能后：施加 `onCastSelfEffects`（嘲讽同类新盖旧；攻击加成可多条并存） */
export function applySkillCastSelfEffects(self: UnitState, spec: SkillSpec): void {
  const raw = spec.onCastSelfEffects;
  if (!raw?.length) return;
  let list = [...(self.timedBattleEffects ?? [])];
  for (const e of raw) list = mergeCastSelfEffect(list, e);
  self.timedBattleEffects = list.length ? list : undefined;
}

/** 对技能选中的敌方施加 `onCastFoeEffects`（同类 atkDown / spdDown 新盖旧） */
export function applySkillCastFoeEffects(target: UnitState, spec: SkillSpec): void {
  const raw = spec.onCastFoeEffects;
  if (!raw?.length) return;
  let list = [...(target.timedBattleEffects ?? [])];
  for (const e of raw) list = mergeFoeCastEffect(list, e);
  target.timedBattleEffects = list.length ? list : undefined;
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
  if (e.kind === 'spdBonus') {
    return [...list, { kind: 'spdBonus', addSpd: e.addSpd, roundsLeft: e.rounds }];
  }
  return [...list, { kind: 'atkBonus', addAtk: e.addAtk, roundsLeft: e.rounds }];
}

function mergeFoeCastEffect(list: TimedBattleEffect[], e: SkillCastFoeEffect): TimedBattleEffect[] {
  if (e.kind === 'atkDown') {
    const rest = list.filter((x) => x.kind !== 'atkDown');
    return [...rest, { kind: 'atkDown', subAtk: e.subAtk, roundsLeft: e.rounds }];
  }
  if (e.kind === 'poison') {
    // 毒也是新盖旧：多层「淬毒」在词条侧已经合成一条更高的 dmgPerRound，
    // 这里再叠加就成了同一个词条按施放次数无限翻倍。
    const rest = list.filter((x) => x.kind !== 'poison');
    return [...rest, { kind: 'poison', dmgPerRound: e.dmgPerRound, roundsLeft: e.rounds }];
  }
  const rest = list.filter((x) => x.kind !== 'spdDown');
  return [...rest, { kind: 'spdDown', subSpd: e.subSpd, roundsLeft: e.rounds }];
}

function mergeAllyCastEffect(list: TimedBattleEffect[], e: SkillCastAllyEffect): TimedBattleEffect[] {
  // heal 不是限时效果，在 `pushAllyHeal` 里当场结算，不进这张表
  if (e.kind === 'heal') return list;
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
