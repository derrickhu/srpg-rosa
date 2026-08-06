import { describe, expect, it } from 'vitest';
import { castSkillManual } from '../skills';
import { tickTimedBattleEffects } from '../timedBattleEffects';
import type { TerrainGrid } from '../grid';
import type { BattleEvent, UnitArchetypeDef, UnitKind, UnitState, Vec2 } from '../types';

/**
 * 词条只在目录层「折进规格」是不够的——真正会出事的是它有没有走到结算里。
 * 这里从施放入口打进去，验的是玩家能看见的结果：伤害数字、飘的治疗、打到几个人。
 */

function archetype(
  id: UnitKind,
  name: string,
  base: { maxHp: number; atk: number; spd: number; move: number },
  strike: { range: number; isRanged: boolean; taunt: boolean },
): UnitArchetypeDef {
  return { id, name, base, strike };
}

const DEFS: Record<UnitKind, UnitArchetypeDef> = {
  sword: archetype('sword', '剑士', { maxHp: 100, atk: 40, spd: 5, move: 3 }, { range: 1, isRanged: false, taunt: false }),
  bow: archetype('bow', '弓手', { maxHp: 80, atk: 36, spd: 6, move: 3 }, { range: 3, isRanged: true, taunt: false }),
  cavalry: archetype('cavalry', '骑兵', { maxHp: 110, atk: 42, spd: 7, move: 4 }, { range: 1, isRanged: false, taunt: false }),
  shield: archetype('shield', '盾卫', { maxHp: 140, atk: 26, spd: 3, move: 2 }, { range: 1, isRanged: false, taunt: true }),
};

/** 全平原，避免地形倍率混进断言 */
const FLAT: TerrainGrid = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => 'plain' as const));

function hero(pos: Vec2, mods?: string[]): UnitState {
  return {
    uid: 'hero',
    defId: 'sword',
    faction: 'player',
    hp: 100,
    pos,
    skillCd: 0,
    movedInTurn: false,
    battleSkill: { id: 'whirl', name: '旋风斩', cooldown: 3, kind: 'whirlwind' },
    skillMods: mods,
  };
}

/** 用盾卫当靶子：盾卫不参与三角克制，倍率恒为 1 */
function dummy(uid: string, pos: Vec2, hp = 100): UnitState {
  return { uid, defId: 'shield', faction: 'enemy', hp, pos, skillCd: 0, movedInTurn: false };
}

function skillHits(events: BattleEvent[]): { target: string; damage: number }[] {
  const cast = events.find((e) => e.type === 'skillCast');
  return cast?.type === 'skillCast' ? cast.hits.map((h) => ({ target: h.target, damage: h.damage })) : [];
}

describe('词条在实际战斗中生效', () => {
  it('锋锐真的提高打出的伤害', () => {
    const a = hero({ x: 3, y: 3 });
    const b = hero({ x: 3, y: 3 }, ['sharpen']);
    const plain = castSkillManual(a, DEFS, [a, dummy('e1', { x: 3, y: 2 })], FLAT);
    const buffed = castSkillManual(b, DEFS, [b, dummy('e1', { x: 3, y: 2 })], FLAT);
    expect(skillHits(buffed)[0]!.damage).toBeGreaterThan(skillHits(plain)[0]!.damage);
  });

  it('横扫让旋风斩打到 2 格外的敌人，且不漏掉贴脸的', () => {
    const near = { x: 3, y: 2 };
    const far = { x: 3, y: 1 };

    const plainSelf = hero({ x: 3, y: 3 });
    const plain = castSkillManual(
      plainSelf, DEFS, [plainSelf, dummy('near', near), dummy('far', far)], FLAT,
    );
    expect(skillHits(plain).map((h) => h.target)).toEqual(['near']);

    const wideSelf = hero({ x: 3, y: 3 }, ['wide_swing']);
    const wide = castSkillManual(
      wideSelf, DEFS, [wideSelf, dummy('near', near), dummy('far', far)], FLAT,
    );
    expect(skillHits(wide).map((h) => h.target).sort()).toEqual(['far', 'near']);
  });

  it('淬毒挂上的中毒会在之后的轮首持续扣血', () => {
    const self = hero({ x: 3, y: 3 }, ['venom']);
    const foe = dummy('e1', { x: 3, y: 2 });
    castSkillManual(self, DEFS, [self, foe], FLAT);

    const hpAfterCast = foe.hp;
    const t1 = tickTimedBattleEffects([foe]);
    expect(t1).toEqual([{ uid: 'e1', damage: 3, hpLeft: hpAfterCast - 3, died: false }]);

    const t2 = tickTimedBattleEffects([foe]);
    expect(t2[0]!.damage).toBe(3);

    // 持续 2 回合，第三轮就该没了
    expect(tickTimedBattleEffects([foe])).toEqual([]);
  });

  it('汲取按实际打出的伤害回血，且不超过上限', () => {
    const hurt = hero({ x: 3, y: 3 }, ['siphon']);
    hurt.hp = 40;
    const foe = dummy('e1', { x: 3, y: 2 });
    const events = castSkillManual(hurt, DEFS, [hurt, foe], FLAT);
    const dmg = skillHits(events)[0]!.damage;
    const heal = events.find((e) => e.type === 'heal');
    expect(heal).toEqual({ type: 'heal', target: 'hero', amount: Math.floor(dmg * 0.3), hpLeft: 40 + Math.floor(dmg * 0.3) });

    const full = hero({ x: 3, y: 3 }, ['siphon']);
    const foe2 = dummy('e2', { x: 3, y: 2 });
    const ev2 = castSkillManual(full, DEFS, [full, foe2], FLAT);
    expect(ev2.some((e) => e.type === 'heal')).toBe(false);
    expect(full.hp).toBe(100);
  });

  it('势不可挡同时给到范围和伤害，两个效果都能观察到', () => {
    const base = hero({ x: 3, y: 3 });
    const buffed = hero({ x: 3, y: 3 }, ['overwhelm']);
    const mk = (): UnitState[] => [dummy('near', { x: 3, y: 2 }), dummy('far', { x: 3, y: 1 })];

    const plainFoes = mk();
    const plain = castSkillManual(base, DEFS, [base, ...plainFoes], FLAT);
    const buffFoes = mk();
    const boosted = castSkillManual(buffed, DEFS, [buffed, ...buffFoes], FLAT);

    expect(skillHits(plain)).toHaveLength(1);
    expect(skillHits(boosted)).toHaveLength(2);
    const nearPlain = skillHits(plain).find((h) => h.target === 'near')!.damage;
    const nearBoost = skillHits(boosted).find((h) => h.target === 'near')!.damage;
    expect(nearBoost).toBeGreaterThan(nearPlain);
  });

  it('词条不会跟着技能表泄漏给没挂词条的单位', () => {
    const buffed = hero({ x: 3, y: 3 }, ['sharpen', 'venom']);
    castSkillManual(buffed, DEFS, [buffed, dummy('e1', { x: 3, y: 2 })], FLAT);

    const clean = hero({ x: 3, y: 3 });
    const foe = dummy('e2', { x: 3, y: 2 });
    castSkillManual(clean, DEFS, [clean, foe], FLAT);
    expect(foe.timedBattleEffects ?? []).toEqual([]);
  });
});
