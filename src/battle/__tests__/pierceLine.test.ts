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

  it('点射线上的格贯穿该方向射程内的全部敌人', () => {
    const self = bow('p1', { x: 0, y: 2 });
    const e1 = slime('e1', { x: 2, y: 2 });
    const e2 = slime('e2', { x: 3, y: 2 });
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

  /**
   * 射程上限是穿透箭唯一的短板，也是「远眺 / 洞穿」两条纹章存在的理由。
   * 没有这条测试的话，把上限调没了（回到最初的一路射到出界）不会有任何东西报警——
   * 而那正是弓手走位决策消失的那个版本。
   */
  it('射程外的敌人打不到，瞄准格也只画到射程边界', () => {
    const self = bow('p1', { x: 0, y: 2 });
    const near = slime('e1', { x: 1, y: 2 });
    const far = slime('e2', { x: 6, y: 2 });
    const units = [self, near, far];
    const terrain = emptyTerrain(8, 5);
    const events = castSkillManual(
      self, UNIT_DEFS, units, terrain, undefined, 'main', { x: 2, y: 2 },
    );
    const cast = events.find((e) => e.type === 'skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.hits.map((h) => h.target)).toEqual(['e1']);
    expect(far.hp).toBe(UNIT_DEFS.sword.base.maxHp);
    expect(cast.rangeCells.some((c) => c.x === 5 && c.y === 2)).toBe(true);
    expect(cast.rangeCells.some((c) => c.x === 6 && c.y === 2)).toBe(false);
  });
});
