import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '@/data/unitDefs';
import { allPlayerSkillSpecs, getSkillSpec, skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';
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
          ['neighborPickFoe', 'neighborPickLowest'].includes(spec.shape.type),
          `${spec.id} 纯敌方无伤应点敌`,
        ).toBe(true);
      }
    }
  });
});

function allAuditSpecs() {
  const list = [...allPlayerSkillSpecs()];
  const roar = getSkillSpec('savage_roar');
  if (roar) list.push(roar);
  return list;
}
