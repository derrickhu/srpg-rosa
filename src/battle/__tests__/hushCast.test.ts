import { describe, expect, it } from 'vitest';
import { emptyTerrain } from '@/battle/grid';
import {
  castBlockTerrainName,
  castSkillManual,
  skillAiming,
  trySkillBeforeMove,
} from '@/battle/skills';
import { unitHasFreeze } from '@/battle/timedBattleEffects';
import { skillDefForId } from '@/data/skillCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { TerrainGrid } from '@/battle/grid';
import type { UnitState } from '@/battle/types';

function unit(
  uid: string,
  kind: UnitState['defId'],
  faction: UnitState['faction'],
  x: number,
  y: number,
  skillId?: string,
): UnitState {
  const sk = skillId ? skillDefForId(skillId) : undefined;
  return {
    uid,
    defId: kind,
    faction,
    hp: Math.floor(UNIT_DEFS[kind].base.maxHp / 2),
    pos: { x, y },
    skillCd: 0,
    movedInTurn: false,
    ...(sk ? { battleSkill: sk } : {}),
  };
}

describe('静域禁招', () => {
  it('站在静域上放不了，走回平地可以蓄鸣', () => {
    const terrain: TerrainGrid = emptyTerrain(9, 10);
    terrain[2]![4] = 'hush';
    const onHush = unit('shard', 'sword', 'enemy', 4, 2, 'peal_store');
    const units = [onHush, unit('hero', 'sword', 'player', 4, 6)];
    expect(castBlockTerrainName(onHush, terrain)).toBe('静域');
    expect(trySkillBeforeMove(onHush, UNIT_DEFS, units, terrain)).toEqual([]);
    expect(skillAiming(onHush, UNIT_DEFS, units, terrain)).toBeNull();

    onHush.pos = { x: 4, y: 3 };
    expect(castBlockTerrainName(onHush, terrain)).toBeNull();
    const events = trySkillBeforeMove(onHush, UNIT_DEFS, units, terrain);
    expect(events.some((e) => e.type === 'skillCast' && e.skillId === 'peal_store')).toBe(true);
    expect(onHush.timedBattleEffects?.some((e) => e.kind === 'atkBonus' && e.addAtk === 4)).toBe(true);
  });

  it('井外的治疗仍能奶到井里的人', () => {
    const terrain: TerrainGrid = emptyTerrain(9, 10);
    terrain[4]![4] = 'hush';
    const healer = unit('heal', 'healer', 'player', 4, 6);
    const hurt = unit('hurt', 'sword', 'player', 4, 4);
    const before = hurt.hp;
    const events = trySkillBeforeMove(healer, UNIT_DEFS, [healer, hurt], terrain);
    expect(castBlockTerrainName(healer, terrain)).toBeNull();
    expect(events.some((e) => e.type === 'skillCast' && e.skillId === 'heal_touch')).toBe(true);
    expect(hurt.hp).toBeGreaterThan(before);
  });

  it('余震只冻站在静域上的人，缺口和平地只受伤', () => {
    const terrain: TerrainGrid = emptyTerrain(9, 10);
    terrain[2]![3] = 'hush';
    const boss = unit('bell', 'sword', 'enemy', 4, 1, 'after_shock');
    const gap = unit('gap', 'sword', 'player', 4, 2);
    const hush = unit('hush', 'sword', 'player', 3, 2);
    const side = unit('side', 'sword', 'player', 3, 1);
    const units = [boss, gap, hush, side];
    const events = trySkillBeforeMove(boss, UNIT_DEFS, units, terrain);
    expect(events.some((e) => e.type === 'skillCast' && e.skillId === 'after_shock')).toBe(true);
    expect(unitHasFreeze(hush)).toBe(true);
    expect(unitHasFreeze(gap)).toBe(false);
    expect(unitHasFreeze(side)).toBe(false);
    expect(gap.hp).toBeLessThan(UNIT_DEFS.sword.base.maxHp / 2);
    expect(hush.hp).toBeLessThan(UNIT_DEFS.sword.base.maxHp / 2);
  });

  it('推井可以把人推进静域，静域不是墙', () => {
    const terrain: TerrainGrid = emptyTerrain(9, 10);
    terrain[3]![2] = 'hush';
    const ram = unit('ram', 'cavalry', 'enemy', 2, 6, 'well_ram');
    const foe = unit('foe', 'sword', 'player', 2, 4);
    const events = castSkillManual(ram, UNIT_DEFS, [ram, foe], terrain, foe.uid);
    expect(events.some((e) => e.type === 'skillCast' && e.skillId === 'well_ram')).toBe(true);
    expect(foe.pos).toEqual({ x: 2, y: 3 });
    expect(castBlockTerrainName(foe, terrain)).toBe('静域');
  });
});
