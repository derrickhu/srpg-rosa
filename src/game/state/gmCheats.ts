import { CHARACTER_DEFS, getCharacterDef } from '@/data/characterCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import type { MvpGameState } from './GameState';

const SOUL_GRANT = 99;

/** 名册补齐全部角色，不扣魂晶 */
export function gmUnlockAllCharacters(state: MvpGameState): number {
  const have = new Set(state.meta.roster.map((m) => m.rosterId));
  let n = 0;
  for (const def of CHARACTER_DEFS) {
    if (have.has(def.id)) continue;
    const inst = instantiateCharacter(def);
    if (!inst) continue;
    state.meta.roster.push(inst);
    n += 1;
  }
  return n;
}

export function gmAddSoul(state: MvpGameState, amount = SOUL_GRANT): number {
  const add = Math.max(0, Math.floor(amount));
  state.meta.metaCurrency += add;
  return add;
}

/** 每名已有角色学会自己路线上的全部可学技能 */
export function gmLearnAllSkills(state: MvpGameState): number {
  let n = 0;
  for (const m of state.meta.roster) {
    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    if (!def) continue;
    for (const id of [def.defaultSkillId, ...def.unlockableSkillIds]) {
      if (m.ownedSkillIds.includes(id)) continue;
      m.ownedSkillIds.push(id);
      n += 1;
    }
  }
  return n;
}

/** 进试炼前一次性备齐：全角色 + 全技能 */
export function gmPrepareSandboxRoster(state: MvpGameState): void {
  gmUnlockAllCharacters(state);
  gmLearnAllSkills(state);
}
