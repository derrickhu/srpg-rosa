import { describe, expect, it } from 'vitest';
import {
  N,
  report,
  simulateStage,
  type SimCfg,
  BOW,
  SHIELD,
  SWORD,
  TRIO,
} from './helpers/stageSim';

/**
 * 第一章平衡回归：用真实引擎自动跑各关，模拟首通阵容
 * （1 级三初始角色 + 逐关累积精华 + Boss 战喝药），守住难度曲线：
 * 前期引导关高胜率 → 精英关有压力 → Boss 裸打惩罚、备药后可过。
 * 真实玩家还有集火/地形券/蛮力药剂等手段，实际体验优于此模拟。
 *
 * 模拟器本身在 `helpers/stageSim.ts`，各章共用；这里只写第一章的**设计假设**
 * （几级、带谁、攒了多少精华）和难度目标。
 */
describe('第一章难度曲线回归', () => {
  it('关 1-5：首通引导关应有高胜率', () => {
    const cfgs: (SimCfg & { label: string })[] = [
      { label: '关1', stageIdx: 0, deployIds: [SWORD, BOW], level: 1, bonusAtkEach: 0, enemyScale: 1 },
      { label: '关2', stageIdx: 1, deployIds: TRIO, level: 1, bonusAtkEach: 0, enemyScale: 1 },
      { label: '关3', stageIdx: 2, deployIds: TRIO, level: 1, bonusAtkEach: 1, enemyScale: 1 },
      { label: '关4', stageIdx: 3, deployIds: TRIO, level: 1, bonusAtkEach: 1, enemyScale: 1 },
      { label: '关5', stageIdx: 4, deployIds: TRIO, level: 1, bonusAtkEach: 2, enemyScale: 1 },
    ];
    for (const c of cfgs) {
      const r = simulateStage(c, N);
      report(c.label, r, '>=85%');
      expect(r.winRate, `${c.label} 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.85);
    }
  }, 60_000);

  it('关 6 精英战：有压力但可过', () => {
    const r = simulateStage(
      { stageIdx: 5, deployIds: TRIO, level: 1, bonusAtkEach: 2, enemyScale: 1 },
      N,
    );
    report('关6 精英', r, '50%~95%');
    expect(r.winRate, `关6 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.5);
    expect(r.winRate, `关6 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.95);
  }, 60_000);

  /**
   * 裸打卡**上下界**。这里曾经只卡 ≤50%，于是裸打一路掉到 2.2% 都没有变红——
   * 而 2.2% 传达的不是「不备药会吃惩罚」，是「你不可能赢」。
   * 上界防止惩罚消失，下界防止惩罚变成墙，缺一个都会被静默放过去。
   *
   * 这场仗是消耗战且带取整断点（见 `stagesMvp` 里 s7 的注释）：
   * Boss 血 2 点的差别能让胜率动 17pp，所以动完数值必须重跑，不能线性外推。
   */
  it('关 7 Boss：裸打惩罚、备药后可过，且 Boss 会放狂暴战吼', () => {
    const naked = simulateStage(
      { stageIdx: 6, deployIds: TRIO, level: 1, bonusAtkEach: 3, enemyScale: 1.1 },
      N,
    );
    report('关7 Boss 裸打', naked, '15%~50%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.5);
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.15);
    // 结算 id 仍是底层 savage_roar；展示名「血牙咆哮」只影响飘字/面板
    expect(naked.skillCasts['savage_roar'] ?? 0, 'Boss 应释放血牙咆哮').toBeGreaterThan(0);

    const prepared = simulateStage(
      { stageIdx: 6, deployIds: TRIO, level: 1, bonusAtkEach: 3, enemyScale: 1.1, healPotions: 2 },
      N,
    );
    report('关7 Boss 带 2 药', prepared, '>=55%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.55);
  }, 60_000);
});
