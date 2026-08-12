import { describe, expect, it } from 'vitest';
import { effectiveUnitDef } from '@/battle/effectiveUnit';
import {
  ENEMY_SKILL_SKINS,
  resolveEnemyBattleSkill,
} from '@/data/enemySkillCatalog';
import { STAGES_MVP } from '@/data/stagesMvp';
import { UNIT_DEFS } from '@/data/unitDefs';
import { enemySpawnToUnitState } from '@/game/state/DeployManager';

describe('敌方技能皮肤', () => {
  it('第一章小怪不挂技能，只普攻', () => {
    for (let i = 0; i < 6; i++) {
      const stage = STAGES_MVP[i]!;
      for (const e of stage.enemies) {
        expect(e.skillSkin, `${stage.name} ${e.uid} 不应有 skillSkin`).toBeUndefined();
        expect(e.skillId, `${stage.name} ${e.uid} 不应有 skillId`).toBeUndefined();
        const u = enemySpawnToUnitState(e, 1);
        expect(u.battleSkill).toBeUndefined();
        expect(effectiveUnitDef(u, UNIT_DEFS).skill).toBeUndefined();
      }
    }
  });

  it('第一章 Boss 挂血牙咆哮皮肤，结算仍走 savage_roar', () => {
    const boss = STAGES_MVP[6]!.enemies.find((e) => e.boss)!;
    expect(boss.skillSkin).toBe('bloodfang_roar');
    const u = enemySpawnToUnitState(boss, 1.1);
    expect(u.battleSkill?.id).toBe('savage_roar');
    expect(u.battleSkill?.name).toBe('血牙咆哮');
    expect(u.battleSkill?.iconKey).toBe('skill_bloodfang_roar');
    expect(u.battleSkill?.vfxId).toBe('bloodfang_roar');
    expect(effectiveUnitDef(u, UNIT_DEFS).skill?.id).toBe('savage_roar');
  });

  it('皮肤表每条都能 resolve，implementsId 真实存在', () => {
    for (const skin of Object.values(ENEMY_SKILL_SKINS)) {
      const sk = resolveEnemyBattleSkill({ skillSkin: skin.id });
      expect(sk?.id).toBe(skin.implementsId);
      expect(sk?.name).toBe(skin.name);
      expect(sk?.iconKey).toBe(skin.iconKey);
    }
  });

  it('未知皮肤直接抛错，避免静默退化成无技能', () => {
    expect(() => resolveEnemyBattleSkill({ skillSkin: 'no_such_skin' })).toThrow(/未知敌方技能皮肤/);
  });
});
