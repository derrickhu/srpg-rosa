import { describe, it, expect } from 'vitest';
import { createBattleSim, type BattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { UnitState, Vec2 } from '../types';

/**
 * 战斗中随时切托管。
 *
 * 这条开关存在的理由是同一局里不同段落需要不同的操作密度：清杂兵没有决策，
 * Boss 起手要走位。所以它必须是**双向**的，而且切过去之后不能吞掉任何一次行动——
 * 玩家最怕的是「我一按托管，这个人这回合就废了」。
 */

function unit(uid: string, defId: 'sword' | 'shield', faction: 'player' | 'enemy', pos: Vec2): UnitState {
  const d = UNIT_DEFS[defId];
  return {
    uid,
    defId,
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: faction === 'player' ? skillDefForId('whirl') ?? undefined : undefined,
  };
}

/** 两个玩家单位 + 一个敌人，用来看「切回手动后下一个人是否停下来等」 */
function setup(mode: 'manual' | 'auto' = 'manual'): BattleSim {
  const units: UnitState[] = [
    unit('p1', 'sword', 'player', { x: 0, y: 2 }),
    unit('p2', 'sword', 'player', { x: 2, y: 2 }),
    unit('e1', 'shield', 'enemy', { x: 1, y: 0 }),
  ];
  return createBattleSim(units, emptyTerrain(4, 4), UNIT_DEFS, { mode, aiDifficulty: 'normal' });
}

/** 推进到有人等指令或战斗结束 */
function stepUntilPending(sim: BattleSim, maxSteps = 40): void {
  for (let i = 0; i < maxSteps && !sim.isDone() && !sim.pending(); i += 1) sim.stepTurn();
}

describe('战斗中切托管', () => {
  it('手动开局时玩家单位会停下来等指令', () => {
    const sim = setup('manual');
    stepUntilPending(sim);
    expect(sim.isAuto()).toBe(false);
    expect(sim.pending()).not.toBeNull();
  });

  it('切托管：手上这个单位当场由程序决策接手打完，不是被跳过', () => {
    const sim = setup('manual');
    stepUntilPending(sim);
    const uid = sim.pending()!.uid;
    const before = { ...sim.getUnit(uid)!.pos };

    const step = sim.setAuto(true);

    expect(sim.isAuto()).toBe(true);
    // 等指令的状态必须消掉，否则主循环会卡在「有人在等」而 stepTurn 又不肯推进
    expect(sim.pending()).toBeNull();
    // 接手要真的做事：这一步得产出事件，而且这个单位应该朝敌人动了
    expect(step.events.length).toBeGreaterThan(0);
    const after = sim.getUnit(uid)!.pos;
    expect({ ...after }).not.toEqual(before);
  });

  it('切回手动：下一个该动的玩家单位重新停下来等指令', () => {
    const sim = setup('manual');
    stepUntilPending(sim);
    sim.setAuto(true);
    // 托管态下程序决策会一路代打，不再有人等指令
    sim.stepTurn();
    expect(sim.pending()).toBeNull();

    sim.setAuto(false);
    expect(sim.isAuto()).toBe(false);
    stepUntilPending(sim);
    expect(sim.isDone() || sim.pending() !== null).toBe(true);
    if (!sim.isDone()) expect(sim.pending()!.uid.startsWith('p')).toBe(true);
  });

  it('切回手动不产生事件：它只影响下一个单位归谁操作', () => {
    const sim = setup('manual');
    stepUntilPending(sim);
    sim.setAuto(true);
    const step = sim.setAuto(false);
    expect(step.events).toEqual([]);
  });

  it('反复来回切也能正常打完，不会卡死也不会打不出结果', () => {
    const sim = setup('manual');
    let flips = 0;
    for (let i = 0; i < 400 && !sim.isDone(); i += 1) {
      if (sim.pending()) {
        // 每次轮到玩家就切一次托管，让程序决策代打这一个，然后立刻收回来
        sim.setAuto(true);
        sim.setAuto(false);
        flips += 1;
      } else {
        sim.stepTurn();
      }
    }
    expect(flips).toBeGreaterThan(0);
    expect(sim.isDone()).toBe(true);
    expect(sim.getRound()).toBeGreaterThan(0);
  });

  it('开局自动时 isAuto 为真，好让界面知道该显示「接手」还是「托管」', () => {
    const sim = setup('auto');
    expect(sim.isAuto()).toBe(true);
    sim.stepTurn();
    expect(sim.pending()).toBeNull();
  });
});
