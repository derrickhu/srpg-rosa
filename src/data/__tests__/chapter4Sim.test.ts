import { describe, expect, it } from 'vitest';
import {
  N,
  battleStageIndices,
  report,
  simulateStage,
  stageScale,
  type SimCfg,
  CAVALRY,
  MAGE,
  TRIO,
} from './helpers/stageSim';

const DUNGEON = 'dungeon_swamp';

/**
 * 第四章「毒沼泥潭」平衡回归。
 *
 * 玩家状态假设 —— 刚通关第三章：
 *   按前三章斜率（1 / 2 / 3 级）这一章按 **4 级**算。
 *   精华沿用「每两场战斗 +1」，章内从 6 累到 9。
 *   精英 / Boss 的 `maxDeploy` 是 5，第四个是骑兵，第五个是通关草原入队的奥莉。
 */
describe('第四章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);
  const FIVE = [...TRIO, CAVALRY, MAGE];
  const BONUS_BY_STAGE = [6, 6, 7, 7, 8, 8, 9, 9];
  const LEVEL = 4;

  function cfg(i: number, extra: Partial<SimCfg> = {}): SimCfg {
    const stageIdx = stages[i]!;
    return {
      stageIdx,
      deployIds: i >= 6 ? FIVE : TRIO,
      level: LEVEL,
      bonusAtkEach: BONUS_BY_STAGE[i]!,
      enemyScale: stageScale(DUNGEON, stageIdx),
      ...extra,
    };
  }

  it('这一章是 8 关', () => {
    expect(stages).toHaveLength(8);
  });

  /** 主线新补的精英战：和猎长 / 城卫长同档 */
  it('沼语者：明显是个台阶，但不是第二个 Boss', () => {
    const r = simulateStage(cfg(6), N);
    report('沼语者', r, '55%~90%');
    expect(r.winRate, `沼语者胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.55);
    expect(r.winRate, `沼语者胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.9);
  }, 60_000);

  /**
   * Boss 按五人口径，区间对齐第三章（四人时药只值 20~30pp）。
   */
  it('沼母：裸打惩罚、备药后可过，且会放腐沼瘟息', () => {
    const naked = simulateStage(cfg(7), N);
    report('沼母 裸打', naked, '50%~80%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.8);
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.5);
    expect(naked.skillCasts['swamp_miasma'] ?? 0, 'Boss 应释放腐沼瘟息').toBeGreaterThan(0);

    const prepared = simulateStage(cfg(7, { healPotions: 2 }), N);
    report('沼母 带 2 药', prepared, '>=85%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.85);
  }, 90_000);
});
