import { getSkillSpec } from '@/data/skillCatalog';
import { STAT_POTION_DEFS } from '@/data/statPotionCatalog';

/**
 * 商店可售商品池：每一行引用「已有品类配置表」的 id，
 * 用 `poolFromStageIndex` / `poolUntilStageIndex` 控制随关卡进度捞取范围。
 * （佣兵招募仍用 `mercenaryCatalog.shopRecruitableTemplates`，不在此表重复列人。）
 */

/** 地形包：引用 id，具体格数在表中 */
export interface ShopTerrainPack {
  id: string;
  displayName: string;
  /** 购买后增加的「高地放置」次数 */
  charges: number;
}

export const SHOP_TERRAIN_PACKS: Record<string, ShopTerrainPack> = {
  pack_high_1: {
    id: 'pack_high_1',
    displayName: '地形包 · +1 次高地',
    charges: 1,
  },
};

export type ShopPoolRow =
  | {
      category: 'terrain';
      packId: string;
      poolFromStageIndex: number;
      poolUntilStageIndex?: number;
      price: number;
    }
  | {
      category: 'potion';
      /** 对应 `POTION_DEFS` */
      potionId: string;
      poolFromStageIndex: number;
      poolUntilStageIndex?: number;
      price: number;
    }
  | {
      category: 'statPotion';
      /** 对应 `STAT_POTION_DEFS` */
      statPotionId: string;
      poolFromStageIndex: number;
      poolUntilStageIndex?: number;
      price: number;
    }
  | {
      category: 'skillBind';
      /** 对应 `skillCatalog` SPECS 中可售技能 id */
      skillId: string;
      poolFromStageIndex: number;
      poolUntilStageIndex?: number;
      /** 未填则用技能 spec 的 `shopPrice` */
      price?: number;
    };

/** 全店非佣兵类商品池（地形 / 一次性药 / 永久药 / 技能书） */
export const SHOP_POOL_ROWS: ShopPoolRow[] = [
  { category: 'terrain', packId: 'pack_high_1', poolFromStageIndex: 0, price: 4 },
  { category: 'potion', potionId: 'draught', poolFromStageIndex: 0, poolUntilStageIndex: 1, price: 5 },
  { category: 'potion', potionId: 'draught', poolFromStageIndex: 2, price: 6 },
  { category: 'statPotion', statPotionId: 'perm_atk', poolFromStageIndex: 0, price: 6 },
  { category: 'statPotion', statPotionId: 'perm_spd', poolFromStageIndex: 0, price: 6 },
  { category: 'statPotion', statPotionId: 'perm_move', poolFromStageIndex: 0, price: 7 },
  { category: 'skillBind', skillId: 'cleave', poolFromStageIndex: 0, price: 7 },
  { category: 'skillBind', skillId: 'snap', poolFromStageIndex: 0, price: 7 },
  { category: 'skillBind', skillId: 'hammer', poolFromStageIndex: 0, price: 7 },
  { category: 'skillBind', skillId: 'war_shout', poolFromStageIndex: 0, poolUntilStageIndex: 2, price: 8 },
  { category: 'skillBind', skillId: 'hex_mark', poolFromStageIndex: 0, price: 7 },
  { category: 'skillBind', skillId: 'field_bless', poolFromStageIndex: 0, price: 8 },
];

function inPoolStageRange(stageIndex: number, from: number, until?: number): boolean {
  if (stageIndex < from) return false;
  if (until !== undefined && stageIndex > until) return false;
  return true;
}

/** 当前关卡进度下，商店池里可参与混洗的非佣兵行 */
export function eligibleShopPoolRows(stageIndex: number): ShopPoolRow[] {
  return SHOP_POOL_ROWS.filter((r) => inPoolStageRange(stageIndex, r.poolFromStageIndex, r.poolUntilStageIndex));
}

/** 校验地形包 id 是否在配置表 */
export function getShopTerrainPack(packId: string): ShopTerrainPack | undefined {
  return SHOP_TERRAIN_PACKS[packId];
}

/** 校验药剂 id 是否在本进度商店池允许出售 */
export function isPotionInShopPool(potionId: string, stageIndex: number): boolean {
  return eligibleShopPoolRows(stageIndex).some(
    (r) => r.category === 'potion' && r.potionId === potionId,
  );
}

export function potionShopPriceForStage(potionId: string, stageIndex: number): number | undefined {
  const rows = eligibleShopPoolRows(stageIndex).filter(
    (r): r is Extract<ShopPoolRow, { category: 'potion' }> => r.category === 'potion' && r.potionId === potionId,
  );
  if (rows.length === 0) return undefined;
  return rows[0]!.price;
}

export function isStatPotionInShopPool(statPotionId: string, stageIndex: number): boolean {
  return eligibleShopPoolRows(stageIndex).some(
    (r) => r.category === 'statPotion' && r.statPotionId === statPotionId,
  );
}

export function statPotionShopPriceForStage(statPotionId: string, stageIndex: number): number | undefined {
  const rows = eligibleShopPoolRows(stageIndex).filter(
    (r): r is Extract<ShopPoolRow, { category: 'statPotion' }> =>
      r.category === 'statPotion' && r.statPotionId === statPotionId,
  );
  if (rows.length === 0) return undefined;
  return rows[0]!.price;
}

export function isTerrainPackInShopPool(packId: string, stageIndex: number): boolean {
  return eligibleShopPoolRows(stageIndex).some((r) => r.category === 'terrain' && r.packId === packId);
}

export function terrainPackShopPriceForStage(packId: string, stageIndex: number): number | undefined {
  const rows = eligibleShopPoolRows(stageIndex).filter(
    (r): r is Extract<ShopPoolRow, { category: 'terrain' }> => r.category === 'terrain' && r.packId === packId,
  );
  if (rows.length === 0) return undefined;
  return rows[0]!.price;
}

/** 技能商店价：池行覆盖 > spec.shopPrice > 默认 */
export function skillBindShopPriceForStage(skillId: string, stageIndex: number): number | undefined {
  const rows = eligibleShopPoolRows(stageIndex).filter(
    (r): r is Extract<ShopPoolRow, { category: 'skillBind' }> => r.category === 'skillBind' && r.skillId === skillId,
  );
  if (rows.length === 0) return undefined;
  const row = rows[0]!;
  return row.price ?? getSkillSpec(skillId)?.shopPrice ?? 7;
}

/** 技能是否在本进度商店池（且 SPECS 存在） */
export function isSkillBindInShopPool(skillId: string, stageIndex: number): boolean {
  if (!getSkillSpec(skillId)) return false;
  return eligibleShopPoolRows(stageIndex).some((r) => r.category === 'skillBind' && r.skillId === skillId);
}
