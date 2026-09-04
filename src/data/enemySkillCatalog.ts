import { skillDefForId } from '@/data/skillCatalog';
import type { SkillDef } from '@/battle/types';

/**
 * 敌方技能「皮肤」：战斗结算复用玩家/通用的 `SkillSpec`（`implementsId`），
 * 但名字、图标、特效可以按怪种各自换一套。
 *
 * 为什么不直接给每只怪复制一份 SkillSpec：伤害形状、冷却、程序选目标这些规则
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
  // 第六章 Boss · 血牙酋长（原第一章末战）。底层仍是 savage_roar（自身 AoE + 攻 buff），
  // 但名字/图标跟玩家池彻底分开——玩家不可学，也不该看起来像「旋风斩换皮」。
  bloodfang_roar: {
    id: 'bloodfang_roar',
    implementsId: 'savage_roar',
    name: '血牙咆哮',
    iconKey: 'skill_bloodfang_roar',
    vfxId: 'bloodfang_roar',
  },
  /**
   * 第二章 Boss · 血牙萨满。底层是 `wild_burn`（邻格 AoE + 点燃林地）。
   *
   * 和血牙咆哮同属血牙部族、同为红色系，所以专属特效的区分只能落在**形态**上：
   * 那个是犬齿环（向外扩散），这个是竖直火柱（向上窜）。见 docs/特效圣经.md §4.4。
   */
  bloodfang_wildfire: {
    id: 'bloodfang_wildfire',
    implementsId: 'wild_burn',
    name: '燎原咒火',
    iconKey: 'skill_bloodfang_wildfire',
    vfxId: 'bloodfang_wildfire',
  },
  /**
   * 第三章 Boss · 血牙城主。底层是 `warlord_breach`（直线穿透）。
   *
   * 特效是专属序列帧：一条粗细恒定的钝头贯穿线。它和终章「灭世龙息」共用底层形状
   * （都是 `lineBestRayAllFoes`），所以贴图承担了区分两者的全部工作——那一招是
   * 从一点张开的锥，这一招是等宽的攻城槌。**形状可以复用，形态不行。**
   */
  bloodfang_breach: {
    id: 'bloodfang_breach',
    implementsId: 'warlord_breach',
    name: '破阵冲撞',
    iconKey: 'skill_bloodfang_breach',
    vfxId: 'bloodfang_breach',
  },
  /**
   * 第四章 Boss · 沼母·蛭后。底层是 `swamp_miasma`（半径 2 浊雾 + 群体中毒）。
   *
   * 这是第一个**不属于血牙部族**的 Boss，所以它是全套里唯一可以彻底换色相的一个：
   * 前三个都锁在血红，这个走脓黄绿。形态上也刻意反着来——前面三招分别向外扩散、
   * 向上窜、向前推，这一招**往下沉**：浊雾贴着地面漫开，和「脚下的沼泽在削你」
   * 是同一句话。
   */
  mirequeen_miasma: {
    id: 'mirequeen_miasma',
    implementsId: 'swamp_miasma',
    name: '腐沼瘟息',
    iconKey: 'skill_mirequeen_miasma',
    vfxId: 'mirequeen_miasma',
  },
  /**
   * 终章 Boss · 龙王·安卡洛斯。底层是 `dragon_breath`（直线 + 按最大血量收费）。
   *
   * 它和破阵冲撞**同为直线**，所以形态上无法靠轮廓区分，区分改落在两处：
   * 一是配色（那个钢青，这个白热转橙红），二是起手位置——吐息从口部张开成锥形，
   * 而冲撞是整条线同时亮。玩家分不清「一条线」和「另一条线」，但分得清
   * 「从他嘴里喷出来的」和「他整个人撞过来的」。
   */
  /**
   * 从玩家池转过来的四招。底层 SkillSpec 原样复用，换一张皮就不会在面板上
   * 读成「这个杂兵会旋风斩」。图标也沿用原技能图——新画四张 26px 图标在这个
   * 尺寸上认不出区别，而缺图标会让点开面板变成灰圆。
   *
   * 先不挂上第二、三章的整兵种模板。投放曲线是「0 → 各 1 → 2 → 4」
   * （见 `stagesMvp` 的 `MookTemplate`），整种加上去会把已回归的胜率窗打穿。
   * 皮肤留在表里，等有空槽的精英或后续章再挂。
   */
  fang_cleave: {
    id: 'fang_cleave',
    implementsId: 'cleave',
    name: '血牙劈斩',
    iconKey: 'skill_cleave',
    vfxId: 'cleave',
  },
  gate_hammer: {
    id: 'gate_hammer',
    implementsId: 'hammer',
    name: '破门重锤',
    iconKey: 'skill_hammer',
    vfxId: 'hammer',
  },
  panther_trample: {
    id: 'panther_trample',
    implementsId: 'trample',
    name: '扑踏',
    iconKey: 'skill_trample',
    vfxId: 'trample',
  },
  wall_snap: {
    id: 'wall_snap',
    implementsId: 'snap',
    name: '连弩急射',
    iconKey: 'skill_snap',
    vfxId: 'snap',
  },
  drake_cataclysm: {
    id: 'drake_cataclysm',
    implementsId: 'dragon_breath',
    name: '灭世龙息',
    iconKey: 'skill_drake_cataclysm',
    vfxId: 'drake_cataclysm',
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
