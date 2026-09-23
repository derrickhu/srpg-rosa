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

const DUNGEON = 'dungeon_mist';

/**
 * 第七章「雾钟回廊」平衡回归。
 *
 * 刚通关祭坛：按 **6 级**、精华 12–14。推进关三人，精英 / Boss 换 5 人（治疗位）。
 * 口径与第六章相同。浓雾会挡住弓，所以早期图必须留出口，否则三人推不动。
 */
describe('第七章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);
  const FIVE = [...TRIO, CAVALRY, HEALER];
  const BONUS_BY_STAGE = [12, 12, 13, 13, 14, 14];
  const LEVEL = 6;

  function cfg(i: number, extra: Partial<SimCfg> = {}): SimCfg {
    const stageIdx = stages[i]!;
    return {
      stageIdx,
      deployIds: i >= 4 ? FIVE : TRIO,
      level: LEVEL,
      bonusAtkEach: BONUS_BY_STAGE[i]!,
      enemyScale: stageScale(DUNGEON, stageIdx),
      ...extra,
    };
  }

  it('这一章是 6 关', () => {
    expect(stages).toHaveLength(6);
  });

  it('推进关能过', () => {
    for (const i of [0, 1, 2, 3]) {
      const r = simulateStage(cfg(i), N);
      report(`推进${i + 1}`, r, '>=70%');
      expect(r.winRate, `第 ${i + 1} 关胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(
        0.7,
      );
    }
  }, 120_000);

  it('鸣钟人：台阶，不是第二个 Boss', () => {
    const r = simulateStage(cfg(4), N);
    report('鸣钟人', r, '55%~90%');
    expect(r.winRate, `精英胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.55);
    expect(r.winRate, `精英胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.9);
  }, 60_000);

  it('雾钟主：裸打惩罚、备药后可过，且会放雾钟', () => {
    const naked = simulateStage(cfg(5), N);
    report('雾钟主 裸打', naked, '25%~50%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(
      0.5,
    );
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(
      0.25,
    );
    expect(naked.skillCasts['bell_peal'] ?? 0, 'Boss 应释放雾钟').toBeGreaterThan(0);

    const prepared = simulateStage(cfg(5, { healPotions: 2 }), N);
    report('雾钟主 带 2 药', prepared, '>=70%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.7);
  }, 90_000);
});
