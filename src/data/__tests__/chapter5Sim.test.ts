import { describe, expect, it } from 'vitest';
import {
  N,
  battleStageIndices,
  report,
  simulateStage,
  stageScale,
  type SimCfg,
  CAVALRY,
  HEALER,
  TRIO,
} from './helpers/stageSim';

const DUNGEON = 'dungeon_dragon';

/**
 * 第五章「龙岭绝巅」平衡回归。
 *
 * 玩家状态假设 —— 刚通关第四章：
 *   按斜率这一章按 **5 级**算。第五个上阵位换成治疗（弥尔）。
 *   精华从 9 累到 12。
 */
describe('第五章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);
  const FIVE = [...TRIO, CAVALRY, HEALER];
  const BONUS_BY_STAGE = [9, 9, 10, 10, 11, 11, 12, 12];
  const LEVEL = 5;

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

  it('龙裔：明显是个台阶，但不是第二个 Boss', () => {
    const r = simulateStage(cfg(6), N);
    report('龙裔', r, '55%~90%');
    expect(r.winRate, `龙裔胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.55);
    expect(r.winRate, `龙裔胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.9);
  }, 60_000);

  it('龙王：裸打惩罚、备药后可过，且会放灭世龙息', () => {
    const naked = simulateStage(cfg(7), N);
    report('龙王 裸打', naked, '50%~80%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.8);
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.5);
    expect(naked.skillCasts['dragon_breath'] ?? 0, 'Boss 应释放灭世龙息').toBeGreaterThan(0);

    const prepared = simulateStage(cfg(7, { healPotions: 2 }), N);
    report('龙王 带 2 药', prepared, '>=85%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.85);
  }, 90_000);
});
