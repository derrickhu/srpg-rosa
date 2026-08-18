import { describe, expect, it } from 'vitest';
import {
  N,
  battleStageIndices,
  report,
  simulateStage,
  stageScale,
  type SimCfg,
  CAVALRY,
  TRIO,
} from './helpers/stageSim';

const DUNGEON = 'dungeon_fortress';

/**
 * 第三章「要塞攻防」平衡回归。口径与前两章一致（见 `chapter1Sim.test.ts`），
 * 这里写的是第三章自己的**设计假设**和难度目标。
 *
 * 玩家状态假设 —— 刚通关第二章：
 *   按前两章那条斜率（第一章 1 级、第二章 2 级）继续走，这一章按 **3 级**算。
 *   精华（`bonusAtkEach`）在章内从 5 累积到 7。
 *
 * 上阵人数按关卡自己的 `maxDeploy` 给，不再一律三人：
 *   推进关没写 `maxDeploy`，走 `DeployManager` 的默认 3 人；
 *   精英关和 Boss 关写了 4，所以这里也给 4 人（第四个是骑兵）。
 *   前两章的模拟一律用三人，那在 Boss 关是**低估**了玩家（那关也允许 4 人），
 *   于是那条胜率其实偏保守。这一章按关卡实际允许的人数给，量出来的才是真实下限。
 *
 * 敌人是 `UNIT_DEFS` 标准数值的守军，再乘副本基础缩放 1.12；
 * Boss 关额外乘节点 1.1，由 `stageScale` 从副本表读。
 */
describe('第三章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);

  const BONUS_BY_STAGE = [5, 5, 6, 6, 6, 7];
  const LEVEL = 3;
  const QUARTET = [...TRIO, CAVALRY];

  function cfg(i: number, extra: Partial<SimCfg> = {}): SimCfg {
    const stageIdx = stages[i]!;
    return {
      stageIdx,
      // 精英（下标 4）和 Boss（下标 5）关的 maxDeploy 是 4
      deployIds: i >= 4 ? QUARTET : TRIO,
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
   * 推进关目标 ≥75%，同第二章。
   *
   * 这一章的推进关多了一层「要不要开闸门」的决定，但**自动模式测不到这个决定**
   * ——AI 不会去站机关（见 `terrainSpec` 的机关契约）。所以这四条量的是
   * 「玩家完全不用机关、硬着头皮绕路打」的下限。人工用好机关应当明显高于此。
   */
  it('关 14-17 推进关：不用机关硬打也不该卡关', () => {
    const labels = ['关14 闸门机关', '关15 瓮城窄道', '关16 放闸', '关17 双门齐落'];
    for (const [i, label] of labels.entries()) {
      const r = simulateStage(cfg(i), N);
      report(label, r, '>=75%');
      expect(r.winRate, `${label} 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.75);
    }
  }, 120_000);

  /** 精英关目标 55%-90%，同第二章 */
  it('关 18 精英战：明显是个台阶，但不是第二个 Boss', () => {
    const r = simulateStage(cfg(4), N);
    report('关18 精英', r, '55%~90%');
    expect(r.winRate, `关18 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.55);
    expect(r.winRate, `关18 胜率 ${(r.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.9);
  }, 60_000);

  /**
   * Boss 关：裸打卡**上下界** 50%~80%，备药 ≥85%。
   *
   * 下界是第一章那个 bug 留下的规矩：只卡上界的话，裸打掉到「你不可能赢」
   * 也不会变红（第一章曾掉到 2.2%）。
   *
   * ## 为什么这里的区间不是前两章的 15%~45%
   *
   * 前两章的 Boss 断言是按**三人**量的，而那两关的 `maxDeploy` 也是 4——
   * 换成四人重量一遍，一章 78.0%、二章 91.3%（每格 300 局）。也就是说
   * 「Boss 是一道墙」只在三人口径下成立，实战里玩家满编平推。
   *
   * 这一章按关卡实际允许的四人标定，所以区间必须重设：四人时**两瓶药的边际价值
   * 恒定在 20~30pp**（扫过 8 组 Boss 数值，攻 22→31、血 190→330），
   * 凑不出「裸打 25% / 带药 90%」需要的 65pp 落差——那个目标在四人口径下不可达，
   * 不是数值没调对。真正值 65pp 的准备轴是**第四个上阵位**，不是药。
   *
   * 整套口径统一（外加等级、后续角色、技能池带来的强度）留作待办，
   * 见 `docs/玩法重设计.md`；那件事要等角色和技能扩完，靠实机验证一起做，
   * 现在把八章都按未定的尺子返工一遍是白费。
   */
  it('关 19 Boss：裸打惩罚、备药后可过，且会放破阵冲撞', () => {
    const naked = simulateStage(cfg(5), N);
    report('关19 Boss 裸打', naked, '50%~80%');
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.8);
    expect(naked.winRate, `Boss 裸打胜率 ${(naked.winRate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.5);
    // 结算 id 是底层 warlord_breach；展示名「破阵冲撞」只影响飘字/面板
    expect(naked.skillCasts['warlord_breach'] ?? 0, 'Boss 应释放破阵冲撞').toBeGreaterThan(0);

    const prepared = simulateStage(cfg(5, { healPotions: 2 }), N);
    report('关19 Boss 带 2 药', prepared, '>=85%');
    expect(
      prepared.winRate,
      `Boss 带 2 药胜率 ${(prepared.winRate * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.85);
  }, 90_000);
});
