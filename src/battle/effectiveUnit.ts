import type { UnitArchetypeDef, UnitDef, UnitKind, UnitState } from './types';
import { defaultSkillId, skillDefForId } from '@/data/skillCatalog';
import {
  sumTimedAtkBonus,
  sumTimedAtkDown,
  sumTimedSpdBonus,
  sumTimedSpdDown,
  timedTauntActive,
} from './timedBattleEffects';

/**
 * 合并兵种 `base`/`strike`、佣兵覆盖、精华对**基础**三维的加成；
 * 普攻射程/远程来自 `strike`（+ `merc*`）；
 * **嘲讽** = 普攻 `strike.taunt` **或** 限时 `taunt`；
 * **攻击/速度**：基础 + 精华 + 限时 buff − 限时 debuff。
 */
export function effectiveUnitDef(
  u: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
): UnitDef {
  const b = defs[u.defId];
  const sk = u.battleSkill ?? skillDefForId(defaultSkillId(u.defId));
  const base = b.base;
  const strike = b.strike;
  const baseAtk = u.mercAtk ?? base.atk;
  const baseSpd = u.mercSpd ?? base.spd;
  const baseMove = u.mercMove ?? base.move;
  const baseMaxHp = u.mercMaxHp ?? base.maxHp;
  const baseRange = u.mercRange ?? strike.range;
  const baseRanged = u.mercIsRanged ?? strike.isRanged;
  const strikeTaunt = u.mercTaunt ?? strike.taunt;
  const taunt = strikeTaunt || timedTauntActive(u);
  const timedAtk = sumTimedAtkBonus(u);
  const timedAtkDown = sumTimedAtkDown(u);
  const timedSpd = sumTimedSpdBonus(u);
  const timedSpdDown = sumTimedSpdDown(u);
  return {
    id: b.id,
    name: b.name,
    skill: sk,
    tempSkill: u.tempSkill,
    maxHp: baseMaxHp,
    atk: Math.max(1, baseAtk + (u.bonusAtk ?? 0) + timedAtk - timedAtkDown),
    spd: Math.max(1, baseSpd + (u.bonusSpd ?? 0) + timedSpd - timedSpdDown),
    move: Math.max(1, baseMove + (u.bonusMove ?? 0)),
    range: baseRange,
    isRanged: baseRanged,
    taunt,
  };
}
