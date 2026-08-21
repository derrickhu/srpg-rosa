import {
  CHARACTER_DEFS,
  STARTER_CHARACTER_IDS,
  characterStatsAtLevel,
  getCharacterDef,
  remapLegacyCharacterId,
  type CharacterDef,
} from '@/data/characterCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import { remapLegacySkillId } from '@/data/skillCatalog';
import type { Character, CharacterBaseStats } from '@/game/characterTypes';

/** 由固定角色定义生成运行时角色实例（1 级，初始仅默认技能） */
export function instantiateCharacter(def: CharacterDef): Character {
  const st = UNIT_DEFS[def.profession];
  return {
    catalogId: def.id,
    rosterId: def.id,
    name: def.name,
    profession: def.profession,
    level: 1,
    base: { ...def.base },
    strike: { ...st.strike, ...def.strike },
    ownedSkillIds: [def.defaultSkillId],
    activeSkillId: def.defaultSkillId,
  };
}

/**
 * 老档里的凯尔 / 薇恩换成奥莉 / 弥尔。只保留等级，技能和词条不跟着走——
 * 剑士招法师带不上，硬迁会让词条整批休眠。
 */
function remapCharacterSkills(m: Character): Character {
  const ownedSkillIds = [...new Set(m.ownedSkillIds.map(remapLegacySkillId))];
  return {
    ...m,
    ownedSkillIds,
    activeSkillId: remapLegacySkillId(m.activeSkillId),
  };
}

export function remapLegacyRosterMember(m: Character): Character {
  const newId = remapLegacyCharacterId(m.rosterId);
  if (newId !== m.rosterId) {
    const def = getCharacterDef(newId);
    if (!def) return remapCharacterSkills(m);
    const inst = instantiateCharacter(def);
    inst.level = Math.max(1, m.level);
    return inst;
  }
  return remapCharacterSkills(m);
}

export function remapLegacyRoster(roster: Character[]): Character[] {
  const seen = new Set<string>();
  const out: Character[] = [];
  for (const m of roster) {
    const next = remapLegacyRosterMember(m);
    if (seen.has(next.rosterId)) continue;
    seen.add(next.rosterId);
    out.push(next);
  }
  return out;
}

/** 开局名册：来自固定角色表中标记为 starter 的角色 */
export function createStarterRoster(): Character[] {
  const out: Character[] = [];
  for (const id of STARTER_CHARACTER_IDS) {
    const def = getCharacterDef(id);
    if (def) out.push(instantiateCharacter(def));
  }
  return out;
}

/** 名册中尚未拥有的、可解锁角色定义 */
export function lockedCharacterDefs(roster: { rosterId: string }[]): CharacterDef[] {
  const have = new Set(roster.map((m) => m.rosterId));
  return CHARACTER_DEFS.filter((c) => !have.has(c.id));
}

/** 按 meta 等级计算角色有效基础面板（含成长，未含精华/局内加成） */
export function characterEffectiveStats(m: Character): CharacterBaseStats {
  const def = getCharacterDef(m.catalogId ?? m.rosterId);
  if (def) return characterStatsAtLevel(def, m.level);
  return { ...m.base };
}
