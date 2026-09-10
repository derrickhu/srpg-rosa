import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS, stagesHavePlayableTerrain } from '@/data/dungeonCatalog';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { allSkillSpecs, getSkillSpec, skillNeedsExistingMapTerrain } from '@/data/skillCatalog';
import { STAGES_MVP } from '@/data/stagesMvp';
import { ignitableTerrainIds } from '@/data/terrainSpec';

/**
 * 临时技能不挑职业（`rosterEligibleForTempSkill` 不做职业校验），所以池里混进
 * 一个职业专属技能，商店就会允许把剑士技能卖给弓手，买完那个技能按钮永远打不出来。
 *
 * 这条不能靠人肉复查：加章节时是复制上一章的池再改数字，专属技能会跟着复制过来。
 */
describe('副本商店池', () => {
  it('临时技能必须是通用技能，且 id 存在', () => {
    for (const d of DUNGEON_DEFS) {
      for (const row of d.roguelikePool) {
        if (row.category !== 'tempSkill') continue;
        const spec = getSkillSpec(row.skillId);
        expect(spec, `${d.id} 池里的 ${row.skillId} 不在技能表里`).toBeDefined();
        expect(
          spec!.exclusiveProfession,
          `${d.id} 池里的 ${spec!.name} 是 ${spec!.exclusiveProfession} 专属，不能当临时技能卖`,
        ).toBeNull();
      }
    }
  });

  it('每个副本都买得到药剂：Boss 前的补给点必须能补续航', () => {
    for (const d of DUNGEON_DEFS) {
      expect(d.roguelikePool.some((r) => r.category === 'potion'), d.id).toBe(true);
    }
  });

  /**
   * 补给点插在每两场战斗之后，首店手上就是刚打完的两笔金币。
   * 三件最便宜的还买得齐，玩家就不会选，每次清空货架就行。
   */
  it('首店金币买不齐三件最便宜的货', () => {
    for (const d of DUNGEON_DEFS) {
      const shopAt = d.nodes.findIndex((n) => n.kind === 'shop');
      if (shopAt < 0 || d.roguelikePool.length < 3) continue;
      const gold = d.nodes.slice(0, shopAt).reduce((sum, n) => {
        if (n.stageIndex === undefined) return sum;
        return sum + (STAGES_MVP[n.stageIndex]?.goldReward ?? 0);
      }, 0);
      const prices = d.roguelikePool.map((row) => {
        if (row.category === 'tempSkill') {
          return row.price ?? getSkillSpec(row.skillId)?.shopPrice ?? 7;
        }
        return row.price;
      }).sort((a, b) => a - b);
      const trio = prices[0]! + prices[1]! + prices[2]!;
      expect(
        trio,
        `${d.name} 最便宜三件 ${trio} ≤ 首店金币 ${gold}，会清空货架`,
      ).toBeGreaterThan(gold);
    }
  });

  /**
   * Boss 招式不能出现在商店里。
   *
   * 敌方专属技能（`SkillSpec.enemyOnly`）是给 Boss 施压用的，卖给玩家就等于把
   * 一场 Boss 战的压力手段变成一次数值升级。加章节时是复制上一章的池再改 id，
   * 手一滑填成 `wild_burn` 不会报错——商店会正常卖，玩家会正常买，然后拿着
   * Boss 的招去打后面的关。
   */
  it('敌方专属技能不进任何商店池', () => {
    for (const d of DUNGEON_DEFS) {
      for (const row of d.roguelikePool) {
        if (row.category !== 'tempSkill') continue;
        const spec = getSkillSpec(row.skillId)!;
        expect(
          spec.enemyOnly,
          `${d.id} 池里的 ${spec.name} 是敌方专属技能，不该卖给玩家`,
        ).toBeUndefined();
      }
    }
  });

  /**
   * 火把跟滑动窗口走进要塞，就是 6 点贴身伤——那一章没有可烧的林子。
   * 边角两棵树、先买森林券再烧，都不算「这一章的题目」。
   */
  it('改已有地形的招只在那种地形真能玩的章节出售', () => {
    expect(ignitableTerrainIds().length, '没有可燃地形，这条断言就形同虚设').toBeGreaterThan(0);

    const forest = DUNGEON_DEFS.find((d) => d.id === 'dungeon_forest');
    const fortress = DUNGEON_DEFS.find((d) => d.id === 'dungeon_fortress');
    expect(forest, '密林副本不存在').toBeDefined();
    expect(fortress, '要塞副本不存在').toBeDefined();
    const forestSkills = forest!.roguelikePool.filter((r) => r.category === 'tempSkill').map((r) => r.skillId);
    const fortressSkills = fortress!.roguelikePool.filter((r) => r.category === 'tempSkill').map((r) => r.skillId);
    expect(forestSkills, '密林是火把的主场').toContain('temp_fo_torch');
    expect(fortressSkills, '要塞没有可燃林子，火把不该跟窗过来').not.toContain('temp_fo_torch');
    expect(fortressSkills, '绞缠不绑地形，滑动窗口该留下').toContain('temp_fo_thorn');

    for (const d of DUNGEON_DEFS) {
      const stageIndices = d.nodes
        .filter((n) => n.stageIndex !== undefined)
        .map((n) => n.stageIndex!);
      for (const row of d.roguelikePool) {
        if (row.category !== 'tempSkill') continue;
        const spec = getSkillSpec(row.skillId)!;
        const needs = skillNeedsExistingMapTerrain(spec);
        if (needs.length === 0) continue;
        expect(
          needs.some((t) => stagesHavePlayableTerrain(stageIndices, t)),
          `${d.name} 在卖 ${spec.name}，但这一章没有够用的 ${needs.join('/')}`,
        ).toBe(true);
      }
    }
  });

  it('敌方专属技能不会是任何角色的招牌技能', () => {
    const enemyOnly = new Set(allSkillSpecs().filter((s) => s.enemyOnly).map((s) => s.id));
    expect(enemyOnly.size, '一个敌方专属技能都没有，这条断言就形同虚设').toBeGreaterThan(0);
    for (const c of CHARACTER_DEFS) {
      expect(
        enemyOnly.has(c.defaultSkillId),
        `${c.name} 的招牌技能 ${c.defaultSkillId} 是敌方专属技能`,
      ).toBe(false);
    }
  });
});
