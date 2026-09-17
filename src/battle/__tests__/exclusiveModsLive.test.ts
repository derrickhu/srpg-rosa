import { beforeEach, describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import { castSkillManual, setHitRng, skillAiming, trySkillBeforeMove } from '../skills';
import { tickTimedBattleEffects, timedGuardMul } from '../timedBattleEffects';
import type { BattleEvent, UnitState, Vec2 } from '../types';

/**
 * 新补的专属不能只停在「规格折进去了」。
 * 这里走施放入口和 `createBattleSim`，验玩家能看见的结果。
 */

const FLAT = emptyTerrain(7, 7);

function dummy(uid: string, pos: Vec2, hp = 100): UnitState {
  return { uid, defId: 'shield', faction: 'enemy', hp, pos, skillCd: 0, movedInTurn: false };
}

function hero(pos: Vec2, mods?: string[]): UnitState {
  return {
    uid: 'hero',
    defId: 'sword',
    faction: 'player',
    hp: 100,
    pos,
    skillCd: 0,
    movedInTurn: false,
    battleSkill: skillDefForId('whirl') ?? undefined,
    skillMods: mods,
  };
}

function floe(mods?: string[]): UnitState {
  return {
    uid: 'floe',
    defId: 'mage',
    faction: 'player',
    hp: 50,
    pos: { x: 3, y: 3 },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: skillDefForId('frost_ring') ?? undefined,
    skillMods: mods,
  };
}

function priest(hp: number, mods?: string[]): UnitState {
  return {
    uid: 'priest',
    defId: 'healer',
    faction: 'player',
    hp,
    pos: { x: 3, y: 3 },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: skillDefForId('heal_touch') ?? undefined,
    skillMods: mods,
  };
}

function stepUntilPending(
  sim: ReturnType<typeof createBattleSim>,
  max = 20,
): BattleEvent[] {
  const out: BattleEvent[] = [];
  for (let i = 0; i < max && !sim.isDone() && !sim.pending(); i += 1) {
    out.push(...sim.stepTurn().events);
  }
  return out;
}

describe('专属词条实战生效', () => {
  beforeEach(() => {
    setHitRng(() => 0.2);
  });

  it('旋势施放后加攻并按伤害吸血', () => {
    const self = hero({ x: 3, y: 3 }, ['ex_whirl_momentum']);
    self.hp = 40;
    const foe = dummy('e1', { x: 3, y: 2 });
    const evs = castSkillManual(self, UNIT_DEFS, [self, foe], FLAT);
    const cast = evs.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    const dealt = cast.hits.reduce((s, h) => s + h.damage, 0);
    expect(self.timedBattleEffects).toContainEqual({ kind: 'atkBonus', addAtk: 6, roundsLeft: 2 });
    expect(evs.find((e) => e.type === 'heal')).toMatchObject({
      type: 'heal',
      target: 'hero',
      amount: Math.floor(dealt * 0.25),
    });
  });

  it('斩残只抬残血目标的伤害', () => {
    const hurt = dummy('low', { x: 3, y: 2 }, 30);
    const full = dummy('full', { x: 4, y: 3 }, 140);
    const a = hero({ x: 3, y: 3 });
    const b = hero({ x: 3, y: 3 }, ['ex_cleave_reap']);
    const plainLow = (castSkillManual(a, UNIT_DEFS, [a, { ...hurt }], FLAT).find((e) => e.type === 'skillCast') as Extract<BattleEvent, { type: 'skillCast' }>).hits[0]!.damage;
    const reapLow = (castSkillManual(b, UNIT_DEFS, [b, { ...hurt }], FLAT).find((e) => e.type === 'skillCast') as Extract<BattleEvent, { type: 'skillCast' }>).hits[0]!.damage;
    const a2 = hero({ x: 3, y: 3 });
    const b2 = hero({ x: 3, y: 3 }, ['ex_cleave_reap']);
    const plainFull = (castSkillManual(a2, UNIT_DEFS, [a2, { ...full }], FLAT).find((e) => e.type === 'skillCast') as Extract<BattleEvent, { type: 'skillCast' }>).hits[0]!.damage;
    const reapFull = (castSkillManual(b2, UNIT_DEFS, [b2, { ...full }], FLAT).find((e) => e.type === 'skillCast') as Extract<BattleEvent, { type: 'skillCast' }>).hits[0]!.damage;
    expect(reapLow).toBeGreaterThan(plainLow);
    expect(reapFull).toBe(plainFull);
  });

  it('裂伤和淬毒可以并存，轮首各跳各的伤', () => {
    const self = hero({ x: 3, y: 3 }, ['ex_whirl_bleed', 'venom']);
    const foe = dummy('e1', { x: 3, y: 2 });
    setHitRng(() => 0.2);
    castSkillManual(self, UNIT_DEFS, [self, foe], FLAT);
    expect(foe.timedBattleEffects?.some((e) => e.kind === 'bleed')).toBe(true);
    expect(foe.timedBattleEffects?.some((e) => e.kind === 'poison')).toBe(true);
    const ticks = tickTimedBattleEffects([foe]);
    expect(ticks.map((t) => t.source).sort()).toEqual(['bleed', 'poison']);
    expect(ticks.reduce((s, t) => s + t.damage, 0)).toBe(9);
  });

  it('引擎轮首把流血飘成血而不是毒', () => {
    const p = hero({ x: 0, y: 2 }, ['ex_whirl_bleed']);
    p.mercSpd = 20;
    const foe = dummy('e1', { x: 1, y: 2 });
    foe.timedBattleEffects = [{ kind: 'bleed', dmgPerRound: 6, roundsLeft: 2 }];
    const sim = createBattleSim([p, foe], emptyTerrain(4, 4), UNIT_DEFS, {
      mode: 'manual',
      battleRng: () => 1,
    });
    const evs = sim.stepTurn().events;
    expect(evs).toContainEqual({
      type: 'dot',
      uid: 'e1',
      damage: 6,
      hpLeft: 94,
      source: 'bleed',
    });
  });

  it('没有霜域时霜环炸不到 2 格外，有霜域才能炸到', () => {
    const near = dummy('near', { x: 3, y: 2 });
    const far = dummy('far', { x: 3, y: 1 });
    const bare = floe();
    const wide = floe(['ex_frost_spread']);
    const bareHits = (castSkillManual(bare, UNIT_DEFS, [bare, { ...near }, { ...far }], FLAT, undefined, 'main', { x: 3, y: 3 })
      .find((e) => e.type === 'skillCast') as Extract<BattleEvent, { type: 'skillCast' }>).hits.map((h) => h.target);
    const wideHits = (castSkillManual(wide, UNIT_DEFS, [wide, { ...near }, { ...far }], FLAT, undefined, 'main', { x: 3, y: 3 })
      .find((e) => e.type === 'skillCast') as Extract<BattleEvent, { type: 'skillCast' }>).hits.map((h) => h.target);
    expect(bareHits).toEqual(['near']);
    expect(wideHits.sort()).toEqual(['far', 'near']);
  });

  it('霜噬和凝霜可以同时挂上', () => {
    const self = floe(['ex_flame_ignite', 'ex_frost_freeze']);
    const foe = dummy('e1', { x: 3, y: 2 });
    setHitRng(() => 0.2);
    const evs = castSkillManual(self, UNIT_DEFS, [self, foe], FLAT, undefined, 'main', { x: 3, y: 2 });
    const hit = (evs.find((e) => e.type === 'skillCast') as Extract<BattleEvent, { type: 'skillCast' }>).hits[0];
    expect(hit?.frostbitten).toBe(true);
    expect(hit?.frozen).toBe(true);
    expect(foe.timedBattleEffects?.some((e) => e.kind === 'poison' && e.theme === 'frost')).toBe(true);
    expect(foe.timedBattleEffects?.some((e) => e.kind === 'freeze')).toBe(true);
  });

  it('涌泉加治疗和加速，庇佑给减伤，回春能打到自己', () => {
    const self = priest(20, ['ex_heal_spring', 'ex_heal_aegis', 'ex_heal_self']);
    const evs = castSkillManual(self, UNIT_DEFS, [self], FLAT, 'priest');
    const heal = evs.find((e) => e.type === 'heal');
    expect(heal).toMatchObject({ type: 'heal', target: 'priest' });
    if (heal?.type !== 'heal') return;
    expect(heal.amount).toBe(44);
    expect(self.timedBattleEffects?.some((e) => e.kind === 'spdBonus' && e.addSpd === 2)).toBe(true);
    expect(self.timedBattleEffects?.some((e) => e.kind === 'guard' && e.reduceRatio === 0.4)).toBe(true);
    expect(timedGuardMul(self)).toBeCloseTo(0.6);
  });

  it('回春走人工指令点自己也能奶到', () => {
    const p = priest(20, ['ex_heal_self']);
    p.mercSpd = 20;
    const foe = dummy('e1', { x: 6, y: 6 });
    const sim = createBattleSim([p, foe], FLAT, UNIT_DEFS, { mode: 'manual', battleRng: () => 1 });
    stepUntilPending(sim);
    expect(sim.pending()?.uid).toBe('priest');
    expect(sim.skillAiming('priest')?.candidates).toEqual(['priest']);
    const evs = sim.commandSkill('priest', 'priest').events;
    expect(evs.some((e) => e.type === 'heal' && e.target === 'priest')).toBe(true);
    expect(sim.getUnit('priest')!.hp).toBeGreaterThan(20);
  });

  it('AI 在只有自己残血时会把圣疗打给自己', () => {
    const self = priest(20, ['ex_heal_self']);
    const foe = dummy('e1', { x: 6, y: 6 });
    const evs = trySkillBeforeMove(self, UNIT_DEFS, [self, foe], FLAT);
    expect(evs.some((e) => e.type === 'heal' && e.target === 'priest')).toBe(true);
  });

  it('没回春时残血自己不能当圣疗目标', () => {
    const self = priest(20);
    expect(skillAiming(self, UNIT_DEFS, [self], FLAT)).toBeNull();
    expect(trySkillBeforeMove(self, UNIT_DEFS, [self], FLAT)).toEqual([]);
  });
});
