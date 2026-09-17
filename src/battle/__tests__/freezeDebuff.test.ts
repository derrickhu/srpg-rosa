import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { emptyTerrain } from '../grid';
import { consumeFreeze, tickTimedBattleEffects } from '../timedBattleEffects';
import type { UnitState } from '../types';

function unit(partial: Partial<UnitState> & Pick<UnitState, 'uid' | 'defId' | 'faction' | 'pos'>): UnitState {
  const d = UNIT_DEFS[partial.defId];
  return {
    hp: d.base.maxHp,
    skillCd: 0,
    movedInTurn: false,
    ...partial,
  };
}

describe('冰冻跳过行动', () => {
  it('轮首 tick 不会提前摘掉未出手的冰冻', () => {
    const u = unit({
      uid: 'e1',
      defId: 'sword',
      faction: 'enemy',
      pos: { x: 1, y: 1 },
      timedBattleEffects: [{ kind: 'freeze', roundsLeft: 1 }],
    });
    expect(tickTimedBattleEffects([u])).toEqual([]);
    expect(u.timedBattleEffects).toEqual([{ kind: 'freeze', roundsLeft: 1 }]);
    expect(consumeFreeze(u)).toBe(true);
    expect(u.timedBattleEffects).toBeUndefined();
  });

  it('轮到被冻住的单位时整回合跳过，不普攻', () => {
    const frozen = unit({
      uid: 'e1',
      defId: 'sword',
      faction: 'enemy',
      pos: { x: 1, y: 0 },
      mercSpd: 20,
      timedBattleEffects: [{ kind: 'freeze', roundsLeft: 1 }],
    });
    const player = unit({
      uid: 'p1',
      defId: 'shield',
      faction: 'player',
      pos: { x: 1, y: 1 },
      mercSpd: 1,
    });
    const sim = createBattleSim([player, frozen], emptyTerrain(4, 4), UNIT_DEFS, { mode: 'auto' });
    const evs = [...sim.stepTurn().events, ...sim.stepTurn().events];
    expect(evs.some((e) => e.type === 'turnStart' && e.uid === 'e1')).toBe(true);
    expect(evs).toContainEqual({ type: 'statusNote', target: 'e1', text: '冰冻', tone: 'debuff' });
    expect(evs.some((e) => e.type === 'attack' && e.attacker === 'e1')).toBe(false);
    expect(player.hp).toBe(UNIT_DEFS.shield.base.maxHp);
  });

  it('人工模式下被冻住的玩家不会停下来等指令，跳过一次后解冻', () => {
    const p1 = unit({
      uid: 'p1',
      defId: 'sword',
      faction: 'player',
      pos: { x: 0, y: 0 },
      mercSpd: 20,
      timedBattleEffects: [{ kind: 'freeze', roundsLeft: 1 }],
    });
    const e1 = unit({
      uid: 'e1',
      defId: 'shield',
      faction: 'enemy',
      pos: { x: 3, y: 3 },
      mercSpd: 1,
    });
    const sim = createBattleSim([p1, e1], emptyTerrain(5, 5), UNIT_DEFS, { mode: 'manual' });
    sim.stepTurn();
    const skip = sim.stepTurn();
    expect(skip.events).toContainEqual({ type: 'statusNote', target: 'p1', text: '冰冻', tone: 'debuff' });
    expect(sim.pending()).toBeNull();
    expect(sim.getUnit('p1')!.timedBattleEffects ?? []).toEqual([]);

    const evs: ReturnType<typeof sim.stepTurn>['events'] = [];
    for (let i = 0; i < 12 && !sim.pending(); i += 1) evs.push(...sim.stepTurn().events);
    expect(sim.pending()?.uid).toBe('p1');
    expect(evs.some((e) => e.type === 'statusNote' && e.target === 'p1' && e.text === '冰冻')).toBe(false);
  });
});
