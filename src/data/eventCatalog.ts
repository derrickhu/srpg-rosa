import type { TerrainGrid } from '@/battle/grid';
import type { TroopKind, Vec2 } from '@/battle/types';
import { DUNGEON_DEFS, type DungeonDef } from '@/data/dungeonCatalog';
import { pickEndlessSpawnCells } from '@/data/endlessCatalog';
import {
  CHAPTER1_ROOKIE,
  CHAPTER_STAGE_INDICES,
  STAGES_MVP,
  type StageDefMvp,
  type StageEnemySpawn,
} from '@/data/stagesMvp';

/**
 * 副本页两场限时战。不进冒险章节表。
 *
 * 围猎是同一张草原上的五群兽：先杀头狼，同群其余散掉；头狼活过六回合会吼，
 * 下一群提前进场。连战是已通关章节里最高的三场首领，从弱到强，血和冷却连着打。
 */

export const GRASS_HUNT_DUNGEON_ID = 'dungeon_grass_hunt';
export const BOSS_RUSH_DUNGEON_ID = 'dungeon_boss_rush';

export const HUNT_PACK_TOTAL = 5;
export const HUNT_SOUL = 10;
export const HUNT_CLEAN_SOUL = 4;
export const HUNT_HOWL_AFTER_ROUNDS = 6;
export const HUNT_HOWL_HEAL_RATIO = 0.15;
export const HUNT_HOWL_MIN_HEAL = 8;

export const BOSS_RUSH_FIGHTS = 3;
export const RUSH_SOUL = 18;
export const RUSH_JADE = 1;

export const EVENT_MAX_DEPLOY = 4;

const PACK_COUNTS = [4, 4, 5, 5, 6] as const;
const MOOKS: TroopKind[] = ['sword', 'bow', 'shield', 'cavalry'];

export function isGrassHuntDungeon(id: string): boolean {
  return id === GRASS_HUNT_DUNGEON_ID;
}

export function isBossRushDungeon(id: string): boolean {
  return id === BOSS_RUSH_DUNGEON_ID;
}

export function isEventDungeon(id: string): boolean {
  return isGrassHuntDungeon(id) || isBossRushDungeon(id);
}

export function huntPackCount(pack: number): number {
  const i = Math.min(HUNT_PACK_TOTAL, Math.max(1, pack)) - 1;
  return PACK_COUNTS[i]!;
}

/** 第 1 群 1 倍，之后每群 +12% 血攻。 */
export function huntPackScale(pack: number): number {
  return 1 + (Math.max(1, pack) - 1) * 0.12;
}

export function huntHowlHeal(maxHp: number): number {
  return Math.max(HUNT_HOWL_MIN_HEAL, Math.round(Math.max(1, maxHp) * HUNT_HOWL_HEAL_RATIO));
}

/** 头狼在第 `enteredRound` 回合进场。活过 6 个回合后，下一回合开始时吼。 */
export function huntHowlDue(enteredRound: number, round: number, howled: boolean, alphaAlive: boolean): boolean {
  if (howled || !alphaAlive) return false;
  return round >= enteredRound + HUNT_HOWL_AFTER_ROUNDS;
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 周六和周日共用一个键：那个周六的日期。
 * 不是周末返回 null。
 */
export function grassHuntWeekKey(date: Date): string | null {
  const day = date.getDay();
  if (day !== 6 && day !== 0) return null;
  const sat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (day === 0) sat.setDate(sat.getDate() - 1);
  return ymd(sat);
}

/** 每月 1 日至 7 日。键是 `YYYY-MM`。 */
export function bossRushMonthKey(date: Date): string | null {
  const day = date.getDate();
  if (day < 1 || day > 7) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface EventClaims {
  grassHuntWeek?: string;
  bossRushMonth?: string;
}

export function eventClaimLabel(
  entryId: string,
  meta: { eventClaims?: EventClaims },
  now: Date,
): string | null {
  const claims = meta.eventClaims;
  if (!claims) return null;
  if (entryId === 'event_grass_hunt') {
    const key = grassHuntWeekKey(now);
    return key && claims.grassHuntWeek === key ? '本周已领' : null;
  }
  if (entryId === 'event_boss_rush') {
    const key = bossRushMonthKey(now);
    return key && claims.bossRushMonth === key ? '本月已领' : null;
  }
  return null;
}

const HUNT_BASE = STAGES_MVP[0]!;

/** 围猎固定用第一章第一张草原图，不带那一关原来的两只杂兵。 */
export const GRASS_HUNT_STAGE: StageDefMvp = {
  ...HUNT_BASE,
  name: '草原围猎',
  goldReward: 0,
  enemies: [],
  aiDifficulty: 'normal',
  maxDeploy: EVENT_MAX_DEPLOY,
};

export const GRASS_HUNT_DUNGEON: DungeonDef = {
  id: GRASS_HUNT_DUNGEON_ID,
  name: '草原围猎',
  desc: '五群兽接连扑上。先杀头狼，同群其余会散。头狼撑过六回合会吼，下一群提前进场。',
  nodes: [{ kind: 'battle', name: '围猎', stageIndex: 0, enemyScale: 1 }],
  roguelikePool: [],
  metaReward: 0,
  enemyScaleBase: 1,
  maxParty: EVENT_MAX_DEPLOY,
  unlock: { kind: 'default' },
  themeColor: 0x5a9e3a,
  battleBg: 'battle_bg',
};

export const BOSS_RUSH_DUNGEON: DungeonDef = {
  id: BOSS_RUSH_DUNGEON_ID,
  name: '首领连战',
  desc: '连续挑战三名已通关章节的首领。血量和技能冷却一直留着，中途不回血、不换人。',
  nodes: [{ kind: 'battle', name: '连战', stageIndex: 0, enemyScale: 1 }],
  roguelikePool: [],
  metaReward: 0,
  enemyScaleBase: 1,
  maxParty: EVENT_MAX_DEPLOY,
  unlock: { kind: 'default' },
  themeColor: 0x8a3a3a,
  battleBg: 'battle_bg',
};

function huntRng(seed: number, pack: number): () => number {
  let s = (Math.abs(seed) + pack * 997) % 2147483647;
  if (s <= 0) s = 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 一群兽的摆位。第 0 只是头狼。人数不够格子时少带杂兵，头狼优先。
 */
export function generateHuntPackSpawns(
  pack: number,
  terrain: TerrainGrid,
  occupied: readonly Vec2[],
  seed = 1,
): StageEnemySpawn[] {
  const n = huntPackCount(pack);
  const cells = pickEndlessSpawnCells(terrain, occupied, n, huntRng(seed, pack));
  if (cells.length === 0) return [];
  const wolf = CHAPTER1_ROOKIE.cavalry;
  const out: StageEnemySpawn[] = [];
  cells.forEach((c, i) => {
    if (i === 0) {
      out.push({
        defId: 'cavalry',
        x: c.x,
        y: c.y,
        uid: `hunt_${pack}_0`,
        name: '头狼',
        boss: true,
        animSet: wolf.animSet,
        stats: {
          maxHp: Math.round((wolf.stats.maxHp ?? 70) * 2.4),
          atk: Math.round((wolf.stats.atk ?? 16) * 1.25),
        },
      });
      return;
    }
    const kind = MOOKS[(pack + i) % MOOKS.length]!;
    const r = CHAPTER1_ROOKIE[kind];
    out.push({
      defId: kind,
      x: c.x,
      y: c.y,
      uid: `hunt_${pack}_${i}`,
      name: r.name,
      animSet: r.animSet,
      stats: { ...r.stats },
    });
  });
  return out;
}

/** 已通关的正式章节下标，从第一章起。精英本不算。 */
export function clearedChapterIndexes(meta: { clearedDungeonIds: string[] }): number[] {
  const out: number[] = [];
  DUNGEON_DEFS.forEach((d, i) => {
    if (meta.clearedDungeonIds.includes(d.id)) out.push(i);
  });
  return out;
}

/** 这一章拿去连战的那一关：有首领就用首领，否则用收尾战（草原没有首领关）。 */
export function chapterCapstoneStageIndex(chapterIndex: number): number {
  const idxs = CHAPTER_STAGE_INDICES[chapterIndex];
  if (!idxs || idxs.length === 0) return 0;
  for (let i = idxs.length - 1; i >= 0; i--) {
    const si = idxs[i]!;
    if (STAGES_MVP[si]?.isBoss) return si;
  }
  return idxs[idxs.length - 1]!;
}

/**
 * 已通关里最高的三章，按从弱到强（章节顺序）排列。
 * 不够三章返回空。
 */
export function bossRushStageIndexes(meta: { clearedDungeonIds: string[] }): number[] {
  const cleared = clearedChapterIndexes(meta);
  if (cleared.length < BOSS_RUSH_FIGHTS) return [];
  return cleared.slice(-BOSS_RUSH_FIGHTS).map(chapterCapstoneStageIndex);
}

/** 和主线打这一关时一样：副本基础 × 首领节点 1.1。不乘精英。 */
export function bossRushEnemyScale(stageIndex: number): number {
  const ci = CHAPTER_STAGE_INDICES.findIndex((xs) => xs.includes(stageIndex));
  const d = DUNGEON_DEFS[ci];
  const stage = STAGES_MVP[stageIndex];
  if (!d || !stage) return 1;
  return d.enemyScaleBase * (stage.isBoss ? 1.1 : 1);
}

export function bossRushBattleBg(stageIndex: number): string {
  const ci = CHAPTER_STAGE_INDICES.findIndex((xs) => xs.includes(stageIndex));
  return DUNGEON_DEFS[ci]?.battleBg ?? 'battle_bg';
}
