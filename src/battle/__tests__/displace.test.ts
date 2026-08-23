import { describe, expect, it } from 'vitest';
import { createBattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { TerrainGrid } from '../grid';
import type { UnitState, Vec2 } from '../types';
import { axisDirection, displaceLanding, displaceUnit } from '../displace';
import { castSkillManual, trySkillBeforeMove } from '../skills';

function unit(
  uid: string,
  defId: 'cavalry' | 'shield' | 'sword',
  faction: 'player' | 'enemy',
  pos: Vec2,
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
    movedInTurn: false,
    battleSkill: skillId ? skillDefForId(skillId) ?? undefined : undefined,
  };
}

function stepUntilPending(sim: ReturnType<typeof createBattleSim>, max = 20): void {
  for (let i = 0; i < max && !sim.isDone() && !sim.pending(); i++) sim.stepTurn();
}

describe('displaceLanding', () => {
  const flat = emptyTerrain(7, 7);
  const empty = new Set<string>();

  it('沿方向推进指定格数', () => {
    expect(displaceLanding({ x: 2, y: 2 }, { x: 0, y: 1 }, 2, flat, empty))
      .toEqual({ x: 2, y: 4 });
  });

  it('撞墙停在前一格', () => {
    const t: TerrainGrid = emptyTerrain(7, 7);
    t[5]![2] = 'wall';
    expect(displaceLanding({ x: 2, y: 2 }, { x: 0, y: 1 }, 4, t, empty))
      .toEqual({ x: 2, y: 4 });
  });

  it('撞到别人停在前一格', () => {
    expect(displaceLanding({ x: 2, y: 2 }, { x: 0, y: 1 }, 3, flat, new Set(['2,4'])))
      .toEqual({ x: 2, y: 3 });
  });

  it('推出界停在最后一格合法空地', () => {
    expect(displaceLanding({ x: 2, y: 5 }, { x: 0, y: 1 }, 3, flat, empty))
      .toEqual({ x: 2, y: 6 });
  });

  it('可以穿过 passThrough 格但不能停在上面', () => {
    // 目标在 (2,4)，背后 (2,6) 被占：穿过目标后停在 (2,5)
    const to = displaceLanding(
      { x: 2, y: 2 },
      { x: 0, y: 1 },
      4,
      flat,
      new Set(['2,4', '2,6']),
      new Set(['2,4']),
    );
    expect(to).toEqual({ x: 2, y: 5 });
  });

  it('一格都走不了返回 null', () => {
    const t: TerrainGrid = emptyTerrain(3, 3);
    t[1]![2] = 'wall';
    expect(displaceLanding({ x: 1, y: 1 }, { x: 1, y: 0 }, 2, t, empty)).toBeNull();
  });
});

describe('axisDirection', () => {
  it('同行同列给出单位向量', () => {
    expect(axisDirection({ x: 1, y: 1 }, { x: 1, y: 4 })).toEqual({ x: 0, y: 1 });
    expect(axisDirection({ x: 4, y: 2 }, { x: 1, y: 2 })).toEqual({ x: -1, y: 0 });
  });
  it('斜向和同格都算不出来', () => {
    expect(axisDirection({ x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
    expect(axisDirection({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('长驱突刺的突进', () => {
  it('命中后穿过目标落到它身后 2 格，并记作已移动', () => {
    const self = unit('p1', 'cavalry', 'player', { x: 2, y: 2 }, 'lance_thrust');
    const tgt = unit('e1', 'sword', 'enemy', { x: 2, y: 4 });
    const units = [self, tgt];
    const events = castSkillManual(self, UNIT_DEFS, units, emptyTerrain(7, 7), 'e1');
    expect(events.some((e) => e.type === 'skillCast')).toBe(true);
    const dash = events.find((e) => e.type === 'displace');
    expect(dash).toMatchObject({
      type: 'displace',
      uid: 'p1',
      from: { x: 2, y: 2 },
      to: { x: 2, y: 6 },
      reason: 'dash',
    });
    expect(self.pos).toEqual({ x: 2, y: 6 });
    expect(self.movedInTurn).toBe(true);
  });

  it('背后被占时不停在目标身上', () => {
    const self = unit('p1', 'cavalry', 'player', { x: 2, y: 2 }, 'lance_thrust');
    const tgt = unit('e1', 'sword', 'enemy', { x: 2, y: 4 });
    const blocker = unit('e2', 'sword', 'enemy', { x: 2, y: 5 });
    const units = [self, tgt, blocker];
    castSkillManual(self, UNIT_DEFS, units, emptyTerrain(7, 7), 'e1');
    expect(self.pos).not.toEqual(tgt.pos);
    expect(self.pos).toEqual({ x: 2, y: 3 });
  });
});

describe('震击的击退', () => {
  it('把目标向后推 2 格', () => {
    const self = unit('p1', 'shield', 'player', { x: 2, y: 2 }, 'bash');
    const tgt = unit('e1', 'sword', 'enemy', { x: 2, y: 3 });
    const units = [self, tgt];
    const events = castSkillManual(self, UNIT_DEFS, units, emptyTerrain(7, 7), 'e1');
    const kb = events.find((e) => e.type === 'displace');
    expect(kb).toMatchObject({
      type: 'displace',
      uid: 'e1',
      to: { x: 2, y: 5 },
      reason: 'knockback',
    });
    expect(tgt.pos).toEqual({ x: 2, y: 5 });
    expect(self.pos).toEqual({ x: 2, y: 2 });
  });

  it('撞墙停在墙前', () => {
    const terrain = emptyTerrain(7, 7);
    terrain[5]![2] = 'wall';
    const self = unit('p1', 'shield', 'player', { x: 2, y: 2 }, 'bash');
    const tgt = unit('e1', 'sword', 'enemy', { x: 2, y: 3 });
    const units = [self, tgt];
    castSkillManual(self, UNIT_DEFS, units, terrain, 'e1');
    expect(tgt.pos).toEqual({ x: 2, y: 4 });
  });

  it('自动施放时不把唯一敌人推离队伍，伤害和减速仍在', () => {
    const self = unit('p1', 'shield', 'player', { x: 2, y: 2 }, 'bash');
    const mate = unit('p2', 'sword', 'player', { x: 2, y: 1 });
    const tgt = unit('e1', 'sword', 'enemy', { x: 2, y: 3 });
    const hp = tgt.hp;
    const events = trySkillBeforeMove(self, UNIT_DEFS, [self, mate, tgt], emptyTerrain(7, 7));
    expect(events.some((e) => e.type === 'skillCast')).toBe(true);
    expect(events.some((e) => e.type === 'displace')).toBe(false);
    expect(tgt.pos).toEqual({ x: 2, y: 3 });
    expect(tgt.hp).toBeLessThan(hp);
  });

  it('自动施放时撞到另一个敌人仍击退', () => {
    const self = unit('p1', 'shield', 'player', { x: 2, y: 2 }, 'bash');
    const tgt = unit('e1', 'sword', 'enemy', { x: 2, y: 3 });
    const blocker = unit('e2', 'sword', 'enemy', { x: 2, y: 5 });
    trySkillBeforeMove(self, UNIT_DEFS, [self, tgt, blocker], emptyTerrain(7, 7));
    expect(tgt.pos).toEqual({ x: 2, y: 4 });
  });
});

describe('突刺后的撤销移动', () => {
  it('撤销回到突刺落点，而不是回合起点', () => {
    const self = unit('p1', 'cavalry', 'player', { x: 2, y: 2 }, 'lance_thrust');
    const tgt = unit('e1', 'sword', 'enemy', { x: 2, y: 4 });
    const sim = createBattleSim([self, tgt], emptyTerrain(7, 7), UNIT_DEFS, { mode: 'manual' });
    stepUntilPending(sim);
    sim.commandSkill('p1', 'e1');
    expect(sim.getUnit('p1')!.pos).toEqual({ x: 2, y: 6 });
    const dest = sim.legalMoveCells('p1').find((c) => c.x !== 2 || c.y !== 6);
    expect(dest).toBeTruthy();
    sim.commandMove('p1', dest!);
    expect(sim.pending()?.canUndoMove).toBe(true);
    sim.commandUndoMove('p1');
    expect(sim.getUnit('p1')!.pos).toEqual({ x: 2, y: 6 });
  });
});

describe('displaceUnit 不移动死人', () => {
  it('hp 为 0 时不发事件', () => {
    const dead = unit('e1', 'sword', 'enemy', { x: 2, y: 3 });
    dead.hp = 0;
    expect(displaceUnit(dead, { x: 0, y: 1 }, 2, [dead], emptyTerrain(5, 5), 'knockback'))
      .toBeNull();
  });
});
