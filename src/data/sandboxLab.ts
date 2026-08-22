import { emptyTerrain } from '@/battle/grid';
import type { UnitKind } from '@/battle/types';
import type { DungeonDef } from '@/data/dungeonCatalog';
import type { StageDefMvp, StageEnemySpawn } from '@/data/stagesMvp';

/**
 * 特效试炼：冒险页最后一张卡，不进 `DUNGEON_DEFS`。
 *
 * 正式章节的节点、首通魂晶、扫荡配额都挂在那张表上。试炼若混进去，
 * `stageIntegrity` 会要求它有一章关卡，`applyVictory` 会写通关记录。
 * 单独的 id 才能保证「打完什么都不留下」。
 */
export const SANDBOX_DUNGEON_ID = 'dungeon_vfx_lab';

export function isSandboxDungeon(id: string | undefined | null): boolean {
  return id === SANDBOX_DUNGEON_ID;
}

function dummy(
  defId: UnitKind,
  x: number,
  y: number,
  name: string,
  extra: Partial<StageEnemySpawn> = {},
): StageEnemySpawn {
  return {
    defId,
    x,
    y,
    uid: `lab_${defId}_${x}_${y}`,
    name,
    stats: { maxHp: 2400, atk: 1, spd: 3, move: 2 },
    ...extra,
  };
}

/**
 * 木桩场：上排各职业木桩（看普攻/命中），中排三只 Boss 皮（看敌方技能）。
 * 血厚攻低，方便同一场里把技能连着放完。
 */
export const SANDBOX_STAGE: StageDefMvp = {
  id: 0,
  name: '特效试炼 · 木桩场',
  goldReward: 0,
  terrain: emptyTerrain(8, 10),
  maxDeploy: 6,
  aiDifficulty: 'easy',
  enemies: [
    dummy('sword', 1, 1, '木桩·剑'),
    dummy('bow', 3, 1, '木桩·弓'),
    dummy('mage', 5, 1, '木桩·法'),
    dummy('healer', 7, 1, '木桩·祭'),
    dummy('shield', 2, 2, '木桩·盾'),
    dummy('cavalry', 6, 2, '木桩·骑'),
    dummy('sword', 2, 0, '血牙酋长', {
      skillSkin: 'bloodfang_roar',
      boss: true,
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
    dummy('mage', 4, 0, '血牙萨满', {
      skillSkin: 'bloodfang_wildfire',
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
    dummy('cavalry', 6, 0, '血牙城主', {
      skillSkin: 'bloodfang_breach',
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
  ],
};

export const SANDBOX_DUNGEON: DungeonDef = {
  id: SANDBOX_DUNGEON_ID,
  name: '特效试炼',
  desc: '木桩场。上阵后点角色切技能，开战可连放。不记进度、不发魂晶。',
  nodes: [{ kind: 'battle', name: '木桩场', stageIndex: -1 }],
  roguelikePool: [],
  metaReward: 0,
  enemyScaleBase: 1,
  maxParty: 6,
  unlock: { kind: 'default' },
  themeColor: 0x4a3a6a,
};

/** 冒险页章节：正式五章 + 试炼 */
export function adventureChapterList(official: readonly DungeonDef[]): DungeonDef[] {
  return [...official, SANDBOX_DUNGEON];
}
