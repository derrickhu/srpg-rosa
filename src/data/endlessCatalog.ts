import type { AiDifficulty } from '@/battle/ai';
import { playerDeployRowRange } from '@/battle/constants';
import { getTerrainAt, gridSize, type TerrainGrid } from '@/battle/grid';
import type { UnitKind, Vec2 } from '@/battle/types';
import { getTerrainSpec } from '@/data/terrainSpec';
import { CHAPTER1_ROOKIE, STAGES_MVP, type StageEnemySpawn } from '@/data/stagesMvp';
import type { DungeonDef } from '@/data/dungeonCatalog';

/**
 * 无尽试炼：同一张图、布阵一次、按波刷怪。
 *
 * 不进 `DUNGEON_DEFS`——那张表是冒险页的章节列表。塞进去会多出一章「无尽试炼」，
 * 还会让「每个副本都有商店池」这类章节契约误伤它（它没有商店）。
 * `getDungeonDef` 单独认这个 id，存档和 `currentDungeon` 才能找到它。
 */
export const ENDLESS_DUNGEON_ID = 'dungeon_endless';

export const ENDLESS_MAX_WAVES = 10;

/** 清掉一波当场入账的魂晶。每波都给，才对得上「支持的波次越多奖励越多」。 */
export const ENDLESS_WAVE_SOUL = 1;

/** 打完第 10 波的额外魂晶。没有这一笔的话第 10 波和前面 9 波没有区别。 */
export const ENDLESS_CLEAR_BONUS = 5;

/** 击杀掉药的概率。框架先给一个能看见掉落的数，后面再按手感调。 */
export const ENDLESS_DROP_CHANCE = 0.35;

export const ENDLESS_DUNGEON: DungeonDef = {
  id: ENDLESS_DUNGEON_ID,
  name: '无尽试炼',
  desc: '同一战场连续迎敌，最多十波。没有补给点，击杀掉落的药剂要走过去待机拾取。',
  // 单节点只用来给存档和 currentStage 一个落点；波次推进不走 nodeIndex
  nodes: [{ kind: 'battle', name: '试炼场', stageIndex: 0, enemyScale: 1 }],
  roguelikePool: [],
  metaReward: 0,
  enemyScaleBase: 1,
  maxParty: 4,
  unlock: { kind: 'default' },
  themeColor: 0x6a3a8a,
};

export function isEndlessDungeon(id: string): boolean {
  return id === ENDLESS_DUNGEON_ID;
}

/** 无尽用第一章第一关的地形：7×8、两块高地、一块林子，够走位也够认。 */
export function endlessTerrain(): TerrainGrid {
  return STAGES_MVP[0]!.terrain;
}

const KINDS: UnitKind[] = ['sword', 'bow', 'cavalry', 'shield']; // 无尽不刷法师/祭司

/** 第 `wave` 波出几只。从 2 只起，每两波加一只，封顶 6。 */
export function endlessWaveCount(wave: number): number {
  return Math.min(6, 2 + Math.floor((Math.max(1, wave) - 1) / 2));
}

/** 第 `wave` 波的数值缩放。第 1 波和第一章开局同级，后面每波 +15%。 */
export function endlessWaveScale(wave: number): number {
  return 1 + (Math.max(1, wave) - 1) * 0.15;
}

export function endlessAiDifficulty(wave: number): AiDifficulty {
  if (wave <= 3) return 'easy';
  if (wave <= 7) return 'normal';
  return 'hard';
}

function walkable(terrain: TerrainGrid, p: Vec2): boolean {
  return getTerrainSpec(getTerrainAt(terrain, p)).moveCost !== Infinity;
}

function posKey(p: Vec2): string {
  return `${p.x},${p.y}`;
}

/**
 * 给一波敌人抽落点。
 *
 * 优先北侧（非部署行）：玩家从最下两行出发，敌人从对面刷出来才读得懂「下一波来了」。
 * 北侧不够用再放开全图。不踩玩家、不踩不可通行、同一波不叠格。
 */
export function pickEndlessSpawnCells(
  terrain: TerrainGrid,
  occupied: readonly Vec2[],
  count: number,
  rng: () => number = Math.random,
): Vec2[] {
  const { w, h } = gridSize(terrain);
  const [r0] = playerDeployRowRange(h);
  const taken = new Set(occupied.map(posKey));
  const north: Vec2[] = [];
  const rest: Vec2[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = { x, y };
      if (!walkable(terrain, p) || taken.has(posKey(p))) continue;
      if (y < r0) north.push(p);
      else rest.push(p);
    }
  }
  const pool = [...shuffleInPlace(north, rng), ...shuffleInPlace(rest, rng)];
  return pool.slice(0, count);
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** 生成第 `wave` 波的敌人出生点（复用第一章杂兵外貌和数值）。 */
export function generateEndlessWave(
  wave: number,
  terrain: TerrainGrid,
  occupied: readonly Vec2[],
  rng: () => number = Math.random,
): StageEnemySpawn[] {
  const n = endlessWaveCount(wave);
  const cells = pickEndlessSpawnCells(terrain, occupied, n, rng);
  return cells.map((c, i) => {
    const defId = KINDS[(wave - 1 + i) % KINDS.length]!;
    const r = CHAPTER1_ROOKIE[defId];
    return {
      defId,
      x: c.x,
      y: c.y,
      uid: `ew_${wave}_${i}`,
      name: r.name,
      animSet: r.animSet,
      stats: { ...r.stats },
    };
  });
}
