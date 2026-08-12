import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';
import { effectiveUnitDef } from '../effectiveUnit';
import { castSkillManual } from '../skills';
import { tickTimedBattleEffects } from '../timedBattleEffects';

function ally(uid: string, pos: { x: number; y: number }): UnitState {
  const d = UNIT_DEFS.sword;
  return {
    uid,
    defId: 'sword',
    faction: 'player',
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
  };
}

describe('惊扰蜂群伤害', () => {
  it('邻格敌人吃到即时伤并挂毒', () => {
    const p1 = ally('p1', { x: 1, y: 1 });
    p1.battleSkill = skillDefForId('temp_gl_swarm') ?? undefined;
    const foe: UnitState = {
      uid: 'e1',
      defId: 'shield',
      faction: 'enemy',
      hp: 80,
      pos: { x: 1, y: 0 },
      skillCd: 0,
      movedInTurn: false,
    };
    const sim = createBattleSim([p1, foe], emptyTerrain(3, 3), UNIT_DEFS, { mode: 'manual' });
    const evs = castSkillManual(p1, UNIT_DEFS, [p1, foe], emptyTerrain(3, 3), undefined, 'main');
    const cast = evs.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.hits[0]?.damage).toBeGreaterThanOrEqual(8);
    expect(foe.hp).toBe(80 - cast.hits[0]!.damage);
    expect(foe.timedBattleEffects?.some((e) => e.kind === 'poison')).toBe(true);
    expect(evs.some((e) => e.type === 'statusNote' && e.text === '中毒')).toBe(false);
    const ticks = tickTimedBattleEffects([foe]);
    expect(ticks[0]?.damage).toBe(3);
    expect(foe.hp).toBe(80 - cast.hits[0]!.damage - 3);
  });
});

describe('战斗药剂', () => {
  it('蛮力药剂给全体友军加攻，并冒出 statusNote', () => {
    const p1 = ally('p1', { x: 0, y: 0 });
    const p2 = ally('p2', { x: 1, y: 0 });
    const foe: UnitState = {
      uid: 'e1',
      defId: 'shield',
      faction: 'enemy',
      hp: 50,
      pos: { x: 2, y: 0 },
      skillCd: 0,
      movedInTurn: false,
    };
    const sim = createBattleSim([p1, p2, foe], emptyTerrain(4, 3), UNIT_DEFS, { mode: 'manual' });
    const before = effectiveUnitDef(p1, UNIT_DEFS).atk;

    const evs = sim.usePotion('draught');
    expect(evs.some((e) => e.type === 'potion' && e.potionId === 'draught')).toBe(true);

    const notes = evs.filter((e) => e.type === 'statusNote');
    expect(notes).toHaveLength(2);
    expect(notes.every((e) => e.type === 'statusNote' && e.tone === 'buff')).toBe(true);

    const after = effectiveUnitDef(sim.getUnit('p1')!, UNIT_DEFS).atk;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBe(Math.max(1, Math.floor(before * 0.3)));
  });
});
