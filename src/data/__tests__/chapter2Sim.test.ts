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

const DUNGEON = 'dungeon_forest';

/**
 * 第二章「密林深处」平衡回归。口径与第一章一致（见 `chapter1Sim.test.ts`），
 * 这里写的是第二章自己的**设计假设**和难度目标。
 *
 * 玩家状态假设 —— 刚通关第一章、没有刷关：
 *   第一章首通的 meta 收入是 6 个战斗节点 ×2 + Boss×5 + 通关 10 = 27 灵魂，
 *   而升级价格是 `3 + 当前等级 × 2`（1→2 要 5，2→3 要 7）。三个角色全升到 2 级
 *   花 15，再把一个升到 3 级就只剩 5——所以**统一按 2 级**算，比「3 级」诚实得多。
 *   精华（`bonusAtkEach`）在章内从 3 累积到 5，沿用第一章那条 0→3 的斜率。
 *
 * 敌人回到 `UNIT_DEFS` 标准数值（第一章那批是 78 折弱化新兵），再乘副本基础缩放 1.05；
 * Boss 关额外乘节点 1.1，由 `stageScale` 从副本表读，不在这里硬写。
 *
 * 关卡下标同样从副本表读（`battleStageIndices`）而不是硬写 7..12：
 * 这一章从 5 关加到 6 关时，硬写的下标会静默错位到第三章的关卡上，
 * 而胜率测试照样能跑出一个「看起来合理」的数字。
 */
describe('第二章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);

  /** 章内精华累积：关 8-9 三点，关 10-12 四点，Boss 五点 */
  const BONUS_BY_STAGE = [3, 3, 4, 4, 4, 5];
  const LEVEL = 2;

  function cfg(i: number, extra: Partial<SimCfg> = {}): SimCfg {
    const stageIdx = stages[i]!;
    return {
      stageIdx,
      deployIds: TRIO,
      level: LEVEL,
      bonusAtkEach: BONUS_BY_STAGE[i]!,
      enemyScale: stageScale(DUNGEON, stageIdx),
      ...extra,
    };
  }

  it('这一章是 6 关', () => {
    expect(stages).toHaveLength(6);
  });

  /**
   * 推进关目标 ≥75%（实测 82%-95%）。
   *
   * 比第一章的引导关（实测清一色 99-100%）低一档是有意的：那是教操作的七关，
   * 这一章的推进关要开始要求读地形。但**不能低到卡关**——难度该住在精英关和 Boss 关，
   * 推进关如果也要重开，玩家会在同一段路上反复走，而那段路他已经会了。
   */
  it('关 8-11 推进关：要求读地形，但不卡关', () => {
    const labels = ['关8 藤蔓小径', '关9 哨塔盲角', '关10 松脂林道', '关11 涸河林隘'];
    for (const [i, label] of labels.entries()) {
      const r = simulateStage(cfg(i), N);
      report(label, r, '>=75%');
      expect(r.winRate, `${label} 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.75);
    }
  }, 120_000);

  /** 精英关目标 55%-90%（实测 ~70%，与第一章精英关的 73% 同档） */
  it('关 12 精英战：明显是个台阶，但不是第二个 Boss', () => {
    const r = simulateStage(cfg(4), N);
    report('关12 精英', r, '55%~90%');
    expect(r.winRate, `关12 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.55);
    expect(r.winRate, `关12 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.9);
  }, 60_000);

  /**
   * Boss 关：裸打惩罚（实测 ~25%）、备药后稳过（实测 ~98%）。
   *
   * 这个落差和第一章同形（那边是 1.8% / 66%），是「Boss 战要备药」这条既有设计的结果，
   * 不是这一关的问题。裸打留在两成半而不是第一章那种个位数，是因为第二章的
   * Boss 还多一层地形压力（咒火点燃脚下林地），再把裸打压到 2% 就只剩一条打法了。
   *
   * 调这一关时记住一条实测结论：**有效旋钮是敌方总血量，不是 Boss 的攻击**。
   * 把 Boss 攻击从 20 降到 18 只让胜率从 4% 动到 6.8%，因为这场仗输在消耗赛
   * （双方每局输出 355 对 403，我方总血 329 而敌方总血曾高达 531）。
   *
   * 裸打**同时卡上下界**，这是第一章的教训：那边只卡了 ≤50%，于是裸打一路掉到 1.8%
   * 都没有变红——而 1.8% 传达的不是「不备药会吃惩罚」，是「你不可能赢」。
   * 上界防止惩罚消失，下界防止惩罚变成墙，缺一个都会被静默放过去。
   */
  it('关 13 Boss：裸打惩罚、备药后可过，且会放燎原咒火', () => {
    const naked = simulateStage(cfg(5), N);
    report('关13 Boss 裸打', naked, '15%~45%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.45);
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.15);
    // 结算 id 是底层 wild_burn；展示名「燎原咒火」只影响飘字/面板
    expect(naked.skillCasts['wild_burn'] ?? 0, 'Boss 应释放燎原咒火').toBeGreaterThan(0);

    const prepared = simulateStage(cfg(5, { healPotions: 2 }), N);
    report('关13 Boss 带 2 药', prepared, '>=85%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.85);
  }, 90_000);
});
