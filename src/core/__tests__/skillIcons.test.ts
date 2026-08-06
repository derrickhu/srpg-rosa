import { describe, expect, it } from 'vitest';
import { UI_BUNDLE } from '@/core/assetBundles';
import { allPlayerSkillSpecs } from '@/data/skillCatalog';
import { allSkillMods } from '@/data/skillModCatalog';

/**
 * 三选一卡片按 `skill_${skillId}` 拼资源 key，拼不到就退成灰圆。
 * 灰圆不会报错、不会崩，只会在某个玩家某一次结算时静悄悄出现——
 * 这正是加了技能忘了配图标时最可能的结局，所以让加技能这一步直接跑红。
 */
describe('图标资源完整性', () => {
  it('每个玩家可获得的技能都有图标', () => {
    for (const spec of allPlayerSkillSpecs()) {
      expect(UI_BUNDLE.assets[`skill_${spec.id}`], `技能「${spec.name}」缺图标`).toBeDefined();
    }
  });

  it('每个词条都有图标', () => {
    for (const mod of allSkillMods()) {
      expect(UI_BUNDLE.assets[mod.icon], `词条「${mod.name}」缺图标`).toBeDefined();
    }
  });

  // 操作条上的按钮已经不写字了，图标掉了就只剩一圈空环，玩家没法知道哪个是待机
  it('战斗操作条的动作图标齐全', () => {
    for (const key of ['act_wait', 'act_undo', 'act_cancel']) {
      expect(UI_BUNDLE.assets[key], `动作图标 ${key} 未登记`).toBeDefined();
    }
  });
});
