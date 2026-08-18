import type { UnitArchetypeDef, UnitDef, UnitKind, UnitState } from './types';
import { defaultSkillId, skillDefForId } from '@/data/skillCatalog';
import {
  sumTimedAtkBonus,
  sumTimedAtkDown,
  sumTimedSpdBonus,
  sumTimedSpdDown,
  timedGuardMul,
  timedTauntActive,
} from './timedBattleEffects';

/**
 * 合并兵种 `base`/`strike`、上场覆盖与限时 buff/debuff。
 *
 * **技能来源按阵营分叉**：
 * - 我方：`battleSkill`，没有则回退 `defaultSkillId(defId)`（职业默认技）
 * - 敌方：**只认显式 `battleSkill`**，没有就是纯普攻
 *
 * 敌方曾经也走 defaultSkillId，结果草原黏泥怪会放「旋风斩」、血牙狼自带冲锋被动——
 * 魔物读起来像穿着玩家职业皮的假人，第一章小怪也因此偏强。现在小怪默认无技能，
 * Boss / 高级怪通过关卡蓝图的 `skillSkin` 显式挂上（见 `enemySkillCatalog`）。
 */
export function effectiveUnitDef(
  u: UnitState,
  defs: Record<UnitKind, UnitArchetypeDef>,
): UnitDef {
  const b = defs[u.defId];
  const sk = u.faction === 'enemy'
    ? u.battleSkill
    : (u.battleSkill ?? skillDefForId(defaultSkillId(u.defId)));
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
    damageTakenMul: timedGuardMul(u),
  };
}
