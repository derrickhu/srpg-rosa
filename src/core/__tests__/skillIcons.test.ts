import { describe, expect, it } from 'vitest';
import { UI_BUNDLE, UNIT_BUNDLE } from '@/core/assetBundles';
import { ENEMY_SKILL_SKINS } from '@/data/enemySkillCatalog';
import { allPlayerSkillSpecs } from '@/data/skillCatalog';
import { allSkillMods } from '@/data/skillModCatalog';
import { STAGES_MVP } from '@/data/stagesMvp';

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

  it('每个敌方技能皮肤都有图标', () => {
    for (const skin of Object.values(ENEMY_SKILL_SKINS)) {
      expect(
        UI_BUNDLE.assets[skin.iconKey],
        `敌方技能「${skin.name}」缺图标 ${skin.iconKey}`,
      ).toBeDefined();
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

  // 布阵预览走 createUnitToken(animSet ?? defId)；缺 token 只会退成阵营色圆，
  // 战斗里却有动画图集——精英/Boss 就会「布阵看不见、开打才出现」。
  it('关卡用到的单位外观都有静态 token', () => {
    const keys = new Set<string>();
    for (const stage of STAGES_MVP) {
      for (const e of stage.enemies) keys.add(e.animSet ?? e.defId);
    }
    for (const key of keys) {
      expect(UNIT_BUNDLE.assets[key], `单位外观「${key}」缺 images/units token`).toBeDefined();
    }
  });
});
