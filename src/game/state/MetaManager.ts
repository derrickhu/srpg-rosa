import {
  getCharacterDef,
  levelUpCost,
  type CharacterDef,
} from '@/data/characterCatalog';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { canProfessionEquipSkill, getSkillSpec } from '@/data/skillCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import type { MetaState, MvpGameState } from './GameState';

export const MAX_CHARACTER_LEVEL = 10;

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

/** 持久装配一个已解锁/可解锁技能（meta 层；不消耗货币，纯装配切换） */
export function equipSkill(state: MvpGameState, rosterId: string, skillId: string): boolean {
  const m = state.meta.roster.find((x) => x.rosterId === rosterId);
  if (!m) return false;
  if (!getSkillSpec(skillId)) return false;
  if (!canProfessionEquipSkill(m.profession, skillId)) return false;
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
