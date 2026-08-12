import { skillDefForId } from '@/data/skillCatalog';
import type { SkillDef } from '@/battle/types';

/**
 * 敌方技能「皮肤」：战斗结算复用玩家/通用的 `SkillSpec`（`implementsId`），
 * 但名字、图标、特效可以按怪种各自换一套。
 *
 * 为什么不直接给每只怪复制一份 SkillSpec：伤害形状、冷却、AI 选目标这些规则
 * 改一次要同步 N 份；而玩家看见的是「黏液喷溅」还是「旋风斩」——后者会把
 * 实现细节漏给玩家，也让魔物读起来像穿着玩家职业皮的假人。
 *
 * 第一章小怪**不带技能**（只普攻）。有技能的条目从 Boss / 后续高级怪开始挂。
 */
export interface EnemySkillSkin {
  id: string;
  /** 共用的底层 SkillSpec.id */
  implementsId: string;
  /** 面板 / 飘字上的名字 */
  name: string;
  /** UI 图标 key（`assetBundles` / `images/ui/`）；缺省回退 `skill_${implementsId}` */
  iconKey: string;
  /**
   * `SKILL_VFX` 的查找键。缺省 = `implementsId`。
   * Boss 应指向专属特效条目；小怪可以和实现 id 共用一套简化特效。
   */
  vfxId?: string;
}

export const ENEMY_SKILL_SKINS: Record<string, EnemySkillSkin> = {
  // 第一章 Boss · 血牙酋长。底层仍是 savage_roar（自身 AoE + 攻 buff），
  // 但名字/图标跟玩家池彻底分开——玩家不可学，也不该看起来像「旋风斩换皮」。
  bloodfang_roar: {
    id: 'bloodfang_roar',
    implementsId: 'savage_roar',
    name: '血牙咆哮',
    iconKey: 'skill_bloodfang_roar',
    vfxId: 'bloodfang_roar',
  },
};

export function getEnemySkillSkin(id: string): EnemySkillSkin | undefined {
  return ENEMY_SKILL_SKINS[id];
}

/**
 * 把关卡蓝图上的 `skillSkin` / `skillId` 收成单位上的 `battleSkill`。
 *
 * - 有 skin：名字/图标/特效走皮肤，结算 id 走 `implementsId`
 * - 只有 skillId：沿用 SkillSpec 原名（给还没做皮肤的临时怪用）
 * - 都没有：**不挂技能**（第一章小怪的常态）
 */
export function resolveEnemyBattleSkill(opts: {
  skillSkin?: string;
  skillId?: string;
}): (SkillDef & { iconKey?: string; vfxId?: string }) | undefined {
  if (opts.skillSkin) {
    const skin = getEnemySkillSkin(opts.skillSkin);
    if (!skin) {
      throw new Error(`未知敌方技能皮肤: ${opts.skillSkin}`);
    }
    const base = skillDefForId(skin.implementsId);
    if (!base) {
      throw new Error(`技能皮肤 ${skin.id} 的 implementsId=${skin.implementsId} 不存在`);
    }
    return {
      id: base.id,
      name: skin.name,
      cooldown: base.cooldown,
      kind: base.kind,
      iconKey: skin.iconKey,
      vfxId: skin.vfxId ?? skin.implementsId,
    };
  }
  if (opts.skillId) {
    const base = skillDefForId(opts.skillId);
    if (!base) return undefined;
    return {
      id: base.id,
      name: base.name,
      cooldown: base.cooldown,
      kind: base.kind,
      vfxId: base.id,
    };
  }
  return undefined;
}
