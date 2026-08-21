import type { UnitArchetypeDef, UnitKind } from '@/battle/types';

/**
 * 兵种默认：基础 / 普攻 拆分。
 * 主动技能施法范围见 `skillCatalog` 的 `SkillSpec.shape`。
 */
export const UNIT_DEFS: Record<UnitKind, UnitArchetypeDef> = {
  sword: {
    id: 'sword',
    name: '剑士',
    base: { maxHp: 100, atk: 18, spd: 5, move: 3 },
    strike: { range: 1, isRanged: false, taunt: false },
  },
  bow: {
    id: 'bow',
    name: '弓手',
    base: { maxHp: 60, atk: 22, spd: 7, move: 2 },
    strike: { range: 3, isRanged: true, taunt: false },
  },
  cavalry: {
    id: 'cavalry',
    name: '骑兵',
    base: { maxHp: 90, atk: 20, spd: 8, move: 4 },
    strike: { range: 1, isRanged: false, taunt: false },
  },
  shield: {
    id: 'shield',
    name: '盾卫',
    base: { maxHp: 150, atk: 10, spd: 3, move: 2 },
    strike: { range: 1, isRanged: false, taunt: true },
  },
  mage: {
    id: 'mage',
    name: '法师',
    base: { maxHp: 52, atk: 24, spd: 6, move: 2 },
    strike: { range: 3, isRanged: true, taunt: false },
  },
  healer: {
    id: 'healer',
    name: '祭司',
    base: { maxHp: 72, atk: 12, spd: 4, move: 2 },
    strike: { range: 2, isRanged: true, taunt: false },
  },
};
