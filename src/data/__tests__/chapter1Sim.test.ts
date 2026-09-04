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
 * （1 级三初始角色 + 逐关累积精华），守住难度曲线：
 * 推进关高胜率 → 精英关有压力。原末战「血牙酋长」在 `chapter6Sim`。
 * 真实玩家还有集火/地形券/蛮力药剂等手段，实际体验优于此模拟。
 *
 * 模拟器本身在 `helpers/stageSim.ts`，各章共用；这里只写第一章的**设计假设**
 * （几级、带谁、攒了多少精华）和难度目标。
 *
 * ## 这一章从七关缩到三关
 *
 * 它是教学章，却曾是全游戏最长的一章（10 个节点）——玩家在最不懂的时候承受最大
 * 信息量。现在是 3 关 4 个节点，打完精英即通关，地形只有高地，临时技能只有一招。
 *
 * 关卡下标从副本表读（`battleStageIndices`）而不是硬写 0..3：
 * 这一章曾经硬写 stageIdx 0..6，于是重排章节时那七个下标会静默指到别的章节的关卡上，
 * 而胜率测试照样能跑出一个「看起来合理」的数字。
 */
describe('第一章难度曲线回归', () => {
  const stages = battleStageIndices(DUNGEON);

  /** 章内精华累积。斜率仍是「每两场战斗 +1」，精英关攒到 1 点。 */
  const BONUS_BY_STAGE = [0, 0, 1];
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

  it('这一章是 3 关', () => {
    expect(stages).toHaveLength(3);
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
});
