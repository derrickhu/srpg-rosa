import type { MercenaryTemplate } from '@/data/mercenaryCatalog';
import { getMercenaryTemplate, STARTER_TEMPLATE_IDS } from '@/data/mercenaryCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import type { Mercenary } from '@/game/mercenaryTypes';

let rid = 0;
function nextRosterId(): string {
  rid += 1;
  return `m_${rid}`;
}

export function resetRosterIdCounter(): void {
  rid = 0;
}

/** 由目录模板生成运行时佣兵（新 rosterId；`strike` 与兵种默认合并） */
export function instantiateMercenaryTemplate(t: MercenaryTemplate): Mercenary {
  const st = UNIT_DEFS[t.profession];
  return {
    catalogId: t.catalogId,
    rosterId: nextRosterId(),
    name: t.name,
    profession: t.profession,
    base: { ...t.base },
    strike: { ...st.strike, ...t.strike },
    ownedSkillIds: [...t.ownedSkillIds],
    activeSkillId: t.activeSkillId,
  };
}

/** 开局阵容：来自目录中标记为开局的模板 */
export function createStarterRoster(): Mercenary[] {
  const out: Mercenary[] = [];
  for (const id of STARTER_TEMPLATE_IDS) {
    const t = getMercenaryTemplate(id);
    if (!t) continue;
    out.push(instantiateMercenaryTemplate(t));
  }
  return out;
}
