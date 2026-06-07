import type { UnitKind, UnitStrikeBlock } from '@/battle/types';
import { defaultSkillId } from '@/data/skillCatalog';

/**
 * 预配置的佣兵卡（非运行时随机生成）。
 * 商店捞取时按 `state.stageIndex` 与池范围过滤，再在候选中随机。
 */
export interface MercenaryTemplate {
  /** 全表唯一，用于去重与商店 offer */
  catalogId: string;
  name: string;
  profession: UnitKind;
  /** 相对兵种 `UNIT_DEFS[profession].base` 的个人基础数值 */
  base: {
    maxHp: number;
    atk: number;
    spd: number;
    move: number;
  };
  /**
   * 覆盖兵种默认普攻面板；缺省字段来自 `UNIT_DEFS[profession].strike`
   *（例如盾卫默认 `taunt: true` 无需在每条模板重复写）
   */
  strike?: Partial<UnitStrikeBlock>;
  ownedSkillIds: string[];
  activeSkillId: string;
  /**
   * 进入商店时 `state.stageIndex >= poolFromStageIndex` 才可被抽到
   *（例如首关胜利后进店时 stageIndex 仍为 0）。
   */
  poolFromStageIndex: number;
  /** 若设置：仅当 `state.stageIndex <= poolUntilStageIndex` 仍在池（含边界） */
  poolUntilStageIndex?: number;
  /** 商店招募价 */
  shopPrice: number;
  /** 为 true 时仅用于开局阵容，不参与商店随机池 */
  isStarter?: boolean;
}

const sid = (k: UnitKind) => defaultSkillId(k);

export const MERCENARY_TEMPLATES: MercenaryTemplate[] = [
  // —— 开局三人（不进商店池）——
  {
    catalogId: 'mvp_st_sword_01',
    name: '雷恩',
    profession: 'sword',
    base: { maxHp: 98, atk: 19, spd: 5, move: 3 },
    ownedSkillIds: [sid('sword')],
    activeSkillId: sid('sword'),
    poolFromStageIndex: 0,
    shopPrice: 5,
    isStarter: true,
  },
  {
    catalogId: 'mvp_st_bow_01',
    name: '希尔',
    profession: 'bow',
    base: { maxHp: 58, atk: 23, spd: 8, move: 2 },
    ownedSkillIds: [sid('bow')],
    activeSkillId: sid('bow'),
    poolFromStageIndex: 0,
    shopPrice: 5,
    isStarter: true,
  },
  {
    catalogId: 'mvp_st_shield_01',
    name: '格隆',
    profession: 'shield',
    base: { maxHp: 148, atk: 11, spd: 3, move: 2 },
    ownedSkillIds: [sid('shield')],
    activeSkillId: sid('shield'),
    poolFromStageIndex: 0,
    shopPrice: 5,
    isStarter: true,
  },
  // —— 商店池：前期（第 0～1 关阶段 index）——
  {
    catalogId: 'shop_sword_02',
    name: '凯尔',
    profession: 'sword',
    base: { maxHp: 102, atk: 17, spd: 6, move: 3 },
    ownedSkillIds: [sid('sword')],
    activeSkillId: sid('sword'),
    poolFromStageIndex: 0,
    poolUntilStageIndex: 1,
    shopPrice: 5,
  },
  {
    catalogId: 'shop_bow_02',
    name: '薇恩',
    profession: 'bow',
    base: { maxHp: 62, atk: 21, spd: 7, move: 2 },
    ownedSkillIds: [sid('bow')],
    activeSkillId: sid('bow'),
    poolFromStageIndex: 0,
    poolUntilStageIndex: 1,
    shopPrice: 6,
  },
  {
    catalogId: 'shop_shield_02',
    name: '石心',
    profession: 'shield',
    base: { maxHp: 155, atk: 10, spd: 4, move: 2 },
    ownedSkillIds: [sid('shield')],
    activeSkillId: sid('shield'),
    poolFromStageIndex: 0,
    poolUntilStageIndex: 1,
    shopPrice: 5,
  },
  {
    catalogId: 'shop_cav_01',
    name: '岚骑',
    profession: 'cavalry',
    base: { maxHp: 88, atk: 21, spd: 9, move: 4 },
    ownedSkillIds: [sid('cavalry')],
    activeSkillId: sid('cavalry'),
    poolFromStageIndex: 0,
    poolUntilStageIndex: 1,
    shopPrice: 7,
  },
  // —— 中后期入池（从第二关阶段 index=1 进店起可出）——
  {
    catalogId: 'shop_sword_03',
    name: '灰刃',
    profession: 'sword',
    base: { maxHp: 105, atk: 20, spd: 5, move: 3 },
    ownedSkillIds: [sid('sword')],
    activeSkillId: sid('sword'),
    poolFromStageIndex: 1,
    shopPrice: 6,
  },
  {
    catalogId: 'shop_bow_03',
    name: '叶羽',
    profession: 'bow',
    base: { maxHp: 55, atk: 24, spd: 7, move: 2 },
    ownedSkillIds: [sid('bow')],
    activeSkillId: sid('bow'),
    poolFromStageIndex: 1,
    shopPrice: 6,
  },
  {
    catalogId: 'shop_cav_02',
    name: '铁蹄',
    profession: 'cavalry',
    base: { maxHp: 92, atk: 19, spd: 8, move: 4 },
    ownedSkillIds: [sid('cavalry')],
    activeSkillId: sid('cavalry'),
    poolFromStageIndex: 1,
    shopPrice: 7,
  },
  {
    catalogId: 'shop_shield_03',
    name: '铁壁',
    profession: 'shield',
    base: { maxHp: 160, atk: 9, spd: 3, move: 2 },
    ownedSkillIds: [sid('shield')],
    activeSkillId: sid('shield'),
    poolFromStageIndex: 1,
    shopPrice: 6,
  },
  // —— 更晚（第三关阶段 index=2 进店起）——
  {
    catalogId: 'shop_sword_04',
    name: '洛萨',
    profession: 'sword',
    base: { maxHp: 110, atk: 18, spd: 6, move: 3 },
    ownedSkillIds: [sid('sword')],
    activeSkillId: sid('sword'),
    poolFromStageIndex: 2,
    shopPrice: 7,
  },
  {
    catalogId: 'shop_bow_04',
    name: '米拉',
    profession: 'bow',
    base: { maxHp: 60, atk: 22, spd: 8, move: 2 },
    ownedSkillIds: [sid('bow')],
    activeSkillId: sid('bow'),
    poolFromStageIndex: 2,
    shopPrice: 7,
  },
];

const BY_ID: Record<string, MercenaryTemplate> = Object.fromEntries(
  MERCENARY_TEMPLATES.map((t) => [t.catalogId, t]),
);

/** 开局强制入队的模板 id（顺序即上场顺序） */
export const STARTER_TEMPLATE_IDS: readonly string[] = [
  'mvp_st_sword_01',
  'mvp_st_bow_01',
  'mvp_st_shield_01',
];

export function getMercenaryTemplate(catalogId: string): MercenaryTemplate | undefined {
  return BY_ID[catalogId];
}

function rosterCatalogIds(roster: { catalogId?: string }[]): Set<string> {
  const s = new Set<string>();
  for (const m of roster) {
    if (m.catalogId) s.add(m.catalogId);
  }
  return s;
}

/** 当前关卡进度与名册下，是否允许招募该模板（商店校验用） */
export function canRecruitTemplateNow(
  tpl: MercenaryTemplate,
  stageIndex: number,
  roster: { catalogId?: string }[],
): boolean {
  if (tpl.isStarter) return false;
  if (rosterCatalogIds(roster).has(tpl.catalogId)) return false;
  if (stageIndex < tpl.poolFromStageIndex) return false;
  if (tpl.poolUntilStageIndex !== undefined && stageIndex > tpl.poolUntilStageIndex) return false;
  return true;
}

/** 当前进度下，商店可随机捞取的佣兵模板 */
export function shopRecruitableTemplates(
  stageIndex: number,
  roster: { catalogId?: string }[],
): MercenaryTemplate[] {
  return MERCENARY_TEMPLATES.filter((t) => canRecruitTemplateNow(t, stageIndex, roster));
}
