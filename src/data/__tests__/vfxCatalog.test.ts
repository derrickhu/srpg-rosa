import { describe, expect, it } from 'vitest';
import type { UnitKind } from '@/battle/types';
import { defaultSkillId } from '@/data/skillCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  ATTACK_VFX,
  CHARGE_VFX,
  SKILL_VFX,
  recipeAnimSets,
  vfxSetsForKinds,
  type FlashDef,
  type VfxRecipe,
} from '@/data/vfxCatalog';
import { getAnimManifest } from '@/view/animSets';
import { FX_BUNDLE } from '@/core/assetBundles';

const KINDS = Object.keys(UNIT_DEFS) as UnitKind[];

function allRecipes(): Array<[string, VfxRecipe]> {
  return [
    ...Object.entries(ATTACK_VFX).map(([k, v]): [string, VfxRecipe] => [`普攻:${k}`, v]),
    ...Object.entries(SKILL_VFX).map(([k, v]): [string, VfxRecipe] => [`技能:${k}`, v]),
    ['冲锋', CHARGE_VFX],
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
        expect(m!.blend, `${label}/${flash.set} 少了 blend: 'add'`).toBe('add');
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

  it('四职业的普攻和默认技能都有专属配方', () => {
    for (const k of KINDS) {
      expect(ATTACK_VFX[k], `${k} 没有普攻特效`).toBeDefined();
      const skillId = defaultSkillId(k);
      const covered = skillId in SKILL_VFX || skillId === 'charge';
      expect(covered, `${k} 的默认技能 ${skillId} 没有特效`).toBe(true);
    }
  });

  it('弓手普攻和穿透箭必须有飞行段——没有飞行段就只是「敌人身上闪一下」', () => {
    expect(ATTACK_VFX.bow.travel, '弓手普攻丢了飞行段').toBeDefined();
    expect(ATTACK_VFX.bow.travel!.sprite).toBe('proj_arrow');
    expect(ATTACK_VFX.bow.impact, '弓手普攻丢了命中闪光').toBeDefined();

    expect(SKILL_VFX.pierce!.travel, '穿透箭丢了飞行段').toBeDefined();
    expect(SKILL_VFX.pierce!.impactPerHit, '穿透箭应按途经依次结算').toBe(true);
    // 穿透和普攻的视觉差就在这条尾迹
    expect(SKILL_VFX.pierce!.travel!.beamSet).toBe('pierce');
  });

  it('近战普攻没有飞行段——贴身砍飞一支箭会很怪', () => {
    expect(ATTACK_VFX.sword.travel).toBeUndefined();
    expect(ATTACK_VFX.cavalry.travel).toBeUndefined();
    expect(ATTACK_VFX.shield.travel).toBeUndefined();
  });

  it('四职业各自一套色相，普攻命中火花不撞车', () => {
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
});
