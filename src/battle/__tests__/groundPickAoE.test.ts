import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';
import { castSkillManual, skillAiming } from '../skills';

function mage(pos: { x: number; y: number }): UnitState {
  const d = UNIT_DEFS.mage;
  return {
    uid: 'p1',
    defId: 'mage',
    faction: 'player',
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: skillDefForId('frost_ring') ?? undefined,
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

describe('霜环 groundPickAoE', () => {
  it('瞄准给的是落点格而不是点名敌人', () => {
    const self = mage({ x: 1, y: 3 });
    const e1 = slime('e1', { x: 1, y: 0 });
    const terrain = emptyTerrain(7, 7);
    const aim = skillAiming(self, UNIT_DEFS, [self, e1], terrain);
    expect(aim).not.toBeNull();
    expect(aim!.candidates).toEqual([]);
    expect(aim!.aimCells.some((c) => c.x === 1 && c.y === 1)).toBe(true);
  });

  it('点空地也能打到爆炸范围内的敌人', () => {
    const self = mage({ x: 1, y: 3 });
    const e1 = slime('e1', { x: 1, y: 0 });
    const e2 = slime('e2', { x: 2, y: 1 });
    const far = slime('e3', { x: 6, y: 6 });
    const units = [self, e1, e2, far];
    const events = castSkillManual(
      self, UNIT_DEFS, units, emptyTerrain(7, 7), undefined, 'main', { x: 1, y: 1 },
    );
    const cast = events.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.aimCell).toEqual({ x: 1, y: 1 });
    expect(cast.hits.map((h) => h.target).sort()).toEqual(['e1', 'e2']);
    expect(far.hp).toBe(UNIT_DEFS.sword.base.maxHp);
  });

  it('没 aimCell 时 AI 会选命中最多的落点', () => {
    const self = mage({ x: 3, y: 3 });
    const a = slime('a', { x: 3, y: 0 });
    const b = slime('b', { x: 3, y: 1 });
    const c = slime('c', { x: 0, y: 3 });
    const units = [self, a, b, c];
    const events = castSkillManual(self, UNIT_DEFS, units, emptyTerrain(7, 7));
    const cast = events.find((e) => e.type === 'skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.hits.map((h) => h.target).sort()).toEqual(['a', 'b']);
  });
});
