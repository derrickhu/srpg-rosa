import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '@/data/unitDefs';
import { allSkillSpecs, getSkillSpec, skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { BattleEvent, UnitState } from '../types';
import { castSkillManual, skillAiming } from '../skills';

function unit(
  uid: string,
  defId: keyof typeof UNIT_DEFS,
  faction: 'player' | 'enemy',
  pos: { x: number; y: number },
  skillId?: string,
): UnitState {
  const d = UNIT_DEFS[defId];
  return {
    uid,
    defId,
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    tempSkillCd: 0,
    movedInTurn: false,
    battleSkill: skillId ? skillDefForId(skillId) ?? undefined : undefined,
    tempSkill: skillId && skillId.startsWith('temp_') ? skillDefForId(skillId) ?? undefined : undefined,
  };
}

describe('技能目标类型（自/友/敌）', () => {
  it('牧野号角是 selfCast：无需敌人，点技能即放，不产生 0 伤害 hit', () => {
    const self = unit('p1', 'sword', 'player', { x: 1, y: 1 }, 'temp_gl_horn');
    // 主技能旋风会挡路；临时槽放号角
    self.battleSkill = skillDefForId('whirl') ?? undefined;
    self.tempSkill = skillDefForId('temp_gl_horn') ?? undefined;
    const units = [self];
    const terrain = emptyTerrain(3, 3);

    const aim = skillAiming(self, UNIT_DEFS, units, terrain, 'temp');
    expect(aim).not.toBeNull();
    expect(aim!.skillId).toBe('temp_gl_horn');
    expect(aim!.candidates).toEqual([]);
    expect(aim!.aimCells).toEqual([]);
    expect(aim!.autoTargets).toEqual(['p1']);

    const events = castSkillManual(self, UNIT_DEFS, units, terrain, undefined, 'temp');
    const cast = events.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.hits).toEqual([]);
    expect(self.timedBattleEffects?.some((e) => e.kind === 'taunt')).toBe(true);
    expect(self.timedBattleEffects?.some((e) => e.kind === 'atkBonus')).toBe(true);
    const notes = events.filter((e) => e.type === 'statusNote');
    expect(notes.some((e) => e.type === 'statusNote' && e.text === '嘲讽' && e.tone === 'buff')).toBe(true);
    expect(notes.some((e) => e.type === 'statusNote' && e.text.startsWith('攻+') && e.tone === 'buff')).toBe(true);
  });

  it('草药敷治选友方，不选敌人', () => {
    const self = unit('p1', 'sword', 'player', { x: 1, y: 1 });
    self.tempSkill = skillDefForId('temp_gl_salve') ?? undefined;
    const ally = unit('p2', 'bow', 'player', { x: 1, y: 0 });
    ally.hp = 10;
    const foe = unit('e1', 'sword', 'enemy', { x: 0, y: 1 });
    const units = [self, ally, foe];
    const terrain = emptyTerrain(3, 3);

    const aim = skillAiming(self, UNIT_DEFS, units, terrain, 'temp');
    expect(aim?.candidates).toEqual(['p2']);
    expect(aim?.candidates).not.toContain('e1');
  });

  it('野草缠足选敌人，不选友方', () => {
    const self = unit('p1', 'sword', 'player', { x: 1, y: 1 });
    self.tempSkill = skillDefForId('temp_gl_snare') ?? undefined;
    const ally = unit('p2', 'bow', 'player', { x: 1, y: 0 });
    const foe = unit('e1', 'sword', 'enemy', { x: 0, y: 1 });
    const units = [self, ally, foe];
    const terrain = emptyTerrain(3, 3);

    const aim = skillAiming(self, UNIT_DEFS, units, terrain, 'temp');
    expect(aim?.candidates).toEqual(['e1']);
    expect(aim?.candidates).not.toContain('p2');
    const events = castSkillManual(self, UNIT_DEFS, units, terrain, 'e1', 'temp');
    expect(events.some((e) => e.type === 'statusNote' && e.text.startsWith('速-') && e.tone === 'debuff')).toBe(true);
  });

  it('树皮庇护挂减伤时要飘字，不能只剩技能名', () => {
    const self = unit('p1', 'sword', 'player', { x: 1, y: 1 });
    self.tempSkill = skillDefForId('temp_fo_bark') ?? undefined;
    const ally = unit('p2', 'bow', 'player', { x: 1, y: 0 });
    const events = castSkillManual(self, UNIT_DEFS, [self, ally], emptyTerrain(3, 3), 'p2', 'temp');
    expect(events).toContainEqual({
      type: 'statusNote',
      target: 'p2',
      text: '减伤 -35%',
      tone: 'buff',
    });
  });

  it('守林人之姿除了嘲讽，减伤也要飘', () => {
    const self = unit('p1', 'sword', 'player', { x: 1, y: 1 });
    self.tempSkill = skillDefForId('temp_fo_warden') ?? undefined;
    const events = castSkillManual(self, UNIT_DEFS, [self], emptyTerrain(3, 3), undefined, 'temp');
    expect(events).toContainEqual({
      type: 'statusNote',
      target: 'p1',
      text: '减伤 -25%',
      tone: 'buff',
    });
    expect(events.some((e) => e.type === 'statusNote' && e.text === '嘲讽')).toBe(true);
  });

  it('祭鼓只选残血友军，满血不放', () => {
    const self = unit('e1', 'shield', 'enemy', { x: 1, y: 1 }, 'rite_chant');
    const full = unit('e2', 'sword', 'enemy', { x: 1, y: 0 });
    const hurt = unit('e3', 'bow', 'enemy', { x: 0, y: 1 });
    hurt.hp = 10;
    const terrain = emptyTerrain(3, 3);

    const fullOnly = skillAiming(self, UNIT_DEFS, [self, full], terrain);
    expect(fullOnly?.candidates ?? []).toEqual([]);

    const mixed = skillAiming(self, UNIT_DEFS, [self, full, hurt], terrain);
    expect(mixed?.candidates).toEqual(['e3']);

    const events = castSkillManual(self, UNIT_DEFS, [self, full, hurt], terrain, 'e3');
    expect(events.some((e) => e.type === 'heal' && e.target === 'e3')).toBe(true);
  });
});

describe('技能表形状与效果口径一致', () => {
  it('纯自 buff / 纯友方 / 纯敌方 debuff 形状要对得上', () => {
    const specs = allAuditSpecs();
    for (const spec of specs) {
      if (spec.timing === 'passive') continue;

      const hasSelf = (spec.onCastSelfEffects?.length ?? 0) > 0;
      const hasFoe = (spec.onCastFoeEffects?.length ?? 0) > 0;
      const hasAlly = (spec.onCastAllyEffects?.length ?? 0) > 0;
      const noDmg = spec.damage.kind === 'none';

      // 纯自 buff、无伤、无友无敌效果 → 必须 selfCast（号角一类）
      if (hasSelf && !hasFoe && !hasAlly && noDmg) {
        expect(spec.shape.type, `${spec.id} 应是 selfCast`).toBe('selfCast');
      }
      // 有友方效果 → 必须选友
      if (hasAlly) {
        expect(spec.shape.type, `${spec.id} 应选友方`).toBe('neighborPickAlly');
      }
      // 纯敌方 debuff（无伤）→ 必须点敌，不能挂 AoE 假装
      if (hasFoe && !hasAlly && noDmg && !hasSelf) {
        expect(
          spec.shape.type === 'neighborPickFoe',
          `${spec.id} 纯敌方无伤应点敌`,
        ).toBe(true);
      }
    }
  });
});

/** 形状/效果的自审规则对敌方专属技能同样成立，所以审计范围是技能表全体 */
const allAuditSpecs = allSkillSpecs;

/**
 * 回放层只认这些通道当「出手后的飘字」。技能名单独播，不算——
 * 它在特效前就淡掉了，玩家说的「攻击后没有飘字」指的是下面这些。
 */
function castFeedback(events: BattleEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type === 'skillCast') {
      for (const h of e.hits) {
        if (h.damage > 0) out.push(`-${h.damage}`);
      }
    } else if (e.type === 'heal') {
      out.push(`+${e.amount}`);
    } else if (e.type === 'statusNote') {
      out.push(e.text);
    } else if (e.type === 'terrain') {
      out.push(e.reason);
    }
  }
  return out;
}

/**
 * 局内商店会卖的第二技能。新加一招如果又漏了飘字通道，
 * 这里会红——那正是树皮庇护那种「放了像没放」的来源。
 */
const SHOP_SECOND_SKILLS = [
  'temp_gl_snare',
  'temp_gl_salve',
  'temp_gl_swarm',
  'temp_gl_horn',
  'temp_fo_torch',
  'temp_fo_thorn',
  'temp_fo_bark',
  'temp_fo_warden',
  'temp_ft_ram',
  'temp_ft_suppress',
  'temp_ft_banner',
  'temp_ft_grapple',
  'war_shout',
  'field_bless',
] as const;

describe('第二技能出手后必须有飘字', () => {
  it.each(SHOP_SECOND_SKILLS)('%s 成功施放后要有伤害/治疗/状态/地形其中一种反馈', (skillId) => {
    const self = unit('p1', 'sword', 'player', { x: 2, y: 2 });
    self.battleSkill = skillDefForId('whirl') ?? undefined;
    self.tempSkill = skillDefForId(skillId) ?? undefined;
    const ally = unit('p2', 'bow', 'player', { x: 2, y: 1 });
    ally.hp = 10;
    const foeAdj = unit('e1', 'sword', 'enemy', { x: 3, y: 2 });
    const foeRing2 = unit('e2', 'shield', 'enemy', { x: 4, y: 2 });
    const units = [self, ally, foeAdj, foeRing2];
    const terrain = emptyTerrain(7, 7);

    const spec = getSkillSpec(skillId);
    const shape = spec?.shape.type;
    const target =
      shape === 'neighborPickAlly' ? 'p2'
        : shape === 'neighborPickFoe' ? (skillId === 'temp_gl_snare' ? 'e1' : 'e2')
          : undefined;

    const events = castSkillManual(self, UNIT_DEFS, units, terrain, target, 'temp');
    expect(events.some((e) => e.type === 'skillCast'), `${skillId} 应该放出去`).toBe(true);
    expect(
      castFeedback(events),
      `${skillId} 出手后没有伤害/治疗/状态/地形飘字`,
    ).not.toEqual([]);
  });
});
