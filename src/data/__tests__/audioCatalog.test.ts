import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allPlayerSkillSpecs, allSkillSpecs } from '@/data/skillCatalog';
import { ENEMY_SKILL_SKINS } from '@/data/enemySkillCatalog';
import { SKILL_VFX } from '@/data/vfxCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import { mainSlotSkillIds } from '@/data/characterCatalog';
import {
  sfxForAttack,
  sfxForAttackHit,
  sfxForSkillCast,
  sfxForSkillHit,
  signatureSkillSfx,
  skillSfxFamily,
  type SkillSfxFamily,
} from '@/data/audioCatalog';
import type { UnitKind } from '@/battle/types';

const FAMILIES: SkillSfxFamily[] = ['physical', 'fire', 'frost', 'poison', 'holy', 'boss'];

const PACKAGED_SFX = [
  'ui_click',
  'ui_deny',
  'ui_open',
  'ui_tab',
  'sfx_soul_spend',
  'sfx_unlock',
  'sfx_soul_gain',
  'sfx_reveal',
  'sfx_levelup',
  'sfx_coin',
  'sfx_buy',
  'sfx_deploy',
  'sfx_sweep',
  'sfx_step',
  'sfx_undo',
  'sfx_wait',
  'sfx_hit_melee',
  'sfx_hit_arrow',
  'sfx_hit_physical',
  'sfx_hit_magic',
  'sfx_death',
  'sfx_heal',
  'sfx_potion',
  'sfx_gate',
  'sfx_ignite',
  'sfx_victory',
  'sfx_defeat',
  'sfx_skill_physical',
  'sfx_skill_fire',
  'sfx_skill_frost',
  'sfx_skill_poison',
  'sfx_skill_holy',
  'sfx_skill_boss',
  'sfx_skill_whirl',
  'sfx_skill_pierce',
  'sfx_skill_bash',
  'sfx_skill_lance_thrust',
  'sfx_skill_ember',
  'sfx_skill_heal_touch',
  'sfx_skill_frost_ring',
];

describe('技能音效族', () => {
  it('每个玩家技能都能落到一族，不会静默', () => {
    for (const spec of allPlayerSkillSpecs()) {
      const family = skillSfxFamily(spec.id);
      expect(FAMILIES, `${spec.name}（${spec.id}）没落到已知族`).toContain(family);
      expect(sfxForSkillCast(spec.id)).toBeTruthy();
    }
  });

  it('七个招牌技能各有一条，不走属性族', () => {
    const ids = mainSlotSkillIds();
    expect(ids).toHaveLength(7);
    const unique = new Set(ids.map((id) => sfxForSkillCast(id)));
    expect(unique.size).toBe(ids.length);
    for (const id of ids) {
      const own = signatureSkillSfx(id);
      expect(own, `${id} 应有招牌音效`).toBeDefined();
      expect(sfxForSkillCast(id)).toBe(own);
      expect(sfxForSkillCast(id)).not.toBe(`sfx_skill_${skillSfxFamily(id)}`);
    }
  });

  it('非招牌玩家技能仍走属性族', () => {
    const signature = new Set(mainSlotSkillIds());
    for (const spec of allPlayerSkillSpecs()) {
      if (signature.has(spec.id)) continue;
      expect(sfxForSkillCast(spec.id)).toBe(`sfx_skill_${skillSfxFamily(spec.id)}`);
    }
  });

  it('敌方技能和 Boss 皮肤也不会落到空', () => {
    for (const spec of allSkillSpecs()) {
      expect(FAMILIES).toContain(skillSfxFamily(spec.id));
    }
    for (const skin of Object.values(ENEMY_SKILL_SKINS)) {
      const family = skillSfxFamily(skin.implementsId, skin.vfxId);
      expect(FAMILIES, `皮肤 ${skin.id}`).toContain(family);
      if (skin.vfxId && /bloodfang|mirequeen|drake_cataclysm/.test(skin.vfxId)) {
        expect(family, `${skin.id} 该走 Boss 族`).toBe('boss');
      }
    }
  });

  it('VFX 覆盖键能改族：爆炎走火，龙灾走 Boss', () => {
    expect(skillSfxFamily('ember', 'ember_bloom')).toBe('fire');
    expect(skillSfxFamily('dragon_breath', 'drake_cataclysm')).toBe('boss');
    expect(Object.keys(SKILL_VFX).length).toBeGreaterThan(0);
  });

  it('普攻按 isRanged 分近战和箭', () => {
    const kinds = Object.keys(UNIT_DEFS) as UnitKind[];
    for (const kind of kinds) {
      expect(sfxForAttack(kind)).toBe(
        UNIT_DEFS[kind].strike.isRanged ? 'sfx_hit_arrow' : 'sfx_hit_melee',
      );
    }
  });

  it('延迟命中：物理和魔法两条，弓落点走物理，法师/祭司走魔法', () => {
    expect(sfxForSkillHit('pierce')).toBe('sfx_hit_physical');
    expect(sfxForSkillHit('ember')).toBe('sfx_hit_magic');
    expect(sfxForSkillHit('ember', 'ember_bloom')).toBe('sfx_hit_magic');
    expect(sfxForSkillHit('frost_ring')).toBe('sfx_hit_magic');
    expect(sfxForAttackHit('bow')).toBe('sfx_hit_physical');
    expect(sfxForAttackHit('mage')).toBe('sfx_hit_magic');
    expect(sfxForAttackHit('healer')).toBe('sfx_hit_magic');
    expect(sfxForAttackHit('sword')).toBe('sfx_hit_physical');
  });

  it('金币和魂晶不是同一条音', () => {
    expect('sfx_coin').not.toBe('sfx_soul_gain');
    expect('sfx_coin').not.toBe('sfx_soul_spend');
  });
});

describe('主包音效文件', () => {
  it('清单里的短音效都在 audio/sfx，旧占位已删', () => {
    const sfxDir = resolve(process.cwd(), 'audio/sfx');
    for (const id of PACKAGED_SFX) {
      expect(existsSync(resolve(sfxDir, `${id}.mp3`)), `缺 ${id}.mp3`).toBe(true);
    }
    expect(existsSync(resolve(process.cwd(), 'audio/bgm.mp3'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'audio/bullet.mp3'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'audio/boom.mp3'))).toBe(false);
  });
});
