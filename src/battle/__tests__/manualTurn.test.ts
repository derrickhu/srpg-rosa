import { describe, it, expect } from 'vitest';
import { createBattleSim, type BattleSim } from '../engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { BattleEvent, UnitState, Vec2 } from '../types';

/**
 * 纯人工模式的硬约束。
 *
 * 这些断言守的是「玩家说了算」这件事本身：引擎不能替玩家动，也不能在玩家还没下令时
 * 把他的单位跳过去。同时人工和自动必须共用同一套结算——两套规则一旦分叉，
 * 玩家会发现亲手打出的伤害和扫荡不一样，从此不再相信任何数字。
 */

function unit(
  uid: string,
  defId: 'sword' | 'shield',
  faction: 'player' | 'enemy',
  pos: Vec2,
  opts: { withSkill?: boolean } = {},
): UnitState {
  const d = UNIT_DEFS[defId];
  // 从真实技能表取，别在测试里手搓 SkillDef：手搓的那份不会随目录改动而失效，
  // 于是测试会在技能表已经变了之后继续「通过」。
  const skill = opts.withSkill ? skillDefForId('whirl') ?? undefined : undefined;
  return {
    uid,
    defId,
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: skill,
  };
}

/** 剑士在 (1,3)，敌人在 (1,0)，隔了 3 格：第一回合走不到，方便观察「不该自动前进」 */
function setupFar(mode: 'manual' | 'auto' = 'manual'): BattleSim {
  const units: UnitState[] = [
    unit('p1', 'sword', 'player', { x: 1, y: 3 }, { withSkill: true }),
    unit('e1', 'shield', 'enemy', { x: 1, y: 0 }),
  ];
  return createBattleSim(units, emptyTerrain(4, 4), UNIT_DEFS, { mode });
}

/** 剑士和敌人贴在一起，用来测普攻 / 技能 */
function setupAdjacent(mode: 'manual' | 'auto' = 'manual'): BattleSim {
  const units: UnitState[] = [
    unit('p1', 'sword', 'player', { x: 1, y: 1 }, { withSkill: true }),
    unit('e1', 'shield', 'enemy', { x: 1, y: 0 }),
  ];
  return createBattleSim(units, emptyTerrain(3, 3), UNIT_DEFS, { mode });
}

/** 推进到「有人在等指令」或战斗结束为止 */
function stepUntilPending(sim: BattleSim, maxSteps = 20): BattleEvent[] {
  const out: BattleEvent[] = [];
  for (let i = 0; i < maxSteps && !sim.isDone() && !sim.pending(); i++) {
    out.push(...sim.stepTurn().events);
  }
  return out;
}

function posOf(sim: BattleSim, uid: string): Vec2 {
  return { ...sim.getUnit(uid)!.pos };
}

describe('纯人工回合', () => {
  it('轮到玩家单位时停下来等指令，且不擅自移动', () => {
    const sim = setupFar();
    const before = posOf(sim, 'p1');
    stepUntilPending(sim);
    const p = sim.pending();
    expect(p?.uid).toBe('p1');
    expect(posOf(sim, 'p1')).toEqual(before);
  });

  it('等指令期间 stepTurn 不会把这个单位跳过去', () => {
    const sim = setupFar();
    stepUntilPending(sim);
    const step = sim.stepTurn();
    expect(step.events).toEqual([]);
    expect(sim.pending()?.uid).toBe('p1');
  });

  it('移动只认可达格，越界指令原地不动', () => {
    const sim = setupFar();
    stepUntilPending(sim);
    const before = posOf(sim, 'p1');
    // 目标格从「可达集合的补集」里取，而不是写死坐标：写死的那个格会随移动力
    // 或地图尺寸的调整悄悄变成合法格，于是这条断言会在真的漏了校验时依然通过。
    const legal = new Set(sim.legalMoveCells('p1').map((c) => `${c.x},${c.y}`));
    let unreachable: Vec2 | null = null;
    for (let y = 0; y < 4 && !unreachable; y++) {
      for (let x = 0; x < 4; x++) {
        if (!legal.has(`${x},${y}`) && !(x === before.x && y === before.y)) {
          unreachable = { x, y };
          break;
        }
      }
    }
    expect(unreachable).not.toBeNull();
    const step = sim.commandMove('p1', unreachable!);
    expect(step.events).toEqual([]);
    expect(posOf(sim, 'p1')).toEqual(before);
  });

  it('移动后可撤销回原位，撤销后还能重新走', () => {
    const sim = setupFar();
    stepUntilPending(sim);
    const start = posOf(sim, 'p1');
    const dest = sim.legalMoveCells('p1')[0]!;
    sim.commandMove('p1', dest);
    expect(posOf(sim, 'p1')).toEqual(dest);
    expect(sim.pending()?.canUndoMove).toBe(true);

    sim.commandUndoMove('p1');
    expect(posOf(sim, 'p1')).toEqual(start);
    expect(sim.pending()?.canMove).toBe(true);
    // movedInTurn 也要复位，否则冲锋类被动会白拿一次「本回合移动过」的加成
    expect(sim.getUnit('p1')!.movedInTurn).toBe(false);
  });

  it('一回合只能移动一次', () => {
    const sim = setupFar();
    stepUntilPending(sim);
    const cells = sim.legalMoveCells('p1');
    sim.commandMove('p1', cells[0]!);
    const after = posOf(sim, 'p1');
    const step = sim.commandMove('p1', cells[1] ?? cells[0]!);
    expect(step.events).toEqual([]);
    expect(posOf(sim, 'p1')).toEqual(after);
  });

  it('先出手后仍可移动；走完之后再出手才锁死撤销', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    sim.commandAttack('p1', 'e1');
    const afterAtk = sim.pending();
    // 技能还在手上，且还没走——应能继续移动（与 AI 先技能再走位一致）
    expect(afterAtk).not.toBeNull();
    expect(afterAtk?.canMove).toBe(true);
    expect(afterAtk?.canUndoMove).toBe(false);

    const dest = sim.legalMoveCells('p1')[0];
    expect(dest).toBeTruthy();
    sim.commandMove('p1', dest!);
    // 出手在前、移动在后：走错了仍能撤，出手本身不回滚
    expect(sim.pending()?.canUndoMove).toBe(true);
  });

  it('先放技能再移动合法，走错了也能撤回来', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    const start = posOf(sim, 'p1');
    const skillEvents = sim.commandSkill('p1');
    expect(skillEvents.events.some((e) => e.type === 'skillCast')).toBe(true);
    expect(sim.pending()?.canMove).toBe(true);
    const dest = sim.legalMoveCells('p1')[0];
    expect(dest).toBeTruthy();
    const moved = sim.commandMove('p1', dest!);
    expect(moved.events.some((e) => e.type === 'moveStep')).toBe(true);
    // 技能已经结算，但这一步走还能悔——以前这里会直接收回合
    expect(sim.pending()).not.toBeNull();
    expect(sim.pending()?.canUndoMove).toBe(true);

    sim.commandUndoMove('p1');
    expect(posOf(sim, 'p1')).toEqual(start);
    expect(sim.pending()?.canMove).toBe(true);
    expect(sim.pending()?.didSkill).toBe(true);
  });

  it('走完再出手则不能撤销：站位已经用来结算过了', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    // 走到仍能普攻到敌人的格子，否则出手会 noop，撤销锁也就测不到
    const dest = sim.legalMoveCells('p1').find((c) => Math.abs(c.x - 1) + Math.abs(c.y - 0) === 1);
    expect(dest).toBeTruthy();
    sim.commandMove('p1', dest!);
    expect(sim.pending()?.canUndoMove).toBe(true);
    sim.commandAttack('p1', 'e1');
    expect(sim.pending()?.canUndoMove ?? false).toBe(false);
  });

  it('普攻只能打射程内的目标', () => {
    const sim = setupFar();
    stepUntilPending(sim);
    expect(sim.legalAttackTargets('p1')).toEqual([]);
    const hpBefore = sim.getUnit('e1')!.hp;
    expect(sim.commandAttack('p1', 'e1').events).toEqual([]);
    expect(sim.getUnit('e1')!.hp).toBe(hpBefore);
  });

  it('技能和普攻可以在同一回合都用（与 AI 的输出口径一致）', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    const skillEvents = sim.commandSkill('p1');
    expect(skillEvents.events.some((e) => e.type === 'skillCast')).toBe(true);
    const p = sim.pending();
    expect(p?.canAttack).toBe(true);
    const atkEvents = sim.commandAttack('p1', 'e1');
    expect(atkEvents.events.some((e) => e.type === 'attack')).toBe(true);
  });

  it('技能和普攻都用完后，走完仍要停下来给撤销，点待机才收尾', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    sim.commandSkill('p1');
    if (!sim.isDone()) sim.commandAttack('p1', 'e1');
    // 出手完若还没走，应留下移动额度，不能直接收尾
    expect(sim.pending()?.canMove).toBe(true);
    const dest = sim.legalMoveCells('p1')[0];
    expect(dest).toBeTruthy();
    sim.commandMove('p1', dest!);
    expect(sim.pending()).not.toBeNull();
    expect(sim.pending()?.canUndoMove).toBe(true);
    sim.commandWait('p1');
    expect(sim.pending()).toBeNull();
  });

  it('待机立即结束该单位回合', () => {
    const sim = setupFar();
    stepUntilPending(sim);
    sim.commandWait('p1');
    expect(sim.pending()).toBeNull();
  });

  it('冷却中的技能放不出来，也不报告可放', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    sim.commandSkill('p1');
    expect(sim.skillAiming('p1')).toBeNull();
    expect(sim.commandSkill('p1').events).toEqual([]);
  });

  it('AoE 技能选范围格确认，不点名敌人', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    // 旋风斩是 neighborAoE：打范围内全体，瞄准给的是格子不是敌人 uid
    expect(sim.skillAiming('p1')?.candidates).toEqual([]);
    expect(sim.skillAiming('p1')?.aimCells.length).toBeGreaterThan(0);
    expect(sim.skillAiming('p1')?.autoTargets).toContain('e1');
  });

  it('单体技能的可选目标都在射程内，非法目标退回自动挑选', () => {
    const units: UnitState[] = [
      unit('p1', 'shield', 'player', { x: 1, y: 1 }),
      unit('e1', 'sword', 'enemy', { x: 1, y: 0 }),
      unit('e2', 'sword', 'enemy', { x: 2, y: 2 }),
    ];
    // 盾卫的震击是邻格点杀，需要选目标
    units[0]!.battleSkill = skillDefForId('bash') ?? undefined;
    const sim = createBattleSim(units, emptyTerrain(3, 3), UNIT_DEFS, { mode: 'manual' });
    stepUntilPending(sim);

    // 敌方速度更高，会先朝我方移动，所以不能按初始坐标断言候选集，
    // 只能断言不变量：候选一定都在技能环上。
    const self = sim.getUnit('p1')!;
    const aim = sim.skillAiming('p1');
    expect(aim?.candidates.length).toBeGreaterThan(0);
    for (const uid of aim!.candidates) {
      const t = sim.getUnit(uid)!;
      expect(Math.abs(t.pos.x - self.pos.x) + Math.abs(t.pos.y - self.pos.y)).toBe(1);
    }

    // 传一个根本不存在的 uid：必须落回自动挑选，而不是打到环外或静默失败
    const step = sim.commandSkill('p1', 'no-such-unit');
    const cast = step.events.find((e) => e.type === 'skillCast');
    expect(cast).toBeDefined();
    expect(cast!.type === 'skillCast' && aim!.candidates).toContain(
      cast!.type === 'skillCast' ? cast!.hits[0]!.target : '',
    );
  });
});

/**
 * 一个「贪心玩家」：贴上去、能放技能就放、能打就打，否则待机。
 *
 * 这个 driver 存在的理由只有一个——**验证指令式状态机不会卡死**。
 * 死锁在引擎单测里看不出来（每个指令单独看都正常返回），但在真机上的表现是
 * 玩家的战斗永久冻结：既不能操作也不会推进，连输都输不掉。所以必须有一条
 * 从头打到尾的路径。
 */
function playGreedy(sim: BattleSim, maxIters = 4000): number {
  let iters = 0;
  while (!sim.isDone() && iters < maxIters) {
    iters += 1;
    const p = sim.pending();
    if (!p) {
      sim.stepTurn();
      continue;
    }
    const foes = sim.getUnits().filter((u) => u.hp > 0 && u.faction === 'enemy');
    if (p.canMove && foes.length > 0) {
      const target = foes[0]!;
      const cells = sim.legalMoveCells(p.uid);
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (const c of cells) {
        const d = Math.abs(c.x - target.pos.x) + Math.abs(c.y - target.pos.y);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      const self = sim.getUnit(p.uid)!;
      const curD = Math.abs(self.pos.x - target.pos.x) + Math.abs(self.pos.y - target.pos.y);
      if (best && bestD < curD) {
        sim.commandMove(p.uid, best);
        continue;
      }
    }
    const after = sim.pending();
    if (!after) continue;
    if (after.canSkill) {
      const aim = sim.skillAiming(after.uid);
      if (aim?.candidates[0]) sim.commandSkill(after.uid, aim.candidates[0]);
      else if (aim?.aimCells[0]) sim.commandSkill(after.uid, undefined, 'main', aim.aimCells[0]);
      else sim.commandSkill(after.uid);
      continue;
    }
    if (after.canAttack) {
      sim.commandAttack(after.uid, sim.legalAttackTargets(after.uid)[0]!);
      continue;
    }
    sim.commandWait(after.uid);
  }
  return iters;
}

describe('人工模式打完整一局', () => {
  it('贪心玩家能把战斗推到结束，不会卡死', () => {
    const sim = setupFar();
    const iters = playGreedy(sim);
    expect(sim.isDone()).toBe(true);
    expect(iters).toBeLessThan(4000);
    expect(sim.pending()).toBeNull();
  });

  it('回合上限也能收敛：双方都不出手时不会无限循环', () => {
    // 两个隔得很远、互相打不到的单位，靠 MAX_BATTLE_ROUNDS 兜底
    const units: UnitState[] = [
      unit('p1', 'shield', 'player', { x: 0, y: 0 }),
      unit('e1', 'shield', 'enemy', { x: 7, y: 7 }),
    ];
    const sim = createBattleSim(units, emptyTerrain(8, 8), UNIT_DEFS, { mode: 'manual' });
    let iters = 0;
    while (!sim.isDone() && iters < 4000) {
      iters += 1;
      const p = sim.pending();
      if (p) sim.commandWait(p.uid);
      else sim.stepTurn();
    }
    expect(sim.isDone()).toBe(true);
  });
});

describe('自动模式与跳过', () => {
  it('自动模式不产生等待，一路打到结束', () => {
    const sim = setupAdjacent('auto');
    expect(sim.pending()).toBeNull();
    const report = sim.runToEnd();
    expect(report.winner).toBeTruthy();
    expect(sim.isDone()).toBe(true);
  });

  it('人工模式中途跳过：剩下的交给 AI 打完', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    expect(sim.pending()).not.toBeNull();
    const report = sim.runToEnd();
    expect(sim.isDone()).toBe(true);
    expect(report.winner).toBeTruthy();
  });

  it('跳过时当前单位没用完的动作会被接着打完，而不是白丢', () => {
    const sim = setupAdjacent();
    stepUntilPending(sim);
    const hpBefore = sim.getUnit('e1')!.hp;
    // 玩家只走了位（这里原地不动），随即跳过 —— AI 应当替他把这一刀补上
    sim.runToEnd();
    expect(sim.getUnit('e1')!.hp).toBeLessThan(hpBefore);
  });

  it('每个单位回合都发 turnStart，供顺序条定位当前行动者', () => {
    const sim = setupAdjacent('auto');
    const events: BattleEvent[] = [];
    for (let i = 0; i < 4 && !sim.isDone(); i++) events.push(...sim.stepTurn().events);
    const starts = events.filter((e) => e.type === 'turnStart');
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.every((e) => e.type === 'turnStart' && ['player', 'enemy'].includes(e.faction)))
      .toBe(true);
  });

  it('upcomingOrder 跨回合补满，不在本回合末尾缩成一两格', () => {
    const sim = setupFar();
    stepUntilPending(sim);
    const cur = sim.pending()!.uid;
    const preview = sim.upcomingOrder(6, cur);
    expect(preview[0]).toBe(cur);
    expect(preview.length).toBe(6);
    // 两人局里预览必然反复出现双方——说明已经滚到下一回合估序
    expect(new Set(preview).size).toBe(2);
  });
});
