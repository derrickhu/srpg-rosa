import { POTION_DEFS } from '@/data/potionCatalog';
import { terrainTicketName, type ShopPoolRow } from '@/data/dungeonCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import type { Character } from '@/game/characterTypes';
import {
  currentDungeon,
  getCharacter,
  partyCharacters,
  requireRun,
  shuffle,
  type BuyShopContext,
  type MvpGameState,
  type ShopOffer,
} from './GameState';

/** 当前副本的 roguelike 池（局内商店候选） */
function dungeonPool(state: MvpGameState): ShopPoolRow[] {
  return currentDungeon(state).roguelikePool;
}

function poolPriceFor(
  state: MvpGameState,
  match: (r: ShopPoolRow) => boolean,
): number | undefined {
  const row = dungeonPool(state).find(match);
  return row ? row.price ?? undefined : undefined;
}

function offersFromPool(state: MvpGameState): ShopOffer[] {
  const out: ShopOffer[] = [];
  for (const row of dungeonPool(state)) {
    switch (row.category) {
      case 'terrain': {
        out.push({
          type: 'terrain',
          terrainId: row.terrainId,
          name: terrainTicketName(row.terrainId),
          price: row.price,
        });
        break;
      }
      case 'potion': {
        const d = POTION_DEFS[row.potionId];
        if (!d) continue;
        out.push({ type: 'potion', potionId: row.potionId, name: d.name, price: row.price });
        break;
      }
      case 'tempSkill': {
        const spec = getSkillSpec(row.skillId);
        if (!spec) continue;
        // 队里所有人都装满了同一个临时技能才下架；换人装是允许的（会顶掉原来那个）
        if (rosterEligibleForTempSkill(state, row.skillId).length === 0) continue;
        out.push({
          type: 'tempSkill',
          skillId: row.skillId,
          name: spec.name,
          price: row.price ?? spec.shopPrice ?? 7,
        });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/**
 * 临时技能能买给谁。
 *
 * **不挑职业**——这是临时槽和主槽最大的区别。主技能受职业限制是为了让四个职业
 * 各有各的打法；临时技能是场景发的一次性惊喜，挑职业只会让它经常没人能装，
 * 那这一格商品就等于没上架。唯一的排除条件是「他已经装着这一个了」。
 */
export function rosterEligibleForTempSkill(state: MvpGameState, skillId: string): Character[] {
  const run = state.run;
  return partyCharacters(state).filter((m) => run?.runTempSkill[m.rosterId] !== skillId);
}

/** 抽 3 件商品；只要池里有药剂就保底 1 件（Boss 前的补给点必须能买到续航） */
export function rollShop(state: MvpGameState): ShopOffer[] {
  const offers = shuffle(offersFromPool(state));
  const potionIdx = offers.findIndex((o) => o.type === 'potion');
  if (potionIdx < 0) return offers.slice(0, 3);
  const [potion] = offers.splice(potionIdx, 1);
  return shuffle([potion!, ...offers.slice(0, 2)]);
}

export function buyShopOffer(
  state: MvpGameState,
  offer: ShopOffer,
  ctx?: BuyShopContext,
): boolean {
  const run = requireRun(state);
  if (run.gold < offer.price) return false;
  switch (offer.type) {
    case 'tempSkill': {
      const rid = ctx?.tempSkillTargetRosterId;
      if (!rid) return false;
      const m = getCharacter(state, rid);
      if (!m || !run.partyRosterIds.includes(rid)) return false;
      const price = poolPriceFor(state, (r) => r.category === 'tempSkill' && r.skillId === offer.skillId);
      const spec = getSkillSpec(offer.skillId);
      if (!spec) return false;
      if ((price ?? spec.shopPrice ?? 7) !== offer.price) return false;
      if (run.runTempSkill[rid] === offer.skillId) return false;
      // 顶掉他原来的临时技能。这里不用像主槽那样担心「把优势换没了」：
      // 词条挂在角色身上，换临时技能不动它。
      run.runTempSkill[rid] = offer.skillId;
      break;
    }
    case 'terrain': {
      if (poolPriceFor(state, (r) => r.category === 'terrain' && r.terrainId === offer.terrainId) !== offer.price) return false;
      run.terrainCharges[offer.terrainId] = (run.terrainCharges[offer.terrainId] ?? 0) + 1;
      break;
    }
    case 'potion': {
      if (!POTION_DEFS[offer.potionId]) return false;
      if (poolPriceFor(state, (r) => r.category === 'potion' && r.potionId === offer.potionId) !== offer.price) return false;
      run.potions[offer.potionId] = (run.potions[offer.potionId] ?? 0) + 1;
      break;
    }
    default:
      return false;
  }
  run.gold -= offer.price;
  return true;
}
