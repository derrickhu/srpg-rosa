import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { allSkillSpecs, getSkillSpec } from '@/data/skillCatalog';
import { STAGES_MVP } from '@/data/stagesMvp';

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
