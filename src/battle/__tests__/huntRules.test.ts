import { describe, expect, it } from 'vitest';
import { createBattleSim } from '@/battle/engine';
import { emptyTerrain } from '@/battle/grid';
import type { UnitState, Vec2 } from '@/battle/types';
import { UNIT_DEFS } from '@/data/unitDefs';
import { HUNT_HOWL_AFTER_ROUNDS, HUNT_HOWL_HEAL_RATIO, HUNT_HOWL_MIN_HEAL } from '@/data/eventCatalog';

function unit(
  uid: string,
  faction: 'player' | 'enemy',
  pos: Vec2,
  hp: number,
  atk = 1,
): UnitState {
  return {
    uid,
    defId: 'sword',
    faction,
    hp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    mercMaxHp: hp,
    mercAtk: atk,
  };
}

describe('围猎头狼', () => {
  it('头狼一死，同群剩下的散掉，并在原地掉一瓶治疗药', () => {
    const sim = createBattleSim(
      [
        unit('p1', 'player', { x: 1, y: 1 }, 80, 30),
        unit('alpha', 'enemy', { x: 1, y: 0 }, 1, 1),
        unit('mook', 'enemy', { x: 3, y: 0 }, 40, 1),
      ],
      emptyTerrain(5, 5),
      UNIT_DEFS,
      {
        mode: 'manual',
        hunt: {
          packs: [{
            id: 1,
            alphaUid: 'alpha',
            memberUids: ['alpha', 'mook'],
            enteredRound: 1,
            howled: false,
            scattered: false,
          }],
          howlAfterRounds: HUNT_HOWL_AFTER_ROUNDS,
          howlHealRatio: HUNT_HOWL_HEAL_RATIO,
          minHowlHeal: HUNT_HOWL_MIN_HEAL,
          onHowl: () => null,
        },
      },
    );
    const events = [];
    for (let i = 0; i < 8 && !sim.pending() && !sim.isDone(); i++) {
      events.push(...sim.stepTurn().events);
    }
    const killed = sim.commandAttack('p1', 'alpha');
    expect(killed.events.some((e) => e.type === 'death' && e.uid === 'alpha')).toBe(true);
    expect(killed.events.some((e) => e.type === 'death' && e.uid === 'mook')).toBe(true);
    expect(killed.events.some((e) => e.type === 'statusNote' && e.text === '四散')).toBe(true);
    expect(killed.events.find((e) => e.type === 'drop')).toMatchObject({
      type: 'drop',
      pos: { x: 1, y: 0 },
      potionId: 'heal',
    });
    expect(sim.getUnits().filter((u) => u.faction === 'enemy' && u.hp > 0)).toHaveLength(0);
  });

  it('头狼活过六回合会吼，并把下一群拉上场', () => {
    const packs = [{
      id: 1,
      alphaUid: 'alpha',
      memberUids: ['alpha'],
      enteredRound: 1,
      howled: false,
      scattered: false,
    }];
    const sim = createBattleSim(
      [
        unit('p1', 'player', { x: 0, y: 4 }, 5000, 1),
        unit('alpha', 'enemy', { x: 0, y: 0 }, 5000, 1),
      ],
      emptyTerrain(5, 5),
      UNIT_DEFS,
      {
        mode: 'auto',
        aiDifficulty: 'easy',
        hunt: {
          packs,
          howlAfterRounds: HUNT_HOWL_AFTER_ROUNDS,
          howlHealRatio: HUNT_HOWL_HEAL_RATIO,
          minHowlHeal: HUNT_HOWL_MIN_HEAL,
          onHowl: () => ({
            id: 2,
            alphaUid: 'alpha2',
            units: [unit('alpha2', 'enemy', { x: 4, y: 0 }, 40, 1)],
          }),
        },
      },
    );
    const seen = [];
    for (let i = 0; i < 400 && !sim.isDone() && sim.getRound() < 8; i++) {
      seen.push(...sim.stepTurn().events);
    }
    expect(sim.getRound()).toBeGreaterThanOrEqual(7);
    expect(seen.some((e) => e.type === 'statusNote' && e.text === '狼吼')).toBe(true);
    expect(seen.some((e) => e.type === 'spawn' && e.unit.uid === 'alpha2')).toBe(true);
    expect(packs.some((p) => p.id === 2)).toBe(true);
    expect(sim.getUnits().some((u) => u.uid === 'alpha2' && u.hp > 0)).toBe(true);
  });
});
