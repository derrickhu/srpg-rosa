import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { emptyTerrain, type TerrainGrid } from '../grid';
import type { BattleEvent, TerrainId, UnitState, Vec2 } from '../types';

/** 单行走廊：敌人去砍左边的人必须踏过中间的药，绕不开 */
function corridor(): TerrainGrid {
  const walk: TerrainId[] = ['plain', 'plain', 'plain', 'plain', 'plain'];
  const wall: TerrainId[] = ['wall', 'wall', 'wall', 'wall', 'wall'];
  return [walk, wall];
}

function unit(
  uid: string,
  faction: 'player' | 'enemy',
  pos: Vec2,
  hp?: number,
): UnitState {
  const d = UNIT_DEFS.sword;
  return {
    uid,
    defId: 'sword',
    faction,
    hp: hp ?? d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
  };
}

function stepUntilPending(sim: ReturnType<typeof createBattleSim>, maxSteps = 20): BattleEvent[] {
  const out: BattleEvent[] = [];
  for (let i = 0; i < maxSteps && !sim.isDone() && !sim.pending(); i++) {
    out.push(...sim.stepTurn().events);
  }
  return out;
}

/** 远处留一只活口，否则最后一击会直接结束战斗，来不及走过去待机 */
function setupDrops(player: Vec2, foe: Vec2) {
  return createBattleSim(
    [
      unit('p1', 'player', player),
      unit('e1', 'enemy', foe, 1),
      unit('e2', 'enemy', { x: 4, y: 0 }, 40),
    ],
    emptyTerrain(5, 5),
    UNIT_DEFS,
    { mode: 'manual', enableDrops: true, dropChance: 1, dropRng: () => 0 },
  );
}

describe('无尽掉落与待机拾取', () => {
  it('敌人死亡时可能掉药，走到该格待机才捡起来', () => {
    const sim = setupDrops({ x: 1, y: 1 }, { x: 1, y: 0 });
    stepUntilPending(sim);
    const kill = sim.commandAttack('p1', 'e1');
    expect(kill.events.some((e) => e.type === 'death' && e.uid === 'e1')).toBe(true);
    expect(kill.events.find((e) => e.type === 'drop')).toMatchObject({
      type: 'drop',
      pos: { x: 1, y: 0 },
    });

    sim.commandWait('p1');
    stepUntilPending(sim);
    const moved = sim.commandMove('p1', { x: 1, y: 0 });
    expect(moved.events.some((e) => e.type === 'pickup')).toBe(false);

    const waited = sim.commandWait('p1');
    expect(waited.events.some((e) => e.type === 'pickup' && e.potionId)).toBe(true);
  });

  it('路过掉落格不捡', () => {
    const sim = setupDrops({ x: 0, y: 1 }, { x: 1, y: 1 });
    stepUntilPending(sim);
    sim.commandAttack('p1', 'e1');
    sim.commandWait('p1');
    stepUntilPending(sim);
    const moved = sim.commandMove('p1', { x: 2, y: 1 });
    expect(moved.events.some((e) => e.type === 'pickup')).toBe(false);
    const waited = sim.commandWait('p1');
    expect(waited.events.some((e) => e.type === 'pickup')).toBe(false);
  });

  it('先出手再走上掉落格时留着撤销，点待机才捡', () => {
    const sim = setupDrops({ x: 1, y: 1 }, { x: 1, y: 0 });
    stepUntilPending(sim);
    sim.commandAttack('p1', 'e1');
    const moved = sim.commandMove('p1', { x: 1, y: 0 });
    expect(moved.events.some((e) => e.type === 'pickup')).toBe(false);
    expect(sim.pending()?.canUndoMove).toBe(true);
    const waited = sim.commandWait('p1');
    expect(waited.events.some((e) => e.type === 'pickup' && e.potionId)).toBe(true);
  });

  it('上一波没捡的药开局还在地上，走到格上待机才能捡', () => {
    const leftover = { pos: { x: 1, y: 0 }, potionId: 'heal' };
    const p1 = unit('p1', 'player', { x: 1, y: 1 });
    p1.mercSpd = 9;
    const sim = createBattleSim(
      [
        p1,
        unit('e1', 'enemy', { x: 4, y: 4 }, 40),
      ],
      emptyTerrain(5, 5),
      UNIT_DEFS,
      { mode: 'manual', enableDrops: true, initialDrops: [leftover] },
    );
    expect(sim.getDrops()).toEqual([leftover]);

    stepUntilPending(sim);
    expect(sim.commandMove('p1', leftover.pos).events.some((e) => e.type === 'pickup')).toBe(false);
    expect(sim.getDrops()).toHaveLength(1);
    const waited = sim.commandWait('p1');
    expect(waited.events.some((e) => e.type === 'pickup' && e.potionId === 'heal')).toBe(true);
    expect(sim.getDrops()).toEqual([]);
  });

  it('敌人走到药上，药就没了，玩家再去捡不到', () => {
    const leftover = { pos: { x: 1, y: 0 }, potionId: 'heal' };
    const p1 = unit('p1', 'player', { x: 0, y: 0 });
    p1.mercSpd = 9;
    const e1 = unit('e1', 'enemy', { x: 3, y: 0 }, 40);
    e1.mercSpd = 1;
    const sim = createBattleSim(
      [p1, e1],
      corridor(),
      UNIT_DEFS,
      { mode: 'manual', enableDrops: true, initialDrops: [leftover] },
    );
    stepUntilPending(sim);
    sim.commandWait('p1');
    const evs: BattleEvent[] = [];
    for (let i = 0; i < 8 && !sim.isDone() && sim.getDrops().length > 0; i++) {
      evs.push(...sim.stepTurn().events);
    }
    expect(evs.some((e) => e.type === 'dropLost' && e.potionId === 'heal')).toBe(true);
    expect(sim.getDrops()).toEqual([]);
  });

  it('主线不开掉落', () => {
    const sim = createBattleSim(
      [unit('p1', 'player', { x: 1, y: 1 }), unit('e1', 'enemy', { x: 1, y: 0 }, 1)],
      emptyTerrain(3, 3),
      UNIT_DEFS,
      { mode: 'manual' },
    );
    stepUntilPending(sim);
    const kill = sim.commandAttack('p1', 'e1');
    expect(kill.events.some((e) => e.type === 'death')).toBe(true);
    expect(kill.events.some((e) => e.type === 'drop')).toBe(false);
  });
});
