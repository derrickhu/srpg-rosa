import { describe, expect, it } from 'vitest';
import {
  N,
  battleStageIndices,
  report,
  simulateStage,
  stageScale,
  type SimCfg,
  BOW,
  SWORD,
  TRIO,
} from './helpers/stageSim';

const DUNGEON = 'dungeon_grassland';

/**
 * 第一章平衡回归：用真实引擎自动跑各关，模拟首通阵容
 * （1 级三初始角色 + 逐关累积精华 + Boss 战喝药），守住难度曲线：
 * 推进关高胜率 → 精英关有压力 → Boss 裸打惩罚、备药后可过。
 * 真实玩家还有集火/地形券/蛮力药剂等手段，实际体验优于此模拟。
 *
 * 模拟器本身在 `helpers/stageSim.ts`，各章共用；这里只写第一章的**设计假设**
 * （几级、带谁、攒了多少精华）和难度目标。
 *
 * ## 这一章从七关缩到四关
 *
 * 它是教学章，却曾是全游戏最长的一章（10 个节点）——玩家在最不懂的时候承受最大
 * 信息量。现在是 4 关 5 个节点，地形只有高地，临时技能只有一招（见 `stagesMvp`
 * 的投放曲线总纲）。原来的关 3「渡口之争」（河流）和关 4「骑兵突袭」（标准数值）
 * 分别挪到了第四章和第二章。
 *
 * 精英关不再单开一关：四关的形状是「两关推进 + 一关精英 + Boss」，精英就是关 3。
 *
 * 关卡下标从副本表读（`battleStageIndices`）而不是硬写 0..3：
 * 这一章曾经硬写 stageIdx 0..6，于是重排章节时那七个下标会静默指到别的章节的关卡上，
 * 而胜率测试照样能跑出一个「看起来合理」的数字。
 */
describe('第一章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);

  /**
   * 章内精华累积。斜率仍是「每两场战斗 +1」（和原来七关那条一样），
   * 但战斗少了三场，所以 Boss 关只攒到 1 点而不是原来的 3 点。
   * Boss 的面板是跟着这个数一起下调的，别只改一边。
   */
  const BONUS_BY_STAGE = [0, 0, 1, 1];
  const LEVEL = 1;

  function cfg(i: number, extra: Partial<SimCfg> = {}): SimCfg {
    const stageIdx = stages[i]!;
    return {
      stageIdx,
      // 关 1 的 maxDeploy 是 2（第一关只教移动，三个人反而看不清）
      deployIds: i === 0 ? [SWORD, BOW] : TRIO,
      level: LEVEL,
      bonusAtkEach: BONUS_BY_STAGE[i]!,
      enemyScale: stageScale(DUNGEON, stageIdx),
      ...extra,
    };
  }

  it('这一章是 4 关', () => {
    expect(stages).toHaveLength(4);
  });

  it('关 1-2 推进关：首通引导关应有高胜率', () => {
    const labels = ['关1 草原哨站', '关2 猎手小径'];
    for (const [i, label] of labels.entries()) {
      const r = simulateStage(cfg(i), N);
      report(label, r, '>=85%');
      expect(r.winRate, `${label} 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.85);
    }
  }, 60_000);

  it('关 3 精英战：有压力但可过', () => {
    const r = simulateStage(cfg(2), N);
    report('关3 精英', r, '50%~95%');
    expect(r.winRate, `关3 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.5);
    expect(r.winRate, `关3 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.95);
  }, 60_000);

  /**
   * 裸打卡**上下界**。这里曾经只卡 ≤50%，于是裸打一路掉到 2.2% 都没有变红——
   * 而 2.2% 传达的不是「不备药会吃惩罚」，是「你不可能赢」。
   * 上界防止惩罚消失，下界防止惩罚变成墙，缺一个都会被静默放过去。
   *
   * 这场仗是消耗战且带取整断点（见 `stagesMvp` 里关 4 的注释）：
   * Boss 血 2 点的差别能让胜率动 17pp，所以动完数值必须重跑，不能线性外推。
   */
  it('关 4 Boss：裸打惩罚、备药后可过，且 Boss 会放血牙咆哮', () => {
    const naked = simulateStage(cfg(3), N);
    report('关4 Boss 裸打', naked, '15%~50%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.5);
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.15);
    // 结算 id 仍是底层 savage_roar；展示名「血牙咆哮」只影响飘字/面板
    expect(naked.skillCasts['savage_roar'] ?? 0, 'Boss 应释放血牙咆哮').toBeGreaterThan(0);

    const prepared = simulateStage(cfg(3, { healPotions: 2 }), N);
    report('关4 Boss 带 2 药', prepared, '>=55%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.55);
  }, 60_000);
});
