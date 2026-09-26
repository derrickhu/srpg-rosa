import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import { ENDLESS_DUNGEON_ID } from '@/data/endlessCatalog';
import {
  BOSS_RUSH_DUNGEON_ID,
  GRASS_HUNT_DUNGEON_ID,
  bossRushMonthKey,
  clearedChapterIndexes,
  grassHuntWeekKey,
} from '@/data/eventCatalog';
import { DUNGEON_REPEAT_SOUL } from '@/game/state/ProgressManager';
import type { MetaState } from '@/game/state/GameState';

/**
 * 副本页的条目表。
 *
 * 副本页管活动和无尽。章节重打只在冒险页（再开一局 / 扫荡），不在这里再列一份。
 *
 * - `chapterRepeat`：已通关章节派生条目，数据仍由通关记录生成，页面不再画。
 * - `event`：限时活动副本。
 * - `endless`：无尽试炼。
 *
 * 活动按日期和解锁开放。无尽试炼点挑战走 `ENDLESS_DUNGEON_ID`，
 * 两场限时战走各自的副本 id，都不进冒险页章节表。
 */
export type ChallengeKind = 'chapterRepeat' | 'event' | 'endless';

/**
 * 条目当前能不能打。
 *
 * `soon` 和 `locked` 必须分开：前者是「我们还没做」，后者是「你还没到」。
 * 混成一个「未解锁」会让玩家去找一个根本不存在的解锁条件。
 */
export type ChallengeStatus =
  | { kind: 'open' }
  | { kind: 'locked'; reason: string; detail?: string }
  | { kind: 'soon' };

export interface ChallengeEntry {
  id: string;
  kind: ChallengeKind;
  name: string;
  desc: string;
  /** `UI_BUNDLE` 里的小图标 key；插图缺失时的降级 */
  icon: string;
  /**
   * 列表卡左侧大插图，`UI_BUNDLE` 的 key。
   * 章节重打不写这里——走 `DungeonDef.art`，避免同一章在两页各挂一张图。
   */
  illust?: string;
  /** 一句话奖励说明。玩家决定要不要打，看的就是这行 */
  reward: string;
  /** 开放时间描述，如「常驻」「每周六 · 周日」 */
  window: string;
  /** `chapterRepeat` 专用：对应章节 */
  dungeonId?: string;
  /** 解锁条件的人话说明，`locked` 时显示 */
  requirement?: string;
}

/**
 * 静态条目（活动 + 无尽）。
 *
 * 图标暂时借用已有的几张（`tab_challenge` / `node_boss`）。宁可复用也不写一个
 * 不存在的 key——那样卡片上会静默地少一个图标，而这种缺失只有真机上才看得见。
 */
export const CHALLENGE_ENTRIES: readonly ChallengeEntry[] = [
  {
    id: 'event_grass_hunt',
    kind: 'event',
    name: '草原围猎',
    desc: '五群兽接连扑上。先杀头狼，同群其余会散。头狼撑过六回合会吼，下一群提前进场。没有补给点。',
    icon: 'tab_challenge',
    illust: 'illust_hunt',
    reward: '魂晶 ×10 · 开局稀有词条三选一',
    window: '每周六 · 周日',
    dungeonId: GRASS_HUNT_DUNGEON_ID,
  },
  {
    id: 'event_boss_rush',
    kind: 'event',
    name: '首领连战',
    desc: '连续挑战三名已通关章节的首领。血量和技能冷却一直留着，中途不回血、不换人。',
    icon: 'node_boss',
    illust: 'illust_boss',
    reward: '魂晶 ×18 · 纹玉 ×1',
    window: '每月首周',
    dungeonId: BOSS_RUSH_DUNGEON_ID,
  },
  {
    id: 'endless_trial',
    kind: 'endless',
    name: '无尽试炼',
    desc: '波次递增，敌人越打越强，直到全队倒下。每天 3 次，冒险进度保留。',
    icon: 'tab_challenge',
    illust: 'illust_endless',
    reward: '按层数给魂晶，破纪录另奖',
    window: '常驻',
    dungeonId: ENDLESS_DUNGEON_ID,
  },
];

/** 已通关章节 → 重挑战条目（顺序跟随章节表） */
export function chapterRepeatEntries(meta: MetaState): ChallengeEntry[] {
  return DUNGEON_DEFS.filter((d) => meta.clearedDungeonIds.includes(d.id)).map((d) => ({
    id: `repeat_${d.id}`,
    kind: 'chapterRepeat' as const,
    name: d.name,
    desc: d.desc,
    icon: 'tab_adventure',
    // 和扫荡口径对齐：重复通关整章照样给魂晶，每日次数才是天花板（见 `sweepQuota`）
    reward: `重复通关魂晶 ×${DUNGEON_REPEAT_SOUL} · 每日可扫荡`,
    window: '常驻',
    dungeonId: d.id,
  }));
}

export function challengeStatus(
  entry: ChallengeEntry,
  meta: MetaState,
  now: Date = new Date(),
): ChallengeStatus {
  if (entry.kind === 'endless') return { kind: 'open' };
  if (entry.kind === 'chapterRepeat') {
    const cleared = !!entry.dungeonId && meta.clearedDungeonIds.includes(entry.dungeonId);
    return cleared ? { kind: 'open' } : { kind: 'locked', reason: '尚未通关' };
  }
  if (entry.id === 'event_grass_hunt') {
    if (!meta.clearedDungeonIds.includes('dungeon_grassland')) {
      return {
        kind: 'locked',
        reason: '通关第一章',
        detail: '通关草原战线后才能参加围猎',
      };
    }
    if (!grassHuntWeekKey(now)) {
      return { kind: 'locked', reason: '周六日开放', detail: '每周六、周日开放' };
    }
    return { kind: 'open' };
  }
  if (entry.id === 'event_boss_rush') {
    if (clearedChapterIndexes(meta).length < 3) {
      return {
        kind: 'locked',
        reason: '通关三章',
        detail: '通关三章后才能参加连战',
      };
    }
    if (!bossRushMonthKey(now)) {
      return { kind: 'locked', reason: '每月首周', detail: '每月 1 日至 7 日开放' };
    }
    return { kind: 'open' };
  }
  return { kind: 'soon' };
}

/** 无尽试炼当前记录（老存档没有这个字段，缺省 0） */
export function endlessBestFloor(meta: MetaState): number {
  return meta.endlessBestFloor ?? 0;
}

/** `chapterRepeat` 条目对应的章节定义 */
export function challengeDungeon(entry: ChallengeEntry) {
  return entry.dungeonId ? getDungeonDef(entry.dungeonId) : undefined;
}

/**
 * 列表卡左侧该画哪张图。
 *
 * 章节重打用章节卡同一张插图（`DungeonDef.art`），活动和无尽用各自的 illust。
 * 两路都没有才返回 null，卡片退回小图标。
 */
export function challengeArt(
  entry: ChallengeEntry,
): { bundle: 'bg' | 'ui'; key: string; mode: 'cover' | 'contain' } | null {
  if (entry.kind === 'chapterRepeat') {
    const art = challengeDungeon(entry)?.art;
    if (art) return { bundle: 'bg', key: art, mode: 'cover' };
    return { bundle: 'ui', key: 'illust_repeat', mode: 'cover' };
  }
  if (entry.illust) return { bundle: 'ui', key: entry.illust, mode: 'cover' };
  return null;
}
