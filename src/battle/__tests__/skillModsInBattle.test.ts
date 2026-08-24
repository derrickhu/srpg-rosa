import { describe, expect, it } from 'vitest';
import { castSkillManual } from '../skills';
import { tickTimedBattleEffects } from '../timedBattleEffects';
import type { TerrainGrid } from '../grid';
import type { BattleEvent, SkillHit, UnitArchetypeDef, UnitKind, UnitState, Vec2 } from '../types';

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
  mage: archetype('mage', '法师', { maxHp: 52, atk: 40, spd: 6, move: 2 }, { range: 3, isRanged: true, taunt: false }),
  healer: archetype('healer', '祭司', { maxHp: 80, atk: 20, spd: 4, move: 2 }, { range: 2, isRanged: true, taunt: false }),
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

function rawSkillHits(events: BattleEvent[]): SkillHit[] {
  const cast = events.find((e) => e.type === 'skillCast');
  return cast?.type === 'skillCast' ? cast.hits : [];
}

function skillHits(events: BattleEvent[]): { target: string; damage: number }[] {
  return rawSkillHits(events).map((h) => ({ target: h.target, damage: h.damage }));
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

  it('霜噬是冻伤，命中不叠中毒紫雾', () => {
    const self: UnitState = {
      uid: 'floe',
      defId: 'mage',
      faction: 'player',
      hp: 50,
      pos: { x: 3, y: 3 },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: { id: 'frost_ring', name: '霜环', cooldown: 3, kind: 'whirlwind' },
      skillMods: ['ex_flame_ignite'],
    };
    const foe = dummy('e1', { x: 3, y: 2 });
    const hits = rawSkillHits(
      castSkillManual(self, DEFS, [self, foe], FLAT, undefined, 'main', { x: 3, y: 2 }),
    );
    expect(hits[0]?.poisoned).toBeUndefined();
    expect(hits[0]?.frostbitten).toBe(true);
    expect(foe.timedBattleEffects?.some((e) => e.kind === 'poison' && e.theme === 'frost')).toBe(true);
  });

  it('淬毒的命中带中毒标记，溅射不带', () => {
    const self: UnitState = {
      ...hero({ x: 3, y: 3 }, ['venom', 'splash']),
      battleSkill: { id: 'cleave', name: '重劈', cooldown: 2, kind: 'singleBash' },
    };
    const main = dummy('main', { x: 3, y: 2 });
    const side = dummy('side', { x: 2, y: 2 });
    const hits = rawSkillHits(castSkillManual(self, DEFS, [self, main, side], FLAT, 'main'));
    expect(hits.find((h) => h.target === 'main')?.poisoned).toBe(true);
    expect(hits.find((h) => h.target === 'side')?.poisoned).toBeUndefined();
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

  it('炎弹爆炎打到主目标周围八格，斜角也算，再远的不算', () => {
    const self: UnitState = {
      uid: 'mage',
      defId: 'mage',
      faction: 'player',
      hp: 50,
      pos: { x: 3, y: 3 },
      skillCd: 0,
      movedInTurn: false,
      battleSkill: { id: 'ember', name: '炎弹', cooldown: 2, kind: 'lineShot' },
      skillMods: ['ex_ember_bloom'],
    };
    const main = dummy('main', { x: 3, y: 1 });
    const diag = dummy('diag', { x: 4, y: 0 });
    const ortho = dummy('ortho', { x: 3, y: 0 });
    const far = dummy('far', { x: 5, y: 0 });
    const events = castSkillManual(self, DEFS, [self, main, diag, ortho, far], FLAT, 'main');
    const cast = events.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.vfxId).toBe('ember_bloom');
    expect(skillHits(events).map((h) => h.target).sort()).toEqual(['diag', 'main', 'ortho']);
    const mainDmg = skillHits(events).find((h) => h.target === 'main')!.damage;
    const diagDmg = skillHits(events).find((h) => h.target === 'diag')!.damage;
    expect(diagDmg).toBeLessThan(mainDmg);
    expect(far.hp).toBe(100);
  });

  it('溅射让单体技能打到目标邻格，但减益只落在主目标身上', () => {
    const self: UnitState = {
      ...hero({ x: 3, y: 3 }, ['splash', 'rout']),
      battleSkill: { id: 'cleave', name: '重劈', cooldown: 2, kind: 'singleBash' },
    };
    const main = dummy('main', { x: 3, y: 2 }, 30);
    const side = dummy('side', { x: 2, y: 2 });
    const events = castSkillManual(self, DEFS, [self, main, side], FLAT, 'main');

    const hits = skillHits(events);
    expect(hits.map((h) => h.target).sort()).toEqual(['main', 'side']);
    const mainDmg = hits.find((h) => h.target === 'main')!.damage;
    const sideDmg = hits.find((h) => h.target === 'side')!.damage;
    expect(sideDmg).toBeLessThan(mainDmg);
    const raw = rawSkillHits(events);
    expect(raw.find((h) => h.target === 'main')?.splash).toBeUndefined();
    expect(raw.find((h) => h.target === 'side')?.splash).toBe(true);

    // 溅射只溅伤害：一条词条把单体控制变群控，「点谁」这个决策就没了
    expect(main.timedBattleEffects?.some((e) => e.kind === 'atkDown')).toBe(true);
    expect(side.timedBattleEffects ?? []).toEqual([]);
  });

  it('处决只在目标残血时加伤，满血目标一点不多', () => {
    // 斩残现在是旋风斩的专属（重劈已转给敌方），所以直接用 hero 自带的招
    const dmgOn = (hp: number, mods?: string[]): number => {
      const self = hero({ x: 3, y: 3 }, mods);
      const foe = dummy('e1', { x: 3, y: 2 }, hp);
      return skillHits(castSkillManual(self, DEFS, [self, foe], FLAT, 'e1'))[0]!.damage;
    };

    // 靶子上限 140，30 血在 50% 线内，120 血不在
    expect(dmgOn(30, ['ex_cleave_reap'])).toBeGreaterThan(dmgOn(30));
    expect(dmgOn(120, ['ex_cleave_reap'])).toBe(dmgOn(120));
  });

  /**
   * 处决是**条件触发**的，不飘字玩家就只看到一个更大的数字、没有对照可比，
   * 那这条词条在战斗里等于不存在。飘字掉了不会报错也不会崩，所以钉在这里。
   */
  it('处决触发时给回放层一条注记，没触发时不给', () => {
    const noteOn = (hp: number): string | undefined => {
      const self = hero({ x: 3, y: 3 }, ['ex_cleave_reap']);
      const foe = dummy('e1', { x: 3, y: 2 }, hp);
      return rawSkillHits(castSkillManual(self, DEFS, [self, foe], FLAT, 'e1'))[0]!.modNote;
    };
    expect(noteOn(30)).toBe('处决');
    expect(noteOn(120)).toBeUndefined();
  });

  it('疾风给的是自身加速，会飘字也会进限时效果表', () => {
    const self = hero({ x: 3, y: 3 }, ['haste']);
    const events = castSkillManual(self, DEFS, [self, dummy('e1', { x: 3, y: 2 })], FLAT);
    expect(self.timedBattleEffects).toContainEqual({ kind: 'spdBonus', addSpd: 2, roundsLeft: 2 });
    expect(events).toContainEqual({ type: 'statusNote', target: 'hero', text: '速+2', tone: 'buff' });
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
