import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { getSkillSpec } from '@/data/skillCatalog';

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
});
