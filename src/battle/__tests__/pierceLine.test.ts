import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';
import { castSkillManual } from '../skills';

function bow(
  uid: string,
  pos: { x: number; y: number },
  faction: 'player' | 'enemy' = 'player',
): UnitState {
  const d = UNIT_DEFS.bow;
  return {
    uid,
    defId: 'bow',
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: skillDefForId('pierce') ?? undefined,
  };
}

function slime(uid: string, pos: { x: number; y: number }): UnitState {
  const d = UNIT_DEFS.sword;
  return {
    uid,
    defId: 'sword',
    faction: 'enemy',
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
  };
}

describe('穿透箭 lineBestRayAllFoes', () => {
  it('瞄准给的是范围格而不是点名敌人', () => {
    const self = bow('p1', { x: 0, y: 2 });
    const e1 = slime('e1', { x: 2, y: 2 });
    const e2 = slime('e2', { x: 4, y: 2 });
    const sim = createBattleSim(
      [self, e1, e2],
      emptyTerrain(5, 5),
      UNIT_DEFS,
      { mode: 'manual' },
    );
    for (let i = 0; i < 8 && !sim.pending(); i++) sim.stepTurn();
    const aim = sim.skillAiming('p1');
    expect(aim).not.toBeNull();
    expect(aim!.candidates).toEqual([]);
    expect(aim!.aimCells.length).toBeGreaterThan(0);
    expect(aim!.aimCells.some((c) => c.x === 2 && c.y === 2)).toBe(true);
  });

  it('点射线上的格贯穿该方向全部敌人', () => {
    const self = bow('p1', { x: 0, y: 2 });
    const e1 = slime('e1', { x: 2, y: 2 });
    const e2 = slime('e2', { x: 4, y: 2 });
    const units = [self, e1, e2];
    const terrain = emptyTerrain(5, 5);
    const events = castSkillManual(
      self,
      UNIT_DEFS,
      units,
      terrain,
      undefined,
      'main',
      { x: 3, y: 2 },
    );
    const cast = events.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.hits.map((h) => h.target).sort()).toEqual(['e1', 'e2']);
    expect(e1.hp).toBeLessThan(UNIT_DEFS.sword.base.maxHp);
    expect(e2.hp).toBeLessThan(UNIT_DEFS.sword.base.maxHp);
  });
});
