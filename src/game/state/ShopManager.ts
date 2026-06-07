import type { UnitKind } from '@/battle/types';
import { POTION_DEFS } from '@/data/potionCatalog';
import { STAT_POTION_DEFS } from '@/data/statPotionCatalog';
import {
  eligibleShopPoolRows,
  getShopTerrainPack,
  isPotionInShopPool,
  isSkillBindInShopPool,
  isStatPotionInShopPool,
  isTerrainPackInShopPool,
  potionShopPriceForStage,
  skillBindShopPriceForStage,
  statPotionShopPriceForStage,
  terrainPackShopPriceForStage,
} from '@/data/shopPoolCatalog';
import { canProfessionEquipSkill, getSkillSpec } from '@/data/skillCatalog';
import {
  canRecruitTemplateNow,
  getMercenaryTemplate,
  shopRecruitableTemplates,
} from '@/data/mercenaryCatalog';
import { instantiateMercenaryTemplate } from '@/game/mercenaryFactory';
import type { Mercenary } from '@/game/mercenaryTypes';
import {
  getMercenary,
  shuffle,
  type BuyShopContext,
  type MvpGameState,
  type ShopOffer,
} from './GameState';

function shopOffersFromPoolRows(state: MvpGameState): ShopOffer[] {
  const out: ShopOffer[] = [];
  const si = state.stageIndex;
  for (const row of eligibleShopPoolRows(si)) {
    switch (row.category) {
      case 'terrain': {
        const pack = getShopTerrainPack(row.packId);
        if (!pack) continue;
        out.push({
          type: 'terrain',
          packId: row.packId,
          charges: pack.charges,
          name: pack.displayName,
          price: row.price,
        });
        break;
      }
      case 'potion': {
        const d = POTION_DEFS[row.potionId];
        if (!d) continue;
        out.push({
          type: 'potion',
          potionId: row.potionId,
          name: d.name,
          price: row.price,
        });
        break;
      }
      case 'statPotion': {
        const d = STAT_POTION_DEFS[row.statPotionId];
        if (!d) continue;
        out.push({
          type: 'statPotion',
          statPotionId: row.statPotionId,
          name: d.name,
          price: row.price,
        });
        break;
      }
      case 'skillBind': {
        const spec = getSkillSpec(row.skillId);
        if (!spec) continue;
        const rosterOk = state.roster.filter(
          (m) => canProfessionEquipSkill(m.profession, row.skillId) && !m.ownedSkillIds.includes(row.skillId),
        );
        if (rosterOk.length === 0) continue;
        if (spec.exclusiveProfession !== null) {
          if (!rosterOk.some((m) => m.profession === spec.exclusiveProfession)) continue;
        }
        const price = row.price ?? spec.shopPrice ?? 7;
        out.push({
          type: 'skillBind',
          profession: spec.exclusiveProfession,
          skillId: row.skillId,
          name: spec.name,
          price,
        });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function rosterEligibleForSkillBind(
  state: MvpGameState,
  offer: Extract<ShopOffer, { type: 'skillBind' }>,
): Mercenary[] {
  return state.roster.filter((m) => {
    if (!canProfessionEquipSkill(m.profession, offer.skillId)) return false;
    if (m.ownedSkillIds.includes(offer.skillId)) return false;
    if (offer.profession !== null && m.profession !== offer.profession) return false;
    return true;
  });
}

export function rollShop(state: MvpGameState): ShopOffer[] {
  const pool: ShopOffer[] = [];
  const recruitable = shopRecruitableTemplates(state.stageIndex, state.roster);
  const shuffledRec = shuffle([...recruitable]);
  const recruitSlots = Math.min(4, shuffledRec.length);
  for (let i = 0; i < recruitSlots; i++) {
    const t = shuffledRec[i]!;
    pool.push({ type: 'recruit', catalogId: t.catalogId, price: t.shopPrice });
  }
  pool.push(...shopOffersFromPoolRows(state));
  return shuffle(pool).slice(0, 3);
}

export function buyShopOffer(
  state: MvpGameState,
  offer: ShopOffer,
  ctx?: BuyShopContext,
): boolean {
  if (state.gold < offer.price) return false;
  switch (offer.type) {
    case 'recruit': {
      const tpl = getMercenaryTemplate(offer.catalogId);
      if (!tpl || tpl.isStarter) return false;
      if (!canRecruitTemplateNow(tpl, state.stageIndex, state.roster)) return false;
      if (tpl.shopPrice !== offer.price) return false;
      state.roster.push(instantiateMercenaryTemplate(tpl));
      break;
    }
    case 'skillBind': {
      const rid = ctx?.skillBindTargetRosterId;
      if (!rid) return false;
      const m = getMercenary(state, rid);
      if (!m) return false;
      if (!isSkillBindInShopPool(offer.skillId, state.stageIndex)) return false;
      if (skillBindShopPriceForStage(offer.skillId, state.stageIndex) !== offer.price) return false;
      if (!getSkillSpec(offer.skillId)) return false;
      if (!canProfessionEquipSkill(m.profession, offer.skillId)) return false;
      if (offer.profession !== null && m.profession !== offer.profession) return false;
      if (m.ownedSkillIds.includes(offer.skillId)) return false;
      m.ownedSkillIds.push(offer.skillId);
      m.activeSkillId = offer.skillId;
      break;
    }
    case 'terrain': {
      const pack = getShopTerrainPack(offer.packId);
      if (!pack || pack.charges !== offer.charges) return false;
      if (!isTerrainPackInShopPool(offer.packId, state.stageIndex)) return false;
      if (terrainPackShopPriceForStage(offer.packId, state.stageIndex) !== offer.price) return false;
      state.terrainCharges += pack.charges;
      break;
    }
    case 'potion': {
      if (!POTION_DEFS[offer.potionId]) return false;
      if (!isPotionInShopPool(offer.potionId, state.stageIndex)) return false;
      if (potionShopPriceForStage(offer.potionId, state.stageIndex) !== offer.price) return false;
      state.potions[offer.potionId] = (state.potions[offer.potionId] ?? 0) + 1;
      break;
    }
    case 'statPotion': {
      if (!STAT_POTION_DEFS[offer.statPotionId]) return false;
      if (!isStatPotionInShopPool(offer.statPotionId, state.stageIndex)) return false;
      if (statPotionShopPriceForStage(offer.statPotionId, state.stageIndex) !== offer.price) return false;
      state.statPotions[offer.statPotionId] = (state.statPotions[offer.statPotionId] ?? 0) + 1;
      break;
    }
    default:
      return false;
  }
  state.gold -= offer.price;
  return true;
}

/** @deprecated 使用 buyShopOffer */
export function buyShopItem(state: MvpGameState, kind: UnitKind, price: number): boolean {
  const pool = shopRecruitableTemplates(state.stageIndex, state.roster).filter((t) => t.profession === kind);
  if (pool.length === 0) return false;
  const t = pool[Math.floor(Math.random() * pool.length)]!;
  void price;
  return buyShopOffer(state, { type: 'recruit', catalogId: t.catalogId, price: t.shopPrice });
}
