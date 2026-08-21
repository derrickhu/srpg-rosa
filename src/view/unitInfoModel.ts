import { effectiveUnitDef } from '@/battle/effectiveUnit';
import type { TimedBattleEffect, UnitState } from '@/battle/types';
import { getSkillSpec } from '@/data/skillCatalog';
import { effectiveSkillSpec } from '@/data/skillModCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import { characterEffectiveStats } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import { resolveBattleSkillIdForCharacter } from '@/game/state/DeployManager';
import { tempSkillIdForRoster, type MvpGameState } from '@/game/MvpState';
import { createUnitToken } from '@/view/renderHelpers';
import type { UnitInfoModel, UnitInfoSkillSection } from '@/view/unitInfoPanel';

/** 主技能名的颜色；临时技能换一档，和操作条上两个槽的描边色是一套语言 */
const MAIN_SKILL_COLOR = 0xcc8833;
const TEMP_SKILL_COLOR = 0x3a7a5a;

const TEMP_SKILL_NOTE = '与主技能共用每回合一次的技能额度';

function mainSection(
  specId: string,
  modIds: readonly string[] | undefined,
  cooldownNote?: string,
): UnitInfoSkillSection | null {
  const base = getSkillSpec(specId);
  if (!base) return null;
  return {
    title: '装备技能',
    name: base.name,
    nameColor: MAIN_SKILL_COLOR,
    iconKey: `skill_${base.id}`,
    spec: effectiveSkillSpec(base, modIds),
    baseSpec: base,
    cooldownNote,
    showRange: true,
    modIds: modIds ?? [],
  };
}

/**
 * 临时技能段。**不套纹章**——纹章只强化主技能（见 `unitSkillSpec`），
 * 这里套上去面板会写出一个战斗里不会发生的数值。
 */
function tempSection(specId: string, cooldownNote?: string): UnitInfoSkillSection | null {
  const base = getSkillSpec(specId);
  if (!base) return null;
  return {
    title: '临时技能（本局）',
    name: base.name,
    nameColor: TEMP_SKILL_COLOR,
    iconKey: `skill_${base.id}`,
    spec: base,
    baseSpec: base,
    cooldownNote,
    // 不画范围格：两张格子图叠起来面板要滚动，而临时技能大多是贴脸的单体控制
    showRange: false,
    extraDesc: [TEMP_SKILL_NOTE, '纹章只强化主技能，不影响这一招'],
  };
}

/** 布阵页点开角色卡：数值取局外面板，技能取这一局实际会带上场的两个槽 */
export function characterInfoModel(state: MvpGameState, m: Character): UnitInfoModel {
  const eff = characterEffectiveStats(m);
  const modIds = state.run?.skillMods[m.rosterId] ?? [];
  const skills: UnitInfoSkillSection[] = [];

  // 用 `resolveBattleSkillIdForCharacter` 而不是 `activeSkillIdForRun`：
  // 前者是 `buildBattleUnits` 真正会带上场的那一招（会剔掉职业学不了、
  // 已经不在池子里的选择）。面板写 A、上场放 B，玩家会以为是 bug。
  const mainId = resolveBattleSkillIdForCharacter(state, m);
  const mainSec = mainSection(mainId, modIds);
  if (mainSec) skills.push(mainSec);
  const tempId = tempSkillIdForRoster(state, m.rosterId);
  if (tempId) {
    const s = tempSection(tempId);
    if (s) skills.push(s);
  }

  return {
    name: m.name,
    subtitle: `${UNIT_DEFS[m.profession].name} · Lv.${m.level}`,
    createPortrait: () => createUnitToken(m.profession, 'player', 48),
    stats: [
      { label: '生命', value: `${eff.maxHp}` },
      { label: '攻击', value: `${eff.atk}` },
      { label: '速度', value: `${eff.spd}` },
      { label: '移动', value: `${eff.move}` },
    ],
    strikeTitle: '普通攻击',
    strike: [
      { label: '射程', value: `${m.strike.range}` },
      { label: '类型', value: m.strike.isRanged ? '远程' : '近战' },
      { label: '嘲讽', value: m.strike.taunt ? '是' : '否' },
    ],
    skills,
  };
}

function describeTimedEffect(e: TimedBattleEffect): string {
  switch (e.kind) {
    case 'taunt': return `嘲讽: 强制被优先攻击（剩 ${e.roundsLeft} 回合）`;
    case 'poison': return `中毒: 每回合 -${e.dmgPerRound} 血（剩 ${e.roundsLeft} 回合）`;
    case 'atkBonus': return `攻击 +${e.addAtk}（剩 ${e.roundsLeft} 回合）`;
    case 'atkDown': return `攻击 -${e.subAtk}（剩 ${e.roundsLeft} 回合）`;
    case 'spdBonus': return `速度 +${e.addSpd}（剩 ${e.roundsLeft} 回合）`;
    case 'spdDown': return `速度 -${e.subSpd}（剩 ${e.roundsLeft} 回合）`;
    case 'guard':
      return `减伤: 受到伤害 -${Math.round(e.reduceRatio * 100)}%（剩 ${e.roundsLeft} 回合）`;
  }
}

export interface BattleUnitInfoOptions {
  /**
   * 显示冷却剩余回合。布阵页预览敌人时关掉：那时候还没开打，
   * 写「剩 0 回合」是在回答一个玩家没问的问题。
   */
  showCooldown: boolean;
}

/**
 * 战场单位（含布阵页的敌人预览）。
 *
 * 数值一律走 `effectiveUnitDef`——它是战斗结算读的同一个函数，
 * 所以面板上的攻击力就是这一刻真会打出去的攻击力，含限时增益减益。
 * 自己抄一遍加减法的话，加了新 buff 种类时面板会悄悄开始说谎。
 */
export function battleUnitInfoModel(u: UnitState, opts: BattleUnitInfoOptions): UnitInfoModel {
  const ed = effectiveUnitDef(u, UNIT_DEFS);
  const kindName = UNIT_DEFS[u.defId].name;
  const skills: UnitInfoSkillSection[] = [];

  const cdNote = (left: number): string | undefined =>
    opts.showCooldown && left > 0 ? `（剩 ${left}）` : undefined;

  if (ed.skill) {
    const s = mainSection(ed.skill.id, u.skillMods, cdNote(u.skillCd));
    if (s) {
      // 敌方技能皮肤覆写展示名/图标；结算仍认 ed.skill.id → SkillSpec
      if (u.battleSkill?.name) s.name = u.battleSkill.name;
      if (u.battleSkill?.iconKey) s.iconKey = u.battleSkill.iconKey;
      skills.push(s);
    }
  }
  if (u.tempSkill) {
    const s = tempSection(u.tempSkill.id, cdNote(u.tempSkillCd ?? 0));
    if (s) skills.push(s);
  }

  const statuses = (u.timedBattleEffects ?? [])
    .filter((e) => e.roundsLeft > 0)
    .map(describeTimedEffect);

  // 敌方副标题写「定位」而不是兵种名：草原杂兵的 defId 还是 sword/bow，
  // 但外观和名字已经是魔物了，面板上冒出「剑士」等于把实现细节漏给玩家。
  // 我方相反，职业名正是玩家认人的方式。
  const role = ed.isRanged ? '远程' : '近战';
  const subtitle = u.faction === 'enemy'
    ? `${u.boss ? '首领' : '敌方'} · ${role}`
    : kindName;

  return {
    name: u.displayName ?? kindName,
    subtitle,
    createPortrait: () => createUnitToken(u.animSet ?? u.defId, u.faction, 48),
    stats: [
      { label: '生命', value: `${Math.max(0, u.hp)}/${ed.maxHp}` },
      { label: '攻击', value: `${ed.atk}` },
      { label: '速度', value: `${ed.spd}` },
      { label: '移动', value: `${ed.move}` },
    ],
    strikeTitle: '普通攻击',
    strike: [
      { label: '射程', value: `${ed.range}` },
      { label: '类型', value: ed.isRanged ? '远程' : '近战' },
      { label: '嘲讽', value: ed.taunt ? '是' : '否' },
    ],
    skills,
    statuses: statuses.length > 0 ? statuses : undefined,
  };
}
