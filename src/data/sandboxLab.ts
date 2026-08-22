import { emptyTerrain } from '@/battle/grid';
import type { UnitKind } from '@/battle/types';
import type { DungeonDef } from '@/data/dungeonCatalog';
import {
  CHAPTER2_FOREST,
  CHAPTER3_GARRISON,
  CHAPTER4_MIRE,
  CHAPTER5_DRAKE,
  type StageDefMvp,
  type StageEnemySpawn,
} from '@/data/stagesMvp';

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
 * 八只会出手的杂兵木桩，按章号从左到右、每排四只。
 *
 * 技能与外观都从 `stagesMvp` 的章节模板读，**不在这里另抄一份 id**：抄下来就会和
 * 关卡里的走岔，而走岔的表现是「试炼场里试的招和实战里放的不是同一个」——
 * 那正好毁掉这个场存在的理由。
 */
const MOOK_SKILL_DUMMIES: StageEnemySpawn[] = [
  CHAPTER2_FOREST,
  CHAPTER3_GARRISON,
  CHAPTER4_MIRE,
  CHAPTER5_DRAKE,
]
  .flatMap((chapter) => Object.values(chapter).filter((t) => t.skillId))
  .map((t, i) =>
    // 都用 sword 底板：这个场只验特效，`defId` 决定的数值和克制在木桩上没有意义
    dummy('sword', (i % 4) * 2 + 1, i < 4 ? 3 : 4, t.name, {
      skillId: t.skillId,
      animSet: t.animSet,
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
  );

/**
 * 木桩场：中排各职业木桩（看普攻/命中），最北一排五只 Boss 皮（看敌方技能）。
 * 血厚攻低，方便同一场里把技能连着放完。
 *
 * Boss 那排**按章号从左到右排**，五个各带自己的 `animSet` 与专属特效，
 * 一屏之内就能比出五种形态（环 / 柱 / 线 / 沉雾 / 锥）有没有撞车——
 * 这是形态区分唯一靠得住的验收方式，靠隔着几关回忆判断不了。
 * 棋盘宽 10 就是为了让这五个隔格站开、特效不互相压。
 */
export const SANDBOX_STAGE: StageDefMvp = {
  id: 0,
  name: '特效试炼 · 木桩场',
  goldReward: 0,
  terrain: emptyTerrain(10, 10),
  maxDeploy: 6,
  aiDifficulty: 'easy',
  enemies: [
    dummy('sword', 1, 1, '木桩·剑'),
    dummy('bow', 3, 1, '木桩·弓'),
    dummy('mage', 5, 1, '木桩·法'),
    dummy('healer', 7, 1, '木桩·祭'),
    dummy('shield', 2, 2, '木桩·盾'),
    dummy('cavalry', 6, 2, '木桩·骑'),
    dummy('sword', 0, 0, '血牙酋长', {
      skillSkin: 'bloodfang_roar',
      animSet: 'bloodfang',
      boss: true,
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
    dummy('mage', 2, 0, '血牙萨满', {
      skillSkin: 'bloodfang_wildfire',
      animSet: 'bloodshaman',
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
    dummy('cavalry', 4, 0, '血牙城主', {
      skillSkin: 'bloodfang_breach',
      animSet: 'bloodcastellan',
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
    dummy('sword', 6, 0, '沼母·蛭后', {
      skillSkin: 'mirequeen_miasma',
      animSet: 'mirequeen',
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
    dummy('sword', 8, 0, '龙王·安卡洛斯', {
      skillSkin: 'drake_cataclysm',
      animSet: 'drakelord',
      stats: { maxHp: 2400, atk: 1, spd: 4, move: 2 },
    }),
    // 会出手的八只杂兵，按章号排两排。它们和 Boss 那排的区别在这里也要看得出来：
    // Boss 五招各有专属序列帧，这八招复用通用图集、只靠章节色和形状区分（见 vfxCatalog）。
    // 摆在同一个场里就是为了验这句话成不成立——如果哪两只放出来分不清，那就是撞了。
    ...MOOK_SKILL_DUMMIES,
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
