import { describe, it, expect } from 'vitest';
import { createBattleSim, type BattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';

/**
 * 第二技能槽（局内商店买到的临时技能）。
 *
 * 这一组守的是**行动经济没被改坏**：临时技能给的是「主技能冷却时还有别的事做」，
 * 不是每回合多打一发。放开成两次出手的话，同一套敌人血量会突然变得过软，
 * 而这件事在单场对局里看不出来，要跑完整章胜率才暴露。
 */
function makeSim(mode: 'manual' | 'auto' = 'manual'): BattleSim {
  const d = UNIT_DEFS.sword;
  const p: UnitState = {
    uid: 'p1',
    defId: 'sword',
    faction: 'player',
    hp: d.base.maxHp,
    pos: { x: 1, y: 1 },
    skillCd: 0,
    movedInTurn: false,
    // 主槽旋风斩（邻格 AoE），临时槽野草缠足（2 格内选一敌减速）
    battleSkill: skillDefForId('whirl'),
    tempSkill: skillDefForId('temp_gl_snare'),
    tempSkillCd: 0,
  };
  const e: UnitState = {
    uid: 'e1',
    defId: 'shield',
    faction: 'enemy',
    hp: UNIT_DEFS.shield.base.maxHp * 10,
    pos: { x: 1, y: 0 },
    skillCd: 0,
    movedInTurn: false,
  };
  return createBattleSim([p, e], emptyTerrain(3, 3), UNIT_DEFS, { mode });
}

function toPending(sim: BattleSim): void {
  for (let i = 0; i < 20 && !sim.isDone() && !sim.pending(); i++) sim.stepTurn();
}

describe('临时技能槽', () => {
  it('两个槽都可用时，两个都出现在 castableSlots 里', () => {
    const sim = makeSim();
    toPending(sim);
    expect(sim.pending()!.castableSlots).toEqual(['main', 'temp']);
    expect(sim.skillAiming('p1', 'main')?.skillId).toBe('whirl');
    expect(sim.skillAiming('p1', 'temp')?.skillId).toBe('temp_gl_snare');
  });

  it('放临时技能只进临时槽的冷却，主技能冷却不动', () => {
    const sim = makeSim();
    toPending(sim);
    sim.commandSkill('p1', 'e1', 'temp');
    const u = sim.getUnit('p1')!;
    expect(u.tempSkillCd).toBe(2);
    expect(u.skillCd).toBe(0);
  });

  it('一回合只能放一次：放完临时技能后主技能也不能再放', () => {
    const sim = makeSim();
    toPending(sim);
    sim.commandSkill('p1', 'e1', 'temp');
    // 回合可能已经因为「无事可做」自动收尾，那本身就说明放不了了
    const p = sim.pending();
    if (p) {
      expect(p.canSkill).toBe(false);
      expect(p.castableSlots).toEqual([]);
    }
    expect(sim.getUnit('p1')!.skillCd).toBe(0);
  });

  it('自动模式优先用主技能', () => {
    const sim = makeSim('auto');
    for (let i = 0; i < 6 && !sim.isDone(); i++) {
      sim.stepTurn();
      if ((sim.getUnit('p1')!.skillCd ?? 0) > 0) break;
    }
    const u = sim.getUnit('p1')!;
    expect(u.skillCd, '主技能应该被放掉了').toBeGreaterThan(0);
    expect(u.tempSkillCd ?? 0, '同一回合不该再放临时技能').toBe(0);
  });

  it('词条强化主技能', () => {
    const sim = makeSim();
    toPending(sim);
    const before = sim.getUnit('e1')!.hp;
    sim.commandSkill('p1', undefined, 'main');
    const plain = before - sim.getUnit('e1')!.hp;

    const buffed = makeSim();
    buffed.getUnit('p1')!.skillMods = ['sharpen', 'sharpen'];
    toPending(buffed);
    const b0 = buffed.getUnit('e1')!.hp;
    buffed.commandSkill('p1', undefined, 'main');
    expect(b0 - buffed.getUnit('e1')!.hp).toBeGreaterThan(plain);
  });

  /**
   * 临时技能**不吃**词条。这条早先是反的（词条按人挂、两槽都吃），但那样一来
   * 三选一卡面就没法说实话：卡上画着临时技能 + 一条词条，实际主技能也在吃，
   * 玩家读到的作用范围是错的。收敛到主技能后卡面画的那一招就是唯一被改的那一招。
   *
   * 用冷却而不是伤害来验：野草缠足是 `damage: none`，伤害类词条本来就挂不上去，
   * 拿伤害断言等于什么都没验（上一版就是这么悄悄失效的）。
   */
  it('临时技能不吃词条：迅捷只缩短主技能的冷却', () => {
    const sim = makeSim();
    sim.getUnit('p1')!.skillMods = ['quick_cast'];
    toPending(sim);
    sim.commandSkill('p1', 'e1', 'temp');
    // 野草缠足冷却 2，没吃到迅捷就还是 2
    expect(sim.getUnit('p1')!.tempSkillCd).toBe(2);

    const main = makeSim();
    main.getUnit('p1')!.skillMods = ['quick_cast'];
    toPending(main);
    main.commandSkill('p1', undefined, 'main');
    // 旋风斩冷却 3，吃到迅捷后是 2
    expect(main.getUnit('p1')!.skillCd).toBe(2);
  });
});
