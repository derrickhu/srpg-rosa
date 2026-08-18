import { existsSync } from 'node:fs';
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

  /**
   * 图标的两层规则（《美术风格圣经》§6.1）由这两条守着。
   *
   * 普通词条是跨技能复用的通用词汇，共用图标会让「挫锐」和「顽疾」在 26px 的列表里
   * 变成同一行；专属词条反过来必须共用徽记，一条一图的话每加一个技能就欠一张
   * 在那个尺寸上根本认不出的新图。两个方向都会在扩内容时被顺手破坏，所以钉死。
   */
  it('普通词条的图标各不相同', () => {
    const seen = new Map<string, string>();
    for (const mod of allSkillMods()) {
      if (mod.scope.kind !== 'generic') continue;
      const owner = seen.get(mod.icon);
      expect(owner, `词条「${mod.name}」和「${owner}」共用图标 ${mod.icon}`).toBeUndefined();
      seen.set(mod.icon, mod.name);
    }
  });

  it('专属词条统一用徽记，不各配图标', () => {
    for (const mod of allSkillMods()) {
      if (mod.scope.kind !== 'exclusive') continue;
      expect(mod.icon, `专属词条「${mod.name}」不该自带图标`).toBe('mod_signature');
    }
  });

  // 操作条上的按钮已经不写字了，图标掉了就只剩一圈空环，玩家没法知道哪个是待机
  it('战斗操作条的动作图标齐全', () => {
    for (const key of ['act_wait', 'act_undo', 'act_cancel']) {
      expect(UI_BUNDLE.assets[key], `动作图标 ${key} 未登记`).toBeDefined();
    }
  });

  /**
   * 登记了 key **不等于**图真的在。
   *
   * 上面那几条只看 `UI_BUNDLE.assets` 里有没有这一项，所以「在 bundle 里写了一行、
   * 但忘了把 PNG 放进 images/ui」会全绿通过，然后在真机上退成灰圆——
   * 和忘了登记完全一样的表现，却少了一道拦。加技能配图标是两步，两步都得有人盯。
   */
  it('bundle 里登记的每张图在磁盘上都存在', () => {
    for (const bundle of [UI_BUNDLE, UNIT_BUNDLE]) {
      for (const [key, path] of Object.entries(bundle.assets)) {
        expect(existsSync(path), `${key} 指向的 ${path} 不存在`).toBe(true);
      }
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
