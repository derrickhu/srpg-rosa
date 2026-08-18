import {
  canCharacterUseSkill,
  getCharacterDef,
  levelUpCost,
  type CharacterDef,
} from '@/data/characterCatalog';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import type { MetaState, MvpGameState } from './GameState';

/**
 * 角色等级上限。
 *
 * 从 10 抬到 16 是为了给第 6–8 章留出成长空间。10 级封顶时玩家的面板在第五章就到头了，
 * 后面三章想变难只剩一条路——把 `enemyScaleBase` 往上堆，那是纯数值墙：玩家做对了
 * 每一件事，仍然只是被更大的数字压着走，且没有任何「我变强了」的反馈。
 *
 * 16 这个数字对着敌人缩放选的：第五章 1.3 到第八章约 1.7 是 +31%，
 * 而 10 → 16 级按现有 growth 大致是攻击 +32%、生命 +28%，两条曲线基本咬合。
 *
 * 升级价格公式（`levelUpCost` = 3 + 当前等级 × 2）不动，所以练满一个角色从 117
 * 涨到 285 魂晶。这是刻意的：一趟 8 章的产出不足以把全队拉满，玩家得挑主力。
 * 配套要求是第 6–8 章的 `metaReward` 给够（24 / 30 / 40），否则后三章会卡在没钱升级。
 */
export const MAX_CHARACTER_LEVEL = 16;

/** 升 1 级：消耗 meta 货币 */
export function levelUpCharacter(state: MvpGameState, rosterId: string): boolean {
  const m = state.meta.roster.find((x) => x.rosterId === rosterId);
  if (!m) return false;
  if (m.level >= MAX_CHARACTER_LEVEL) return false;
  const cost = levelUpCost(m.level);
  if (state.meta.metaCurrency < cost) return false;
  state.meta.metaCurrency -= cost;
  m.level += 1;
  return true;
}

/**
 * 持久装配一个已解锁技能（meta 层；不消耗货币，纯装配切换）。
 *
 * 路线校验走 `canCharacterUseSkill`，不只看职业：老存档里可能留着可学列表收紧前
 * 学到的越界技能（比如输出路线角色学过的战场祝福），只查 `ownedSkillIds`
 * 会让它照样装得上，而那正是词条批量休眠的入口。
 */
export function equipSkill(state: MvpGameState, rosterId: string, skillId: string): boolean {
  const m = state.meta.roster.find((x) => x.rosterId === rosterId);
  if (!m) return false;
  const def = getCharacterDef(m.catalogId ?? m.rosterId);
  if (!def || !canCharacterUseSkill(def, skillId)) return false;
  if (!m.ownedSkillIds.includes(skillId)) return false;
  m.activeSkillId = skillId;
  return true;
}

/** 解锁角色可装配技能列表：默认技能 + characterCatalog.unlockableSkillIds（用 meta 货币购买学习） */
export function unlockableSkillsFor(m: Character): string[] {
  const def = getCharacterDef(m.catalogId ?? m.rosterId);
  if (!def) return [];
  return def.unlockableSkillIds.filter((id) => !m.ownedSkillIds.includes(id));
}

export const SKILL_LEARN_COST = 8;

/** 用 meta 货币学习（解锁）一个技能到持久技能池 */
export function learnSkill(state: MvpGameState, rosterId: string, skillId: string): boolean {
  const m = state.meta.roster.find((x) => x.rosterId === rosterId);
  if (!m) return false;
  if (m.ownedSkillIds.includes(skillId)) return false;
  if (!unlockableSkillsFor(m).includes(skillId)) return false;
  if (state.meta.metaCurrency < SKILL_LEARN_COST) return false;
  state.meta.metaCurrency -= SKILL_LEARN_COST;
  m.ownedSkillIds.push(skillId);
  return true;
}

/** 用 meta 货币解锁一名角色（unlock.kind==='meta'） */
export function unlockCharacterWithMeta(state: MvpGameState, characterId: string): boolean {
  const def: CharacterDef | undefined = getCharacterDef(characterId);
  if (!def || def.unlock.kind !== 'meta') return false;
  if (state.meta.roster.some((m) => m.rosterId === characterId)) return false;
  if (state.meta.metaCurrency < def.unlock.cost) return false;
  state.meta.metaCurrency -= def.unlock.cost;
  state.meta.roster.push(instantiateCharacter(def));
  return true;
}

/** 用 meta 货币解锁一个副本（unlock.kind==='meta'） */
export function unlockDungeonWithMeta(state: MvpGameState, dungeonId: string): boolean {
  const d = getDungeonDef(dungeonId);
  if (!d || d.unlock.kind !== 'meta') return false;
  if (state.meta.unlockedDungeonIds.includes(dungeonId)) return false;
  if (state.meta.metaCurrency < d.unlock.cost) return false;
  state.meta.metaCurrency -= d.unlock.cost;
  state.meta.unlockedDungeonIds.push(dungeonId);
  return true;
}

export function isDungeonUnlocked(meta: MetaState, dungeonId: string): boolean {
  return meta.unlockedDungeonIds.includes(dungeonId);
}
