import { describe, expect, it } from 'vitest';
import {
  N,
  battleStageIndices,
  report,
  simulateStage,
  stageScale,
  type SimCfg,
  TRIO,
} from './helpers/stageSim';

const DUNGEON = 'dungeon_bloodfang';

/**
 * 第六章「血牙祭坛」：原第一章末战整张挪过来。
 * 面板仍按教学章末战那套调（1 级三人 + 1 点精华），动完必须重跑，不能线性外推。
 */
describe('第六章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);

  function cfg(extra: Partial<SimCfg> = {}): SimCfg {
    const stageIdx = stages[0]!;
    return {
      stageIdx,
      deployIds: TRIO,
      level: 1,
      bonusAtkEach: 1,
      enemyScale: stageScale(DUNGEON, stageIdx),
      ...extra,
    };
  }

  it('这一章是 1 关 Boss', () => {
    expect(stages).toHaveLength(1);
  });

  /**
   * 裸打卡**上下界**。这里曾经只卡 ≤50%，于是裸打一路掉到 2.2% 都没有变红——
   * 而 2.2% 传达的不是「不备药会吃惩罚」，是「你不可能赢」。
   * 后来再削了血和咆哮叠攻，裸打会略过 50%；上界放到 60%，
   * 下界仍防它再次变成墙。
   */
  it('血牙酋长：裸打惩罚、备药后可过，且会放血牙咆哮', () => {
    const naked = simulateStage(cfg(), N);
    report('血牙酋长 裸打', naked, '15%~60%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.6);
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.15);
    expect(naked.skillCasts['savage_roar'] ?? 0, 'Boss 应释放血牙咆哮').toBeGreaterThan(0);

    const prepared = simulateStage(cfg({ healPotions: 2 }), N);
    report('血牙酋长 带 2 药', prepared, '>=55%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.55);
  }, 60_000);
});
