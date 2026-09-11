import { isEliteDungeon } from '@/data/eliteCatalog';
import type { MetaState, MvpGameState } from '@/game/state/GameState';
import {
  TUTORIAL_DUNGEON_ID,
  TUTORIAL_RAYEN_ID,
} from '@/game/tutorial/tutorialRules';

/**
 * 第一章打完回大厅后的养成指引。
 *
 * 不能塞进 `tutorialStep`：通关时格隆已经入队，`hydrateTutorial` 会把教学写成
 * COMPLETED，大厅步骤会被冲掉。独立字段，老档没有就按进度补。
 */
export const HubUpgradeGuideStep = {
  IDLE: 0,
  OPEN_ROSTER: 1,
  TAP_RAYEN: 2,
  TAP_LEVELUP: 3,
  /** 升完级再看通关拿到的跟人永久纹章 */
  OPEN_EMBLEM: 4,
  /** 专属纹章庆祝上的「准备应战」，只出手、不遮罩 */
  TAP_AWAKEN: 5,
  DONE: 99,
} as const;

export type HubUpgradeGuideStep = (typeof HubUpgradeGuideStep)[keyof typeof HubUpgradeGuideStep];

export const HUB_GUIDE_RAYEN_ID = TUTORIAL_RAYEN_ID;
export const HUB_GUIDE_CHAPTER_ID = TUTORIAL_DUNGEON_ID;

const listeners = new Set<() => void>();

export function subscribeHubUpgradeGuide(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emitHubUpgradeGuide(): void {
  for (const fn of listeners) fn();
}

export function readHubUpgradeGuideStep(meta: MetaState): HubUpgradeGuideStep {
  const raw = meta.hubUpgradeGuideStep;
  if (raw == null) return HubUpgradeGuideStep.IDLE;
  if (raw === HubUpgradeGuideStep.OPEN_ROSTER) return HubUpgradeGuideStep.OPEN_ROSTER;
  if (raw === HubUpgradeGuideStep.TAP_RAYEN) return HubUpgradeGuideStep.TAP_RAYEN;
  if (raw === HubUpgradeGuideStep.TAP_LEVELUP) return HubUpgradeGuideStep.TAP_LEVELUP;
  if (raw === HubUpgradeGuideStep.OPEN_EMBLEM) return HubUpgradeGuideStep.OPEN_EMBLEM;
  if (raw === HubUpgradeGuideStep.TAP_AWAKEN) return HubUpgradeGuideStep.TAP_AWAKEN;
  if (raw >= HubUpgradeGuideStep.DONE) return HubUpgradeGuideStep.DONE;
  return HubUpgradeGuideStep.IDLE;
}

export function isHubUpgradeGuideActive(meta: MetaState): boolean {
  const step = readHubUpgradeGuideStep(meta);
  return step > HubUpgradeGuideStep.IDLE && step < HubUpgradeGuideStep.DONE;
}

function rayenOf(meta: MetaState) {
  return meta.roster.find((m) => m.rosterId === TUTORIAL_RAYEN_ID);
}

/**
 * 已经不是「第一次打完第一章、雷恩还没升级」的人。
 * 升过级、打过后续章、进过无尽，都不该再挡大厅。
 */
export function shouldSkipHubUpgradeGuide(meta: MetaState): boolean {
  if (readHubUpgradeGuideStep(meta) >= HubUpgradeGuideStep.DONE) return true;
  // 升完级还要指永久纹章页。这时雷恩已经是 2 级，不能按「练过了」掐掉。
  if (
    readHubUpgradeGuideStep(meta) === HubUpgradeGuideStep.OPEN_EMBLEM
    || readHubUpgradeGuideStep(meta) === HubUpgradeGuideStep.TAP_AWAKEN
  ) return false;
  const rayen = rayenOf(meta);
  if (!rayen || rayen.level > 1) return true;
  if ((meta.endlessBestFloor ?? 0) > 0) return true;
  return (meta.clearedDungeonIds ?? []).some((id) => id !== TUTORIAL_DUNGEON_ID);
}

export function canOfferHubUpgradeGuide(meta: MetaState): boolean {
  if (shouldSkipHubUpgradeGuide(meta)) return false;
  return (meta.clearedDungeonIds ?? []).includes(TUTORIAL_DUNGEON_ID);
}

export function hydrateHubUpgradeGuide(meta: MetaState): void {
  if (readHubUpgradeGuideStep(meta) >= HubUpgradeGuideStep.DONE) return;
  if (shouldSkipHubUpgradeGuide(meta)) {
    meta.hubUpgradeGuideStep = HubUpgradeGuideStep.DONE;
    return;
  }
  if (!canOfferHubUpgradeGuide(meta)) return;
  // 庆祝层不进存档。读档时若停在「准备应战」，直接去指永久纹章。
  if (readHubUpgradeGuideStep(meta) === HubUpgradeGuideStep.TAP_AWAKEN) {
    meta.hubUpgradeGuideStep = HubUpgradeGuideStep.OPEN_EMBLEM;
    return;
  }
  if (readHubUpgradeGuideStep(meta) === HubUpgradeGuideStep.IDLE) {
    meta.hubUpgradeGuideStep = HubUpgradeGuideStep.OPEN_ROSTER;
  }
}

/** 第一次通关草原后调用。已开始或该跳过时是空操作。 */
export function tryBeginHubUpgradeGuide(meta: MetaState): boolean {
  if (readHubUpgradeGuideStep(meta) >= HubUpgradeGuideStep.DONE) return false;
  if (shouldSkipHubUpgradeGuide(meta)) {
    meta.hubUpgradeGuideStep = HubUpgradeGuideStep.DONE;
    return false;
  }
  if (!canOfferHubUpgradeGuide(meta)) return false;
  if (readHubUpgradeGuideStep(meta) > HubUpgradeGuideStep.IDLE) return false;
  meta.hubUpgradeGuideStep = HubUpgradeGuideStep.OPEN_ROSTER;
  emitHubUpgradeGuide();
  return true;
}

export function setHubUpgradeGuideStep(meta: MetaState, step: HubUpgradeGuideStep): boolean {
  if (readHubUpgradeGuideStep(meta) === step) return false;
  meta.hubUpgradeGuideStep = step;
  emitHubUpgradeGuide();
  return true;
}

export function completeHubUpgradeGuide(meta: MetaState): boolean {
  return setHubUpgradeGuideStep(meta, HubUpgradeGuideStep.DONE);
}

export type HubUpgradeGuideEvent =
  | { type: 'openRoster' }
  | { type: 'openRayen'; rosterId: string }
  | { type: 'leveledRayen'; rosterId?: string }
  | { type: 'confirmAwaken' }
  | { type: 'openEmblemTab'; rosterId?: string };

export function notifyHubUpgradeGuide(state: MvpGameState, ev: HubUpgradeGuideEvent): boolean {
  const step = readHubUpgradeGuideStep(state.meta);
  if (step <= HubUpgradeGuideStep.IDLE || step >= HubUpgradeGuideStep.DONE) return false;

  if (ev.type === 'openRoster') {
    if (step === HubUpgradeGuideStep.OPEN_ROSTER) {
      return setHubUpgradeGuideStep(state.meta, HubUpgradeGuideStep.TAP_RAYEN);
    }
    return false;
  }

  if (ev.type === 'openRayen') {
    if (ev.rosterId !== TUTORIAL_RAYEN_ID) return false;
    if (step === HubUpgradeGuideStep.OPEN_ROSTER || step === HubUpgradeGuideStep.TAP_RAYEN) {
      return setHubUpgradeGuideStep(state.meta, HubUpgradeGuideStep.TAP_LEVELUP);
    }
    return false;
  }

  if (ev.type === 'leveledRayen') {
    if (ev.rosterId && ev.rosterId !== TUTORIAL_RAYEN_ID) return false;
    if (step !== HubUpgradeGuideStep.TAP_LEVELUP) return false;
    return setHubUpgradeGuideStep(state.meta, HubUpgradeGuideStep.TAP_AWAKEN);
  }

  if (ev.type === 'confirmAwaken') {
    if (step !== HubUpgradeGuideStep.TAP_AWAKEN) return false;
    return setHubUpgradeGuideStep(state.meta, HubUpgradeGuideStep.OPEN_EMBLEM);
  }

  if (ev.type === 'openEmblemTab') {
    if (ev.rosterId && ev.rosterId !== TUTORIAL_RAYEN_ID) return false;
    if (step !== HubUpgradeGuideStep.OPEN_EMBLEM) return false;
    return completeHubUpgradeGuide(state.meta);
  }

  return false;
}

/**
 * 当前页该指哪一步。人已经在角色页时，不必再指底栏。
 */
export function visibleHubUpgradeGuideStep(
  meta: MetaState,
  tab: 'recruit' | 'roster' | 'adventure' | 'challenge',
  detailRosterId: string | null,
): HubUpgradeGuideStep {
  const step = readHubUpgradeGuideStep(meta);
  if (step <= HubUpgradeGuideStep.IDLE || step >= HubUpgradeGuideStep.DONE) return step;
  if (step === HubUpgradeGuideStep.TAP_AWAKEN) return HubUpgradeGuideStep.TAP_AWAKEN;
  if (tab !== 'roster') return HubUpgradeGuideStep.OPEN_ROSTER;
  if (detailRosterId === TUTORIAL_RAYEN_ID) {
    if (step === HubUpgradeGuideStep.TAP_LEVELUP) return HubUpgradeGuideStep.TAP_LEVELUP;
    if (step === HubUpgradeGuideStep.OPEN_EMBLEM) return HubUpgradeGuideStep.OPEN_EMBLEM;
  }
  return HubUpgradeGuideStep.TAP_RAYEN;
}

/** 精英通关不算第一章首通，不启动这套指引。 */
export function isHubUpgradeGuideClear(dungeonId: string): boolean {
  return dungeonId === TUTORIAL_DUNGEON_ID && !isEliteDungeon(dungeonId);
}
