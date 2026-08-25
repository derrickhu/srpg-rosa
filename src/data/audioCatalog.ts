import type { SfxId } from '@/core/AudioManager';
import { getSkillSpec, remapLegacySkillId, type SkillSpec } from '@/data/skillCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { UnitKind } from '@/battle/types';

/**
 * 玩家招牌技能一人一音；其余（临时槽、敌方、预留招）仍按属性族复用。
 *
 * 族的包络短而干：物理布甲+金属，火噼啪，霜玻璃碎裂，毒湿泡+嘶，圣软铃。
 * Boss 三招共用一条更重的。
 */
export type SkillSfxFamily =
  | 'physical'
  | 'fire'
  | 'frost'
  | 'poison'
  | 'holy'
  | 'boss';

const FAMILY_SFX: Record<SkillSfxFamily, SfxId> = {
  physical: 'sfx_skill_physical',
  fire: 'sfx_skill_fire',
  frost: 'sfx_skill_frost',
  poison: 'sfx_skill_poison',
  holy: 'sfx_skill_holy',
  boss: 'sfx_skill_boss',
};

/** 现役七个角色的招牌技能，各一条。漏登记的走族。 */
const SIGNATURE_SKILL_SFX: Record<string, SfxId> = {
  whirl: 'sfx_skill_whirl',
  pierce: 'sfx_skill_pierce',
  bash: 'sfx_skill_bash',
  lance_thrust: 'sfx_skill_lance_thrust',
  ember: 'sfx_skill_ember',
  heal_touch: 'sfx_skill_heal_touch',
  frost_ring: 'sfx_skill_frost_ring',
};

/** 玩家/敌方技能 id → 族。漏登记的走 `inferSkillFamily`，测试会锁玩家技能都能落到一族。 */
const SKILL_FAMILY: Record<string, SkillSfxFamily> = {
  whirl: 'physical',
  pierce: 'physical',
  bash: 'physical',
  blade_rush: 'physical',
  lance_thrust: 'physical',
  trample: 'physical',
  shield_wall: 'physical',
  cleave: 'physical',
  snap: 'physical',
  hammer: 'physical',
  war_shout: 'physical',
  hex_mark: 'physical',
  temp_gl_snare: 'physical',
  temp_gl_horn: 'physical',
  temp_fo_thorn: 'physical',
  temp_ft_ram: 'physical',
  temp_ft_suppress: 'physical',
  temp_ft_grapple: 'physical',
  wall_ram: 'physical',
  wyrm_dash: 'physical',
  ash_harden: 'physical',

  ember: 'fire',
  flame_ring: 'fire',
  temp_fo_torch: 'fire',
  magma_burst: 'fire',
  cinder_breath: 'fire',

  frost_ring: 'frost',

  temp_gl_swarm: 'poison',
  spore_spray: 'poison',
  venom_dart: 'poison',
  mire_bite: 'poison',

  temp_gl_salve: 'holy',
  temp_fo_bark: 'holy',
  temp_fo_warden: 'holy',
  temp_ft_banner: 'holy',
  heal_touch: 'holy',
  ward_prayer: 'holy',
  field_bless: 'holy',

  savage_roar: 'boss',
  wild_burn: 'boss',
  warlord_breach: 'boss',
  swamp_miasma: 'boss',
  dragon_breath: 'boss',
};

/** 词条改过的特效键、Boss 皮肤 vfxId。回放层优先读事件上的 vfxId。 */
const VFX_FAMILY: Record<string, SkillSfxFamily> = {
  ember_bloom: 'fire',
  bloodfang_roar: 'boss',
  bloodfang_wildfire: 'boss',
  bloodfang_breach: 'boss',
  mirequeen_miasma: 'boss',
  drake_cataclysm: 'boss',
};

const BOSS_SKILL_IDS = new Set([
  'savage_roar',
  'wild_burn',
  'warlord_breach',
  'swamp_miasma',
  'dragon_breath',
]);

function inferSkillFamily(spec: SkillSpec): SkillSfxFamily {
  if (spec.enemyOnly && BOSS_SKILL_IDS.has(spec.id)) return 'boss';
  if (spec.onCastTerrainEffects?.some((e) => e.kind === 'ignite')) return 'fire';
  const poison = spec.onCastFoeEffects?.find((e) => e.kind === 'poison');
  if (poison) return poison.theme === 'frost' ? 'frost' : 'poison';
  if (
    spec.role === 'support'
    || spec.onCastAllyEffects?.some((e) => e.kind === 'heal' || e.kind === 'guard')
  ) {
    return 'holy';
  }
  return 'physical';
}

/**
 * 把一次施法落到音色族。顺序：vfxId 覆盖 → skillId 表 → 从规格推断 → 物理。
 * 推断是给漏登记用的，不要靠它当主表；主表漏了测试会红。
 */
export function skillSfxFamily(skillId: string, vfxId?: string): SkillSfxFamily {
  if (vfxId && VFX_FAMILY[vfxId]) return VFX_FAMILY[vfxId];
  const id = remapLegacySkillId(skillId);
  if (SKILL_FAMILY[id]) return SKILL_FAMILY[id];
  if (vfxId) {
    const viaVfx = remapLegacySkillId(vfxId);
    if (SKILL_FAMILY[viaVfx]) return SKILL_FAMILY[viaVfx];
  }
  const spec = getSkillSpec(id);
  if (spec) return inferSkillFamily(spec);
  return 'physical';
}

export function sfxForSkillCast(skillId: string, vfxId?: string): SfxId {
  const id = remapLegacySkillId(skillId);
  if (SIGNATURE_SKILL_SFX[id]) return SIGNATURE_SKILL_SFX[id];
  return FAMILY_SFX[skillSfxFamily(skillId, vfxId)];
}

export function signatureSkillSfx(skillId: string): SfxId | undefined {
  return SIGNATURE_SKILL_SFX[remapLegacySkillId(skillId)];
}

export function sfxForAttack(kind: UnitKind | undefined): SfxId {
  if (kind && UNIT_DEFS[kind]?.strike.isRanged) return 'sfx_hit_arrow';
  return 'sfx_hit_melee';
}

export type DamageHitKind = 'physical' | 'magic';

/**
 * 弹道落地、或出手和命中之间有明显间隔时用的击中音。
 * 物理族走金属/布甲；火霜毒圣和 Boss 走魔法爆点。
 */
export function damageHitKindForSkill(skillId: string, vfxId?: string): DamageHitKind {
  return skillSfxFamily(skillId, vfxId) === 'physical' ? 'physical' : 'magic';
}

export function sfxForDamageHit(kind: DamageHitKind): SfxId {
  return kind === 'magic' ? 'sfx_hit_magic' : 'sfx_hit_physical';
}

export function sfxForSkillHit(skillId: string, vfxId?: string): SfxId {
  return sfxForDamageHit(damageHitKindForSkill(skillId, vfxId));
}

/** 远程普攻落地：弓是物理，法师/祭司是魔法。近战普攻不走这条。 */
export function sfxForAttackHit(kind: UnitKind | undefined): SfxId {
  if (kind === 'mage' || kind === 'healer') return 'sfx_hit_magic';
  return 'sfx_hit_physical';
}

export function skillFamilySfx(family: SkillSfxFamily): SfxId {
  return FAMILY_SFX[family];
}
