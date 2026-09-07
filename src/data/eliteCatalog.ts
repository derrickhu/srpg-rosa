import type { DungeonDef, NodeDef } from '@/data/dungeonCatalog';
import { ELITE_STAGE_INDICES } from '@/data/stagesMvp';

/**
 * 精英难度：通关对应主线章后解锁的一场硬仗。
 *
 * 不进 `DUNGEON_DEFS`，避免冒险页多滑出六张卡。关卡蓝图追加在 `STAGES_MVP`
 * 末尾，主线章节下标不动。
 */

export const ELITE_FIRST_CLEAR_SOUL = 8;
export const ELITE_REPEAT_SOUL = 5;
export const ELITE_META_REWARD = 12;

const ELITE_STARS: DungeonDef['stars'] = [
  { cond: { kind: 'clear' }, soul: 4 },
  { cond: { kind: 'maxRounds', max: 16 }, soul: 4 },
  { cond: { kind: 'maxDeaths', max: 0 }, soul: 4 },
];

function eliteNodes(stageIndex: number, name: string): NodeDef[] {
  return [{ kind: 'battle', name, stageIndex, enemyScale: 1 }];
}

export const ELITE_DUNGEON_DEFS: readonly DungeonDef[] = [
  {
    id: 'elite_grassland',
    name: '草原战线 · 精英',
    desc: '百夫长带着更多侧翼回来了。通关草原战线后可挑战。',
    nodes: eliteNodes(ELITE_STAGE_INDICES[0]!, '百夫长再战'),
    roguelikePool: [],
    metaReward: ELITE_META_REWARD,
    stars: ELITE_STARS,
    enemyScaleBase: 1.0,
    maxParty: 4,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_grassland' },
    themeColor: 0x5a9e3a,
    art: 'chapter_grassland',
    battleBg: 'battle_bg',
  },
  {
    id: 'elite_forest',
    name: '密林深处 · 精英',
    desc: '猎长把林子守得更死。通关密林深处后可挑战。',
    nodes: eliteNodes(ELITE_STAGE_INDICES[1]!, '猎长再战'),
    roguelikePool: [],
    metaReward: ELITE_META_REWARD,
    stars: ELITE_STARS,
    enemyScaleBase: 1.05,
    maxParty: 4,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_forest' },
    themeColor: 0x3a6a3a,
    art: 'chapter_forest',
    battleBg: 'battle_bg_forest',
  },
  {
    id: 'elite_fortress',
    name: '要塞攻防 · 精英',
    desc: '城卫长还在高地上。开门仍然只是选项。',
    nodes: eliteNodes(ELITE_STAGE_INDICES[2]!, '城卫长再战'),
    roguelikePool: [],
    metaReward: ELITE_META_REWARD,
    stars: ELITE_STARS,
    enemyScaleBase: 1.12,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_fortress' },
    themeColor: 0x8a7a5a,
    art: 'chapter_fortress',
    battleBg: 'battle_bg_fortress',
  },
  {
    id: 'elite_swamp',
    name: '毒沼泥潭 · 精英',
    desc: '沼语者把毒和泥潭叠得更紧。通关毒沼后可挑战。',
    nodes: eliteNodes(ELITE_STAGE_INDICES[3]!, '沼语者再战'),
    roguelikePool: [],
    metaReward: ELITE_META_REWARD,
    stars: ELITE_STARS,
    enemyScaleBase: 1.2,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_swamp' },
    themeColor: 0x5a7a3a,
    art: 'chapter_swamp',
    battleBg: 'battle_bg_swamp',
  },
  {
    id: 'elite_dragon',
    name: '龙岭绝巅 · 精英',
    desc: '龙裔守着裂谷。通关龙岭后可挑战。',
    nodes: eliteNodes(ELITE_STAGE_INDICES[4]!, '龙裔再战'),
    roguelikePool: [],
    metaReward: ELITE_META_REWARD,
    stars: ELITE_STARS,
    enemyScaleBase: 1.3,
    maxParty: 5,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_dragon' },
    themeColor: 0x8a3a3a,
    art: 'chapter_dragon',
    battleBg: 'battle_bg_dragon',
  },
  {
    id: 'elite_bloodfang',
    name: '血牙祭坛 · 精英',
    desc: '酋长还在祭坛上等你。通关血牙祭坛后可挑战。',
    nodes: eliteNodes(ELITE_STAGE_INDICES[5]!, '酋长再战'),
    roguelikePool: [],
    metaReward: ELITE_META_REWARD,
    stars: ELITE_STARS,
    enemyScaleBase: 1.0,
    maxParty: 4,
    unlock: { kind: 'clearDungeon', dungeonId: 'dungeon_bloodfang' },
    themeColor: 0x8a4a2a,
    art: 'chapter_grassland',
    battleBg: 'battle_bg',
  },
];

const ELITE_BY_ID = new Map(ELITE_DUNGEON_DEFS.map((d) => [d.id, d]));
const ELITE_BY_OFFICIAL = new Map(
  ELITE_DUNGEON_DEFS
    .filter((d) => d.unlock.kind === 'clearDungeon')
    .map((d) => [d.unlock.kind === 'clearDungeon' ? d.unlock.dungeonId : '', d]),
);

export function isEliteDungeon(id: string | undefined | null): boolean {
  return !!id && ELITE_BY_ID.has(id);
}

export function getEliteDungeonDef(id: string): DungeonDef | undefined {
  return ELITE_BY_ID.get(id);
}

/** 主线章 id → 对应精英本 */
export function eliteDungeonOf(officialId: string): DungeonDef | undefined {
  return ELITE_BY_OFFICIAL.get(officialId);
}

/** 精英本 id → 对应主线章 id（冒险页仍滑主线卡） */
export function officialDungeonIdOfElite(eliteId: string): string | undefined {
  const d = ELITE_BY_ID.get(eliteId);
  return d?.unlock.kind === 'clearDungeon' ? d.unlock.dungeonId : undefined;
}
