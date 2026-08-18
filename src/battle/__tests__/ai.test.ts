import { afterEach, describe, it, expect, vi } from 'vitest';
import { chooseTurnAction, canAttackFrom } from '../ai';
import { UNIT_DEFS } from '@/data/unitDefs';
import { effectiveUnitDef } from '../effectiveUnit';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';

function makeUnit(uid: string, defId: 'sword' | 'bow' | 'cavalry' | 'shield', faction: 'player' | 'enemy', pos: { x: number; y: number }): UnitState {
  const d = UNIT_DEFS[defId];
  return {
    uid,
    defId,
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
  };
}

describe('canAttackFrom', () => {
  const flat = emptyTerrain(6, 6);

  it('melee can attack adjacent', () => {
    const def = effectiveUnitDef(makeUnit('p', 'sword', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 1, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target, flat)).toBe(true);
  });

  it('melee cannot attack 2 cells away', () => {
    const def = effectiveUnitDef(makeUnit('p', 'sword', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 2, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target, flat)).toBe(false);
  });

  it('ranged can attack within range', () => {
    const def = effectiveUnitDef(makeUnit('p', 'bow', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 3, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target, flat)).toBe(true);
  });

  it('ranged cannot attack beyond range', () => {
    const def = effectiveUnitDef(makeUnit('p', 'bow', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 4, y: 0 });
    expect(canAttackFrom(def, { x: 0, y: 0 }, target, flat)).toBe(false);
  });

  it('城墙挡住射程内的远程攻击', () => {
    const def = effectiveUnitDef(makeUnit('p', 'bow', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 3, y: 0 });
    const walled = emptyTerrain(6, 6);
    walled[0]![1] = 'wall';
    expect(canAttackFrom(def, { x: 0, y: 0 }, target, walled)).toBe(false);
  });

  it('深渊不挡视线：箭从裂谷上方飞过去', () => {
    const def = effectiveUnitDef(makeUnit('p', 'bow', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 3, y: 0 });
    const chasm = emptyTerrain(6, 6);
    chasm[0]![1] = 'abyss';
    expect(canAttackFrom(def, { x: 0, y: 0 }, target, chasm)).toBe(true);
  });

  it('近战贴着城墙也能打邻格：两格直接相接，中间没有格子可挡', () => {
    const def = effectiveUnitDef(makeUnit('p', 'sword', 'player', { x: 0, y: 0 }), UNIT_DEFS);
    const target = makeUnit('e', 'sword', 'enemy', { x: 1, y: 0 });
    const walled = emptyTerrain(6, 6);
    walled[1]![0] = 'wall';
    walled[1]![1] = 'wall';
    expect(canAttackFrom(def, { x: 0, y: 0 }, target, walled)).toBe(true);
  });
});

describe('chooseTurnAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attacks when in range', () => {
    const attacker = makeUnit('p1', 'sword', 'player', { x: 2, y: 2 });
    const target = makeUnit('e1', 'sword', 'enemy', { x: 2, y: 1 });
    const terrain = emptyTerrain(5, 5);
    const choice = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain);
    expect(choice.attackTarget).not.toBeNull();
  });

  it('moves toward enemy when out of range', () => {
    const attacker = makeUnit('p1', 'sword', 'player', { x: 0, y: 4 });
    const target = makeUnit('e1', 'sword', 'enemy', { x: 4, y: 0 });
    const terrain = emptyTerrain(5, 5);
    const choice = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain);
    expect(choice.moveTo).not.toBeNull();
  });

  it('respects difficulty parameter', () => {
    const attacker = makeUnit('p1', 'sword', 'player', { x: 0, y: 4 });
    const target = makeUnit('e1', 'sword', 'enemy', { x: 4, y: 0 });
    const terrain = emptyTerrain(5, 5);
    const easy = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain, 'easy');
    const hard = chooseTurnAction(attacker, UNIT_DEFS, [attacker, target], terrain, 'hard');
    expect(easy).toBeDefined();
    expect(hard).toBeDefined();
  });

  /**
   * 玩家点燃一片森林之后，敌人径直走进火里站着烧的话，看起来是游戏坏了而不是怪很笨。
   * 所以回避掉血格不分难度——`easy` 该体现在索敌和站位更差上。
   */
  it.each(['easy', 'normal', 'hard'] as const)('%s 难度都不挑掉血格站位', (difficulty) => {
    // `easy` 有 15% 概率整回合摆烂（`chooseTurnAction` 开头那次掷点），不钉住随机源的话
    // 这条断言就是七分之六概率通过——它确实这样偷跑过好几轮全绿。0.5 同时也让
    // easy 的随机索敌变成确定的（这里只有一个目标，但别让它取决于实现细节）。
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // 目标在 (2,1)，四个贴身格 (2,2)/(1,1)/(3,1)/(2,0) 对 move 3 的剑士全都够得着，
    // 伤害也完全相同（燃烧格的 atkMul 是 1）。把 (2,2) 点着，AI 该挑另外三个里的一个。
    const attacker = makeUnit('e1', 'sword', 'enemy', { x: 2, y: 3 });
    const target = makeUnit('p1', 'shield', 'player', { x: 2, y: 1 });
    const terrain = emptyTerrain(5, 5);
    terrain[2]![2] = 'burning';

    const choice = chooseTurnAction(
      attacker, UNIT_DEFS, [attacker, target], terrain, difficulty,
    );

    expect(choice.moveTo).not.toEqual({ x: 2, y: 2 });
    expect(choice.attackTarget?.uid).toBe('p1');
  });

  /**
   * 回避的罚分不能大到让 AI 不敢进场——那会变成「在火边上站着不动」，
   * 比走进火里更像坏了。所以火格是唯一打得到的落点时，仍然要踩进去。
   */
  it('燃烧格是唯一能打到的落点时，仍然踩进去', () => {
    const attacker = makeUnit('e1', 'sword', 'enemy', { x: 2, y: 3 });
    const target = makeUnit('p1', 'shield', 'player', { x: 2, y: 1 });
    const terrain = emptyTerrain(5, 5);
    // 用城墙封掉另外三个贴身格，只留 (2,2) 这个燃烧格
    terrain[1]![1] = 'wall';
    terrain[1]![3] = 'wall';
    terrain[0]![2] = 'wall';
    terrain[2]![2] = 'burning';

    const choice = chooseTurnAction(
      attacker, UNIT_DEFS, [attacker, target], terrain, 'normal',
    );

    expect(choice.moveTo).toEqual({ x: 2, y: 2 });
    expect(choice.attackTarget?.uid).toBe('p1');
  });
});
