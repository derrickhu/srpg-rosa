import { describe, expect, it } from 'vitest';
import type { UnitKind } from '@/battle/types';
import { allPlayerSkillSpecs, defaultSkillId } from '@/data/skillCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import { ENEMY_SKILL_SKINS, resolveEnemyBattleSkill } from '@/data/enemySkillCatalog';
import { STAGES_MVP } from '@/data/stagesMvp';
import {
  ATTACK_VFX,
  CHARGE_VFX,
  FLOE_ATTACK_VFX,
  FROST_HIT_VFX,
  MOOK_ATTACK_VFX,
  POISON_HIT_VFX,
  SKILL_VFX,
  attackRecipeFor,
  recipeAnimSets,
  usesMookCombatVfx,
  vfxSetsForKinds,
  type FlashDef,
  type VfxRecipe,
} from '@/data/vfxCatalog';
import { getAnimManifest } from '@/view/animSets';
import { UNIT_HEIGHT_CELLS } from '@/view/AnimatedUnit';
import { FX_BUNDLE } from '@/core/assetBundles';

const KINDS = Object.keys(UNIT_DEFS) as UnitKind[];

function allRecipes(): Array<[string, VfxRecipe]> {
  return [
    ...Object.entries(ATTACK_VFX).map(([k, v]): [string, VfxRecipe] => [`普攻:${k}`, v]),
    ...Object.entries(MOOK_ATTACK_VFX).map(([k, v]): [string, VfxRecipe] => [`杂兵普攻:${k}`, v]),
    ...Object.entries(SKILL_VFX).map(([k, v]): [string, VfxRecipe] => [`技能:${k}`, v]),
    ['冲锋', CHARGE_VFX],
    ['普攻:floe', FLOE_ATTACK_VFX],
  ];
}

function allFlashes(recipe: VfxRecipe): FlashDef[] {
  return [recipe.cast, recipe.impact].filter((x): x is FlashDef => Boolean(x));
}

/**
 * 特效的失效方式是**静默降级**：图集没注册、动画名对不上、忘了标 add、
 * 远程配方丢掉飞行段，结果都是「这一招退回了别人的特效」或者「敌人自己爆了」。
 * 游戏照样能玩，测试照样全绿，只有玩家看得见。所以这些契约必须在这里钉住。
 */
describe('特效登记表', () => {
  it('每段闪光都有对应图集清单，且动画名与集合 id 同名', () => {
    for (const [label, recipe] of allRecipes()) {
      for (const flash of allFlashes(recipe)) {
        const m = getAnimManifest(flash.set);
        expect(m, `${label} 的图集 ${flash.set} 没在 animSets 注册`).not.toBeNull();
        expect(
          m!.animations[flash.set],
          `${flash.set} 的清单里没有叫 ${flash.set} 的动画`,
        ).toBeDefined();
        expect(m!.animations[flash.set]!.frames.length).toBeGreaterThan(0);
        expect(m!.animations[flash.set]!.loop, `${flash.set} 是一次性特效，不能 loop`).toBe(false);
        // 混合方式必须**声明**，但不再强制 `add`。
        //
        // 这条原先写死成 `toBe('add')`，隐含「特效都是光」。它拦住的是真问题
        // （黑底图走普通混合会在屏幕上变成黑方块），但把一整类零件判成了违规：
        // 藤蔓、树皮、根须、蜜蜂、铁钩都是**物质**，不发光。
        // 而 additive 管线按亮度烘 alpha，暗部一律变透明，所以走 additive 的素材
        // 只有亮部能显示——深色实体在这条路上根本画不出来。
        // 真正要守的不是「必须是 add」，是「在草地上看得见」，那条守卫在
        // `src/view/__tests__/vfxGrassContrast.test.ts`，它直接量像素。
        expect(['add', 'normal'], `${label}/${flash.set} 的 blend 没声明`).toContain(m!.blend);
      }
      if (recipe.travel?.beamSet) {
        const m = getAnimManifest(recipe.travel.beamSet);
        expect(m, `${label} 的拖尾光束 ${recipe.travel.beamSet} 没注册`).not.toBeNull();
        expect(m!.blend).toBe('add');
      }
      if (recipe.travel?.glowSet) {
        const m = getAnimManifest(recipe.travel.glowSet);
        expect(m, `${label} 的发光弹体 ${recipe.travel.glowSet} 没注册`).not.toBeNull();
        expect(m!.blend).toBe('add');
      }
      if (recipe.slashSweep?.set) {
        expect(getAnimManifest(recipe.slashSweep.set), `${label} 扫斩图 ${recipe.slashSweep.set} 没注册`).not.toBeNull();
      }
      if (recipe.pathBeam?.set) {
        expect(getAnimManifest(recipe.pathBeam.set), `${label} 路径图 ${recipe.pathBeam.set} 没注册`).not.toBeNull();
      }
    }
  });

  it('飞行弹体的抠图素材都在 FX_BUNDLE 里', () => {
    for (const [label, recipe] of allRecipes()) {
      const sprite = recipe.travel?.sprite;
      if (!sprite) continue;
      expect(
        FX_BUNDLE.assets[sprite],
        `${label} 的弹体 ${sprite} 没进 FX_BUNDLE`,
      ).toBeDefined();
    }
  });

  it('实体道具特效的抠图都在 FX_BUNDLE 里', () => {
    for (const [label, recipe] of allRecipes()) {
      const sprite = recipe.propBurst?.sprite;
      if (!sprite) continue;
      expect(
        FX_BUNDLE.assets[sprite],
        `${label} 的道具 ${sprite} 没进 FX_BUNDLE`,
      ).toBeDefined();
    }
  });

  it('各职业的普攻和默认技能都有专属配方', () => {
    for (const k of KINDS) {
      expect(ATTACK_VFX[k], `${k} 没有普攻特效`).toBeDefined();
      const skillId = defaultSkillId(k);
      const covered = skillId in SKILL_VFX || skillId === 'charge';
      expect(covered, `${k} 的默认技能 ${skillId} 没有特效`).toBe(true);
    }
  });

  /**
   * 上面那条只查「各职业的默认技能」，于是漏了一整类：
   * 商店卖的临时技能和可学但非默认的技能没人管，`war_shout` 和 8 个
   * `temp_fo_*` / `temp_ft_*` 就这么一直躺在静态贴图上——玩家花钱买到手，
   * 放出来只是一张不动的图，而测试全绿。
   *
   * 所以守卫要按「玩家**拿得到**的每一招」来，不是按「谁是默认技能」。
   * `allPlayerSkillSpecs()` 正好是这个集合（排掉 enemyOnly；`reserved` 只管主槽
   * 可学列表，那些招照样在商店卖，所以必须算进来）。
   */
  it('玩家拿得到的每一招都有配方，含商店临时技能', () => {
    const missing: string[] = [];
    for (const spec of allPlayerSkillSpecs()) {
      // 冲锋走 CHARGE_VFX，不在 SKILL_VFX 里
      if (spec.id === 'charge') continue;
      const recipe = SKILL_VFX[spec.id];
      if (!recipe) {
        missing.push(`${spec.id}(${spec.name})`);
        continue;
      }
      // 有配方不等于看得见：全空的配方和没有配方表现一样
      const hasVisual = Boolean(
        recipe.impact ||
          recipe.cast ||
          recipe.travel ||
          recipe.propBurst ||
          recipe.slashSweep ||
          recipe.pathBeam ||
          recipe.castBurst,
      );
      if (!hasVisual) missing.push(`${spec.id}(${spec.name}) 配方是空的`);
    }
    expect(missing, `这些技能会退回静态贴图：${missing.join('、')}`).toEqual([]);
  });

  /**
   * 上面那条走 `allPlayerSkillSpecs()`，按定义排掉了 `enemyOnly`。敌方技能因此完全没人管，
   * 而它们的失效方式和玩家技能一样：没配方就退回 `displayKind` 的静态贴图，
   * 一整只怪的招式变成一张不动的图。Boss 招式漏了会有人发现，杂兵招式漏了不会。
   *
   * 覆盖两条挂法：`skillSkin`（皮肤，查 `vfxId`）和裸挂 `skillId`（查 id 本身）。
   * 两条的查找键都取自 `resolveEnemyBattleSkill`，和运行时同一个口径。
   */
  it('关卡里每个敌方技能都有配方，皮肤和裸挂都算', () => {
    const keys = new Map<string, string>();
    for (const stage of STAGES_MVP) {
      for (const e of stage.enemies) {
        const resolved = resolveEnemyBattleSkill({
          skillSkin: e.skillSkin,
          skillId: e.skillId,
        });
        if (resolved) keys.set(resolved.vfxId ?? resolved.id, e.name ?? e.defId);
      }
    }
    expect(keys.size, '一个都没有，说明取字段的路径变了').toBeGreaterThan(0);
    const missing: string[] = [];
    for (const [key, owner] of keys) if (!SKILL_VFX[key]) missing.push(`${key}(${owner})`);
    expect(missing, `这些敌方技能会退回静态贴图：${missing.join('、')}`).toEqual([]);
  });

  it('远程配方必须有发出去的光轨，不能只靠弹体小图', () => {
    const ranged = [
      ['普攻:bow', ATTACK_VFX.bow],
      ['普攻:mage', ATTACK_VFX.mage],
      ['普攻:healer', ATTACK_VFX.healer],
      ['技能:pierce', SKILL_VFX.pierce],
      ['技能:ember', SKILL_VFX.ember],
    ] as const;
    for (const [label, recipe] of ranged) {
      expect(recipe.travel, `${label} 丢了飞行段`).toBeDefined();
      const hasBody = Boolean(recipe.travel!.glowSet || recipe.travel!.sprite || recipe.travel!.beamSet);
      expect(hasBody, `${label} 飞行段没有生图弹体/光束`).toBe(true);
      expect(recipe.travel!.speedPxPerSec, `${label} 飞太快`).toBeLessThanOrEqual(420);
      expect(recipe.impact?.set, `${label} 命中要用生图，不要只靠几何星爆`).toBeTruthy();
    }
  });

  it('近战普攻必须有扫斩或短路径，而且要挂生图', () => {
    // 挥砍必须挂**逐帧**图集。单张剑的抠图沿弧线钉一路做不出挥砍：
    // 挥砍的信息量在刀身角度的变化里，钉静态图的结果是一把剑绕着角色打转
    expect(ATTACK_VFX.sword.slashSweep?.set, '剑士挥砍没有逐帧刀影').toBe('sword_swing');
    expect(ATTACK_VFX.cavalry.pathBeam?.set, '骑兵路径没有突刺生图').toBe('thrust');
    expect(ATTACK_VFX.shield.impact?.set, '盾卫普攻没有砸击生图').toBe('bash_hit');
    expect(SKILL_VFX.whirl!.impact?.set, '旋风斩没有绕身刃环的生图').toBe('whirl');
    expect(SKILL_VFX.heal_touch!.pathBeam?.set, '圣疗光路没有生图').toBe('heal_flash');
    expect(SKILL_VFX.ward_prayer!.pathBeam?.set, '守护祷言光路没有生图').toBe('ward_aegis');
    // 火球走发光序列帧，不叠抠图：那张抠图有近三分之一的不透明像素是画进去的
    // 漫画黑描边，而且单张静态图平移起来是僵的
    expect(ATTACK_VFX.mage.travel?.sprite, '火球不该再叠抠图弹体').toBeUndefined();
    expect(ATTACK_VFX.mage.travel?.glowSet, '法师普攻没有火球发光图').toBe('ember_orb');
    // 命中闪光不能拿**弹体**素材充当：弹体有朝向、飞行段按射向转过，而命中段
    // `mode: 'burst'` 把朝向钉成 0，斜射的那一发一命中焰尾就从斜角掰成水平，
    // 屏幕上就是「火球打到人身上拐了个弯」
    expect(ATTACK_VFX.mage.impact?.set, '法师普攻命中不能拿弹体图充当，会拐弯').toBe(
      'ember_splat',
    );
    expect(FLOE_ATTACK_VFX.travel?.glowSet, '芙洛普攻没有冰弹发光图').toBe('frost_orb');
    expect(FLOE_ATTACK_VFX.impact?.set, '芙洛普攻命中不能拿弹体图充当').toBe('frost_splat');
    expect(SKILL_VFX.frost_ring!.impact?.set, '霜环命中应是冰棱环').toBe('frost_ring');
    expect(SKILL_VFX.ember!.impact?.set, '炎弹技能命中应是爆炸').toBe('ember_burst');
    expect(SKILL_VFX.ember_bloom!.travel?.glowSet, '爆炎还是那颗火球飞过去').toBe('ember_orb');
    expect(SKILL_VFX.ember_bloom!.impact?.set, '爆炎命中应复用炎环').toBe('flame_ring');
  });

  it('弓手三招各有自己的箭，不共用一张图', () => {
    // 弹体在屏幕上停留的时间比命中闪光长得多，所以「三招同一支箭、只换命中闪光」
    // 玩家看到的其实是同一支箭飞了三次
    const arrows = [
      ATTACK_VFX.bow.travel?.sprite,
      SKILL_VFX.pierce!.travel?.sprite,
      SKILL_VFX.snap!.travel?.sprite,
    ];
    expect(arrows.every(Boolean), '弓手有招没配弹体').toBe(true);
    expect(new Set(arrows).size, `弓手三招共用了箭：${arrows.join(', ')}`).toBe(3);
  });

  it('远程普攻必须有飞行段——没有飞行段就只是「敌人身上闪一下」', () => {
    expect(ATTACK_VFX.bow.travel, '弓手普攻丢了飞行段').toBeDefined();
    expect(ATTACK_VFX.bow.travel!.sprite).toBe('proj_arrow_wood');
    expect(ATTACK_VFX.bow.impact, '弓手普攻丢了命中闪光').toBeDefined();
    expect(ATTACK_VFX.mage.travel, '法师普攻丢了飞行段').toBeDefined();
    expect(ATTACK_VFX.healer.travel, '祭司普攻丢了飞行段').toBeDefined();

    expect(SKILL_VFX.pierce!.travel, '穿透箭丢了飞行段').toBeDefined();
    expect(SKILL_VFX.pierce!.impactPerHit, '穿透箭应按途经依次结算').toBe(true);
    // 穿透和普攻的视觉差就在这条尾迹
    expect(SKILL_VFX.pierce!.travel!.beamSet).toBe('pierce');
    expect(SKILL_VFX.pierce!.impact!.set, '穿透命中不要复用普攻箭星').toBe('pierce');
    // 火球和圣击同口径：本身就是光的东西不要再叠抠图实体
    expect(ATTACK_VFX.mage.travel!.sprite, '火球不是实体道具').toBeUndefined();
    expect(ATTACK_VFX.mage.travel!.glowSet, '火球要发光序列帧，否则草地上看不清').toBe('ember_orb');
    expect(SKILL_VFX.ember!.travel!.sprite, '炎弹也不叠抠图实体').toBeUndefined();
    expect(SKILL_VFX.ember!.travel!.glowSet).toBe('ember_orb');
    expect(SKILL_VFX.ember!.impact!.set).toBe('ember_burst');
    expect(ATTACK_VFX.healer.travel!.sprite, '圣击不是实体徽章').toBeUndefined();
    expect(ATTACK_VFX.healer.travel!.glowSet).toBe('holy_orb');
    expect(ATTACK_VFX.healer.travel!.beamSet, '圣击应有闪电路径').toBe('holy_bolt');
    expect(SKILL_VFX.heal_touch!.impact!.set).toBe('heal_flash');
    expect(SKILL_VFX.ward_prayer!.impact!.set).toBe('ward_aegis');
    expect(SKILL_VFX.field_bless!.impact!.set).toBe('bless_rays');
  });

  it('命中闪光不能拿弹体素材充当——弹体有朝向，炸开没有', () => {
    // 法师普攻曾经拿 `ember_orb`（火球弹体本身）当命中闪光：飞行段按射向转过，
    // 命中段 `mode: 'burst'` 却把朝向钉成 0，斜射的那一发一命中焰尾就从斜角
    // 掰成水平，玩家看到的是「火球打到人身上拐了个弯」。
    // 换 `mode: 'aimed'` 只能遮住症状——有朝向的素材当命中闪光用本身就是错的。
    const projArt = new Set<string>();
    for (const r of [
      ...Object.values(ATTACK_VFX),
      ...Object.values(MOOK_ATTACK_VFX),
      ...Object.values(SKILL_VFX),
      FLOE_ATTACK_VFX,
    ]) {
      if (r?.travel?.glowSet) projArt.add(r.travel.glowSet);
    }
    for (const [id, r] of [
      ...Object.entries(ATTACK_VFX),
      ...Object.entries(MOOK_ATTACK_VFX),
      ...Object.entries(SKILL_VFX),
      ['floe', FLOE_ATTACK_VFX],
    ] as [string, (typeof ATTACK_VFX)[keyof typeof ATTACK_VFX] | undefined][]) {
      const set = r?.impact?.set;
      if (!set) continue;
      expect(projArt.has(set), `${id} 拿弹体图 ${set} 当命中闪光，命中时会拐个弯`).toBe(false);
    }
  });

  it('副本临时技能不许穿角色技能的皮', () => {
    /**
     * 临时技能是**每章的招牌**：玩家花钱买、每章换一批，它们是「这一章不一样」
     * 最直接的兑现。而它们原先几乎全在复用角色技能的图集——
     * 松脂火把放出来是法师的炎环、压制号令是狂暴战吼、攻城战旗是祭司的战场祝福、
     * 飞爪钩索是骑兵走路时的光环。名字全新，屏幕上全是旧招。
     *
     * 这是我自己定的口径造成的：当时写着「临时技能是功能牌不是招牌大招，
     * 美术预算该低于角色技能，靠色相 + 锚点和原主人分开」。
     * 那条口径有两个问题。一是**形状永远比色相先被认出来**，靠换色相分不开；
     * 二是它把因果搞反了——临时技能恰恰是章节的卖点，预算该往这儿倾斜。
     *
     * 所以钉成契约：临时技能的命中/弹体图集，不许出现在任何**非**临时技能的配方里。
     * 反过来不查——角色技能之间共用的问题由另外两条守卫管。
     */
    const tempIds = Object.keys(SKILL_VFX).filter((id) => id.startsWith('temp_'));
    expect(tempIds.length, '临时技能配方一个都没找到，选择器写错了').toBeGreaterThan(8);

    // 非临时技能（含普攻）用掉的所有图集
    const ownedByCharacters = new Set<string>();
    for (const [id, r] of Object.entries(SKILL_VFX)) {
      if (id.startsWith('temp_') || !r) continue;
      for (const s of [r.impact?.set, r.travel?.glowSet, r.travel?.spriteSet]) {
        if (s) ownedByCharacters.add(s);
      }
    }
    for (const r of Object.values(ATTACK_VFX)) {
      for (const s of [r?.impact?.set, r?.travel?.glowSet, r?.travel?.spriteSet]) {
        if (s) ownedByCharacters.add(s);
      }
    }

    for (const id of tempIds) {
      const r = SKILL_VFX[id]!;
      for (const s of [r.impact?.set, r.travel?.glowSet, r.travel?.spriteSet]) {
        if (!s) continue;
        expect(
          ownedByCharacters.has(s),
          `${id} 用的 ${s} 是角色技能的图，临时技能是每章的招牌，不该穿别人的皮`,
        ).toBe(false);
      }
    }

    // 每一招都得真有东西显示。原先有八招连配方都没有，
    // 买到手放出来只有 displayKind 的静态贴图
    for (const id of tempIds) {
      const r = SKILL_VFX[id]!;
      const hasArt = Boolean(r.impact?.set || r.travel || r.propBurst);
      expect(hasArt, `${id} 没有任何主体部件，屏幕上看不出放了什么`).toBe(true);
    }
  });

  it('同一章的临时技能之间也要分得开', () => {
    // 抓的是这一轮最糟的一处：树皮庇护和守林人之姿**共用同一张** `ward_aegis`，
    // 也就是说同一章里相邻的两张牌连彼此都没分开（还顺带和祭司的守护祷言撞了）。
    // 章内撞车比跨章撞车更致命——玩家是在同一个商店里比较这几张牌的。
    const byChapter = new Map<string, Map<string, string[]>>();
    for (const [id, r] of Object.entries(SKILL_VFX)) {
      if (!id.startsWith('temp_') || !r) continue;
      const chapter = id.slice(0, 'temp_xx'.length); // temp_gl / temp_fo / temp_ft
      const seen = byChapter.get(chapter) ?? new Map<string, string[]>();
      for (const s of [r.impact?.set, r.travel?.glowSet, r.travel?.spriteSet, r.propBurst?.sprite]) {
        if (s) seen.set(s, [...(seen.get(s) ?? []), id]);
      }
      byChapter.set(chapter, seen);
    }
    for (const [chapter, seen] of byChapter) {
      for (const [art, users] of seen) {
        expect(users.length, `${chapter} 的 ${users.join(' / ')} 共用了 ${art}`).toBe(1);
      }
    }
  });

  it('弹体大小以角色身高为尺，箭不能比人还大', () => {
    // 尺子是**角色身高**（UNIT_HEIGHT_CELLS = 0.92 格），不是格子——格子里站着人，
    // 玩家判断「这东西多大」用的参照物是人。破甲重箭曾经写 2.1 格，出屏是角色身高的
    // 2.3 倍，屏幕上是一支投枪飞过去。
    //
    // 上限只对**箭**收紧。试过给「所有实体抠图弹」定一个上限，结果一路打补丁：
    // 蜂群（`swarm_bees`）画的是一簇虫而不是手持物，虫云比人宽是对的；
    // 撞城槌（`prop_ram`）是要几个人合抬的攻城器械，比人长也是对的。
    // 一个统一上限要靠豁免名单才立得住，那它就不是一条契约了。箭不一样：
    // 箭的长度有硬参照（战箭约 0.9m，人 1.7m），说得出「不能比人大」。
    const arrows: [string, number][] = [
      ['普攻木箭', ATTACK_VFX.bow.travel!.cells],
      ['穿透重箭', SKILL_VFX.pierce!.travel!.cells],
      ['速射轻箭', SKILL_VFX.snap!.travel!.cells],
    ];
    for (const [name, cells] of arrows) {
      const bodies = cells / UNIT_HEIGHT_CELLS;
      expect(bodies, `${name}是角色身高的 ${bodies.toFixed(2)} 倍，比人还大`).toBeLessThan(1.3);
    }
    // 三支箭的长短次序也钉住：普攻最朴素，速射最短，穿透最长
    expect(SKILL_VFX.snap!.travel!.cells, '速射箭该是最短的').toBeLessThan(
      ATTACK_VFX.bow.travel!.cells,
    );
    expect(SKILL_VFX.pierce!.travel!.cells, '穿透重箭该是最长的').toBeGreaterThan(
      ATTACK_VFX.bow.travel!.cells,
    );

    // 下限对所有弹体生效：渲染侧的出屏下限是 0.5 格，写得比它还小等于这个数字不生效。
    // 从前那个下限是**绝对像素**（56px），而格子最大只有 56px，于是所有小于 1 格的
    // 配方值都被静默顶回 1 格——速射箭那句「0.95 格，全表最短」从来没生效过。
    for (const [id, r] of [
      ...Object.entries(ATTACK_VFX),
      ...Object.entries(MOOK_ATTACK_VFX),
      ...Object.entries(SKILL_VFX),
      ['floe', FLOE_ATTACK_VFX],
    ] as [string, (typeof ATTACK_VFX)[keyof typeof ATTACK_VFX] | undefined][]) {
      const cells = r?.travel?.cells;
      if (cells === undefined) continue;
      expect(cells, `${id} 的弹体小于渲染下限 0.5 格，写多小都一样`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('中毒叠层是独立图集，不穿杂兵喷雾的皮', () => {
    expect(POISON_HIT_VFX.set).toBe('poison_burst');
    expect(POISON_HIT_VFX.anchor).toBe('target');
    expect(POISON_HIT_VFX.set, '中毒不能再借 mook_puff，否则淬毒看起来像吹箭虫在喷').not.toBe(
      'mook_puff',
    );
    expect(getAnimManifest('poison_burst'), 'poison_burst 图集没登记').not.toBeNull();
    expect(getAnimManifest('poison_burst')!.blend).toBe('add');
  });

  it('霜噬叠层是竖冰，不穿紫雾也不穿霜环', () => {
    expect(FROST_HIT_VFX.set).toBe('frost_burst');
    expect(FROST_HIT_VFX.anchor).toBe('target');
    expect(FROST_HIT_VFX.set).not.toBe(POISON_HIT_VFX.set);
    expect(FROST_HIT_VFX.set).not.toBe(SKILL_VFX.frost_ring!.impact?.set);
    expect(getAnimManifest('frost_burst'), 'frost_burst 图集没登记').not.toBeNull();
    expect(getAnimManifest('frost_burst')!.blend).toBe('add');
  });

  it('芙洛普攻走冰弹，不跟奥莉共用火球', () => {
    expect(attackRecipeFor('mage', 'floe')).toBe(FLOE_ATTACK_VFX);
    expect(attackRecipeFor('mage', 'mage')).toBe(ATTACK_VFX.mage);
    expect(FLOE_ATTACK_VFX.impact?.set).not.toBe(SKILL_VFX.frost_ring!.impact?.set);
    expect(FLOE_ATTACK_VFX.travel?.glowSet).not.toBe(ATTACK_VFX.mage.travel?.glowSet);
  });

  it('长驱贯枪的周围伤复用践踏扬尘，锚在溅射目标身上', () => {
    expect(SKILL_VFX.lance_thrust!.splashImpact?.set).toBe('trample_dust');
    expect(SKILL_VFX.lance_thrust!.splashImpact?.anchor).toBe('target');
    expect(recipeAnimSets(SKILL_VFX.lance_thrust!)).toContain('trample_dust');
  });

  it('旋风斩处决复用重劈的垂直劈裂，锚在目标身上', () => {
    expect(SKILL_VFX.whirl!.executeImpact?.set).toBe('cleave_slam');
    expect(SKILL_VFX.whirl!.executeImpact?.anchor).toBe('target');
    expect(recipeAnimSets(SKILL_VFX.whirl!), '斩残图集要跟旋风斩一起预取，否则第一刀没图').toContain(
      'cleave_slam',
    );
  });

  it('默认技能的命中生图不能和普攻同一张', () => {
    for (const k of KINDS) {
      const skillId = defaultSkillId(k);
      if (skillId === 'charge') continue;
      const attackSet = ATTACK_VFX[k].impact?.set;
      const skillSet = SKILL_VFX[skillId]?.impact?.set;
      expect(skillSet, `${k} 的默认技能 ${skillId} 没有命中生图`).toBeTruthy();
      expect(skillSet, `${k} 普攻和 ${skillId} 共用了命中图 ${attackSet}`).not.toBe(attackSet);
    }
  });

  it('近战普攻没有飞行段——贴身砍飞一支箭会很怪', () => {
    expect(ATTACK_VFX.sword.travel).toBeUndefined();
    expect(ATTACK_VFX.cavalry.travel).toBeUndefined();
    expect(ATTACK_VFX.shield.travel).toBeUndefined();
  });

  it('各职业各自一套色相，普攻命中火花不撞车', () => {
    const firstColor = (kind: UnitKind): number => ATTACK_VFX[kind].impact!.sparks!.colors[1]!;
    const seen = new Map<number, UnitKind>();
    for (const k of KINDS) {
      const c = firstColor(k);
      expect(seen.has(c), `${k} 的特效主色和 ${seen.get(c)} 撞了`).toBe(false);
      seen.set(c, k);
    }
  });

  it('vfxSetsForKinds 覆盖到普攻闪光、默认技能和冲锋光环', () => {
    const sets = vfxSetsForKinds(['cavalry']);
    expect(sets).toContain(ATTACK_VFX.cavalry.impact!.set);
    expect(sets).toContain(CHARGE_VFX.cast!.set);

    const swordSets = vfxSetsForKinds(['sword']);
    expect(swordSets).toContain(SKILL_VFX[defaultSkillId('sword')]!.impact!.set);

    const bowSets = vfxSetsForKinds(['bow']);
    // 穿透的拖尾光束也要预取，否则首发穿透会只见箭不见光
    expect(bowSets).toContain('pierce');
    expect(bowSets).toContain('arrow_hit');
  });

  it('recipeAnimSets 只收动画集，不把抠图弹体混进去', () => {
    const ids = recipeAnimSets(ATTACK_VFX.bow);
    expect(ids).toContain('arrow_hit');
    expect(ids).not.toContain('proj_arrow');
  });

  it('每个敌方技能皮肤的 vfxId 都有配方，且不与玩家默认技同图集（可区分）', () => {
    for (const skin of Object.values(ENEMY_SKILL_SKINS)) {
      const key = skin.vfxId ?? skin.implementsId;
      const recipe = SKILL_VFX[key];
      expect(recipe, `皮肤 ${skin.id} 的 vfxId=${key} 没有 SKILL_VFX 配方`).toBeDefined();
      const sets = recipeAnimSets(recipe!);
      expect(sets.length, `${skin.id} 配方没有动画集`).toBeGreaterThan(0);
      for (const setId of sets) {
        const m = getAnimManifest(setId);
        expect(m, `${skin.id} 图集 ${setId} 未注册`).not.toBeNull();
        expect(m!.blend).toBe('add');
      }
    }
    // 血牙咆哮必须用专属图集，不能还躺在通用 roar 上
    expect(SKILL_VFX.bloodfang_roar!.impact!.set).toBe('bloodfang_roar');
    expect(SKILL_VFX.savage_roar!.impact!.set).toBe('roar');
  });

  it('杂兵普攻和技能不穿玩家刀光 / 飞箭 / 火球的皮', () => {
    const playerSets = new Set<string>();
    for (const r of Object.values(ATTACK_VFX)) {
      for (const id of recipeAnimSets(r)) playerSets.add(id);
    }
    for (const k of KINDS) {
      const id = defaultSkillId(k);
      if (id === 'charge') continue;
      const r = SKILL_VFX[id];
      if (r) for (const s of recipeAnimSets(r)) playerSets.add(s);
    }

    const mookSkillIds = [
      'spore_spray',
      'wall_ram',
      'venom_dart',
      'mire_bite',
      'magma_burst',
      'cinder_breath',
      'wyrm_dash',
      'ash_harden',
    ];
    const leaked: string[] = [];
    for (const [k, r] of Object.entries(MOOK_ATTACK_VFX)) {
      for (const s of recipeAnimSets(r)) {
        if (playerSets.has(s)) leaked.push(`杂兵普攻:${k}→${s}`);
      }
    }
    for (const id of mookSkillIds) {
      const r = SKILL_VFX[id];
      expect(r, `杂兵技能 ${id} 没有配方`).toBeDefined();
      for (const s of recipeAnimSets(r!)) {
        if (playerSets.has(s)) leaked.push(`技能:${id}→${s}`);
      }
    }
    expect(leaked, `这些杂兵特效还在用玩家图集：${leaked.join('、')}`).toEqual([]);

    expect(usesMookCombatVfx('slime')).toBe(true);
    expect(usesMookCombatVfx('fangtrooper')).toBe(true);
    expect(usesMookCombatVfx('torun')).toBe(false);
    expect(attackRecipeFor('sword', 'slime').impact?.set).toBe('mook_claw');
    expect(attackRecipeFor('sword', 'torun').impact?.set).toBe(ATTACK_VFX.sword.impact?.set);
  });

  it('第一章草原临时技能形态互异：缠足光环 / 敷治道具 / 蜂群弹道 / 号角道具', () => {
    const snare = SKILL_VFX.temp_gl_snare!;
    const salve = SKILL_VFX.temp_gl_salve!;
    const swarm = SKILL_VFX.temp_gl_swarm!;
    const horn = SKILL_VFX.temp_gl_horn!;

    expect(snare.impact?.set).toBe('temp_gl_snare');
    expect(snare.impact?.anchor).toBe('target');
    // 草是实体，走普通混合。它曾经是 additive，也曾经是全库在草地上最看不清的一张：
    // 自身像素里 64% 与草地色差 <60，等于没放特效
    expect(getAnimManifest('temp_gl_snare')?.blend).toBe('normal');

    expect(salve.propBurst?.sprite).toBe('prop_salve');
    expect(salve.propBurst?.anchor).toBe('target');
    expect(salve.travel).toBeUndefined();

    // 蜂群走**多帧**抠图弹体，不是单张静图。单图沿轨道平移做不出「群体在扰动」，
    // 和剑士从前拿一张剑图沿弧线钉下去是同一种毛病
    expect(swarm.travel?.spriteSet).toBe('swarm_bees');
    expect(swarm.travel?.sprite).toBeUndefined();
    // 实体弹不能走 additive：additive 的前提是「暗部即透明」，
    // 而蜜蜂身上最有辨识度的正是黑条纹
    expect(getAnimManifest('swarm_bees')?.blend).toBe('normal');
    expect(swarm.travelPerTarget).toBe(true);
    expect(swarm.travel?.orbitLaps).toBeGreaterThanOrEqual(2);
    // 绕圈的弹体必须钉住不转。绕圈 heading 每圈扫满 360°，
    // 三圈就是翻三个滚——屏幕上是蜜蜂倒着飞
    expect(swarm.travel?.noRotate).toBe(true);
    expect(swarm.propBurst).toBeUndefined();

    expect(horn.propBurst?.sprite).toBe('prop_horn');
    expect(horn.propBurst?.anchor).toBe('caster');
    expect(horn.propBurst?.blend).toBe('add');
    expect(horn.propBurst?.yOffsetCells).toBeLessThan(0);
    expect(horn.travel).toBeUndefined();
  });
});
