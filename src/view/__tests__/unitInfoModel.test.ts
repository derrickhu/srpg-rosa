import { describe, expect, it } from 'vitest';
import { effectiveUnitDef } from '@/battle/effectiveUnit';
import type { UnitState } from '@/battle/types';
import { STAGES_MVP } from '@/data/stagesMvp';
import { UNIT_DEFS } from '@/data/unitDefs';
import { enemySpawnToUnitState } from '@/game/state/DeployManager';
import { battleUnitInfoModel } from '@/view/unitInfoModel';

/**
 * 面板是玩家做决策的依据，所以它只允许有一个数值来源：`effectiveUnitDef`。
 * 这里守的是「面板上写的就是战斗里算的」——一旦有人在面板里自己抄一遍加减法，
 * 加新 buff 时面板会开始悄悄说谎，而这种谎在单测里是看不见的。
 */
describe('单位信息面板的数值来源', () => {
  const spawn = STAGES_MVP[0]!.enemies[0]!;

  it('敌人预览与实战用同一份换算', () => {
    const u = enemySpawnToUnitState(spawn, 1.5);
    const ed = effectiveUnitDef(u, UNIT_DEFS);
    const model = battleUnitInfoModel(u, { showCooldown: false });

    expect(model.stats.find((s) => s.label === '攻击')?.value).toBe(String(ed.atk));
    expect(model.stats.find((s) => s.label === '移动')?.value).toBe(String(ed.move));
    expect(model.stats.find((s) => s.label === '生命')?.value).toBe(`${u.hp}/${ed.maxHp}`);
  });

  // 草原杂兵的 defId 还是 sword/bow，但玩家看到的是魔物。
  // 面板漏出「剑士」会让「敌人是魔物」这个设定当场破功。
  it('敌方面板不暴露内部兵种名', () => {
    const u = enemySpawnToUnitState(spawn, 1);
    const model = battleUnitInfoModel(u, { showCooldown: false });
    expect(model.name).toBe(spawn.name);
    expect(model.subtitle).not.toContain(UNIT_DEFS[u.defId].name);
    expect(model.subtitle).toContain('敌方');
  });

  it('限时增益减益要算进面板，并单独列出剩余回合', () => {
    const base = enemySpawnToUnitState(spawn, 1);
    const buffed: UnitState = {
      ...base,
      timedBattleEffects: [
        { kind: 'atkBonus', addAtk: 5, roundsLeft: 2 },
        { kind: 'poison', dmgPerRound: 3, roundsLeft: 1 },
        // 已经到期的不该出现在「当前状态」里
        { kind: 'spdDown', subSpd: 2, roundsLeft: 0 },
      ],
    };
    const plainAtk = effectiveUnitDef(base, UNIT_DEFS).atk;
    const model = battleUnitInfoModel(buffed, { showCooldown: true });

    expect(model.stats.find((s) => s.label === '攻击')?.value).toBe(String(plainAtk + 5));
    expect(model.statuses).toHaveLength(2);
    expect(model.statuses?.join('\n')).toContain('中毒');
  });

  it('战斗中显示技能剩余冷却，布阵页预览不显示', () => {
    const bossSpawn = STAGES_MVP[6]!.enemies.find((e) => e.boss)!;
    const u: UnitState = { ...enemySpawnToUnitState(bossSpawn, 1), skillCd: 2 };
    const inBattle = battleUnitInfoModel(u, { showCooldown: true });
    const inDeploy = battleUnitInfoModel(u, { showCooldown: false });
    expect(inBattle.skills[0]!.cooldownNote).toBe('（剩 2）');
    expect(inDeploy.skills[0]!.cooldownNote).toBeUndefined();
  });

  it('第一章小怪面板不出现装备技能', () => {
    const u = enemySpawnToUnitState(spawn, 1);
    const model = battleUnitInfoModel(u, { showCooldown: false });
    expect(model.skills).toHaveLength(0);
  });

  it('Boss 面板显示皮肤名与图标，不暴露底层 savage_roar 名', () => {
    const bossSpawn = STAGES_MVP[6]!.enemies.find((e) => e.boss)!;
    const u = enemySpawnToUnitState(bossSpawn, 1.1);
    const model = battleUnitInfoModel(u, { showCooldown: false });
    expect(model.skills).toHaveLength(1);
    expect(model.skills[0]!.name).toBe('血牙咆哮');
    expect(model.skills[0]!.iconKey).toBe('skill_bloodfang_roar');
  });
});
