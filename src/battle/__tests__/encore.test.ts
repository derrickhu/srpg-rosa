import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { castSkillManual } from '../skills';
import { emptyTerrain } from '../grid';
import type { UnitState, Vec2 } from '../types';

function make(
  uid: string,
  defId: 'sword' | 'shield' | 'bard',
  pos: Vec2,
  extra: Partial<UnitState> = {},
): UnitState {
  const d = UNIT_DEFS[defId];
  return {
    uid,
    defId,
    faction: uid.startsWith('e') ? 'enemy' : 'player',
    hp: d.base.maxHp,
    pos,
    skillCd: 0,
    movedInTurn: false,
    ...extra,
  };
}

describe('再舞', () => {
  it('没动过的友军点不中', () => {
    const bard = make('bard', 'bard', { x: 1, y: 1 }, {
      battleSkill: skillDefForId('encore'),
    });
    const ally = make('ally', 'sword', { x: 1, y: 2 });
    const events = castSkillManual(bard, UNIT_DEFS, [bard, ally], emptyTerrain(4, 4), 'ally');
    expect(events.some((e) => e.type === 'encore')).toBe(false);
  });

  it('已经动过的友军会在伶人之后立刻再动一次', () => {
    const units = [
      make('sword', 'sword', { x: 1, y: 1 }),
      make('bard', 'bard', { x: 1, y: 2 }, {
        mercSpd: 1,
        battleSkill: skillDefForId('encore'),
      }),
      make('e1', 'shield', { x: 1, y: 0 }),
    ];
    const sim = createBattleSim(units, emptyTerrain(3, 4), UNIT_DEFS, { mode: 'auto' });
    const events = [];
    for (let i = 0; i < 8 && !sim.isDone(); i += 1) {
      events.push(...sim.stepTurn().events);
    }
    expect(events.some((e) => e.type === 'encore' && e.uid === 'sword')).toBe(true);
    const starts = events.filter((e) => e.type === 'turnStart' && e.uid === 'sword');
    expect(starts.length).toBeGreaterThanOrEqual(2);
  });
});
