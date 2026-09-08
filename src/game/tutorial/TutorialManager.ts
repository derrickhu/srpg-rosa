import { DEFAULT_DUNGEON_IDS } from '@/data/dungeonCatalog';
import type { MetaState, MvpGameState } from '@/game/state/GameState';
import {
  TutorialStep,
  canAdvanceTutorial,
  isTutorialBefore,
} from './tutorialSteps';

const TUTORIAL_DUNGEON_ID = 'dungeon_grassland';
const TUTORIAL_HILL_ID = 'hero_bow_hill';
const TUTORIAL_GRON_ID = 'hero_shield_gron';
const TUTORIAL_CAST = new Set(['hero_sword_ray', TUTORIAL_HILL_ID, TUTORIAL_GRON_ID]);
/** 教程占用草原前 4 个节点（两战 + 店 + 格隆战）。超过就是在继续推图。 */
const TUTORIAL_GRASSLAND_NODE_CAP = 4;

const listeners = new Set<() => void>();

export function subscribeTutorial(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emitTutorial(): void {
  for (const fn of listeners) fn();
}

export function readTutorialStep(meta: MetaState): TutorialStep {
  const raw = meta.tutorialStep;
  if (raw == null) return TutorialStep.NOT_STARTED;
  return raw as TutorialStep;
}

export function isTutorialCompleted(meta: MetaState): boolean {
  return readTutorialStep(meta) >= TutorialStep.COMPLETED;
}

export function isTutorialActive(state: MvpGameState): boolean {
  const step = readTutorialStep(state.meta);
  return step > TutorialStep.NOT_STARTED && step < TutorialStep.COMPLETED;
}

/** 老档没写 tutorialStep：有希尔/格隆/任意首通就算打过。 */
export function isVeteranMeta(meta: MetaState): boolean {
  if ((meta.clearedDungeonIds?.length ?? 0) > 0) return true;
  if (Object.values(meta.clearedNodesByDungeonId ?? {}).some((n) => n > 0)) return true;
  if (meta.roster.some((m) => m.rosterId === TUTORIAL_HILL_ID || m.rosterId === TUTORIAL_GRON_ID)) {
    return true;
  }
  return hasLeftTutorial(meta);
}

/**
 * 已经离开新手该有的进度。云档若还留着半截 tutorialStep，也必须跳过教程，
 * 否则换机 / 清缓存会带着名册再进教学，遮罩指错格子就卡住。
 */
export function hasLeftTutorial(meta: MetaState): boolean {
  if ((meta.clearedDungeonIds?.length ?? 0) > 0) return true;
  if ((meta.endlessBestFloor ?? 0) > 0) return true;
  if (Object.values(meta.chapterStarsByDungeonId ?? {}).some((n) => n > 0)) return true;
  if ((meta.unlockedDungeonIds ?? []).some((id) => !DEFAULT_DUNGEON_IDS.includes(id))) return true;
  if (meta.roster.some((m) => m.rosterId === TUTORIAL_GRON_ID)) return true;
  if (meta.roster.some((m) => !TUTORIAL_CAST.has(m.rosterId))) return true;
  const grassland = meta.clearedNodesByDungeonId?.[TUTORIAL_DUNGEON_ID] ?? 0;
  if (grassland > TUTORIAL_GRASSLAND_NODE_CAP) return true;
  for (const [id, n] of Object.entries(meta.clearedNodesByDungeonId ?? {})) {
    if (id !== TUTORIAL_DUNGEON_ID && n > 0) return true;
  }
  return false;
}

export function hydrateTutorial(meta: MetaState): void {
  if (meta.tutorialStep === TutorialStep.COMPLETED) return;
  if (hasLeftTutorial(meta)) {
    meta.tutorialStep = TutorialStep.COMPLETED;
    return;
  }
  // 开场对白已并进走格子，卡在 INTRO 的老档直接指格子。
  if (meta.tutorialStep === TutorialStep.BATTLE1_INTRO) {
    meta.tutorialStep = TutorialStep.BATTLE1_MOVE;
    return;
  }
  if (meta.tutorialStep != null && meta.tutorialStep > TutorialStep.NOT_STARTED) return;
  if (isVeteranMeta(meta)) {
    meta.tutorialStep = TutorialStep.COMPLETED;
    return;
  }
  meta.tutorialStep = TutorialStep.NOT_STARTED;
}

export function startTutorial(state: MvpGameState): void {
  if (isTutorialCompleted(state.meta)) return;
  state.meta.tutorialStep = TutorialStep.BATTLE1_MOVE;
  emitTutorial();
}

export function advanceTutorial(state: MvpGameState, to: TutorialStep): boolean {
  const from = readTutorialStep(state.meta);
  if (from === to) return true;
  if (!canAdvanceTutorial(from, to)) return false;
  state.meta.tutorialStep = to;
  emitTutorial();
  return true;
}

export function completeTutorial(state: MvpGameState): void {
  state.meta.tutorialStep = TutorialStep.COMPLETED;
  emitTutorial();
}

export function forceCompleteTutorial(state: MvpGameState): void {
  completeTutorial(state);
}

export type TutorialGameEvent =
  | { type: 'refresh' }
  | { type: 'dialogNext' }
  | { type: 'moved'; x: number; y: number }
  | { type: 'skill' }
  | { type: 'round'; n: number }
  | { type: 'spawn'; rosterId: string }
  | { type: 'placed'; rosterId: string }
  | { type: 'bought'; offer: 'potion' | 'tempSkill' }
  | { type: 'shopLeaveReady' }
  | { type: 'pilot' };

/**
 * 把游戏里发生的事推进到下一步。只往前走，不回退。
 */
export function notifyTutorial(state: MvpGameState, ev: TutorialGameEvent): void {
  const step = readTutorialStep(state.meta);
  if (step >= TutorialStep.COMPLETED) return;

  if (ev.type === 'refresh') {
    emitTutorial();
    return;
  }

  if (ev.type === 'dialogNext') {
    if (step === TutorialStep.BATTLE1_INTRO) advanceTutorial(state, TutorialStep.BATTLE1_MOVE);
    else if (step === TutorialStep.BATTLE1_ARCHER_JOIN) {
      advanceTutorial(state, TutorialStep.BATTLE1_WATCH_ARCHER);
    }
    else if (step === TutorialStep.DEPLOY2_INTRO) {
      advanceTutorial(state, TutorialStep.DEPLOY2_PLACE_SWORD);
    }
    else if (step === TutorialStep.SHOP_INTRO) advanceTutorial(state, TutorialStep.SHOP_LEAVE);
    else if (step === TutorialStep.BATTLE3_WATCH_GRON) {
      advanceTutorial(state, TutorialStep.BATTLE3_PLAY);
    }
    return;
  }

  if (ev.type === 'moved' && step === TutorialStep.BATTLE1_MOVE) {
    if (ev.x === 3 && ev.y === 4) advanceTutorial(state, TutorialStep.BATTLE1_SKILL);
    return;
  }

  if (ev.type === 'skill' && step === TutorialStep.BATTLE1_SKILL) {
    // 还没到第 2 回合，希尔没进场。只刷新 Overlay，等 spawn 再切对话。
    emitTutorial();
    return;
  }

  if (ev.type === 'spawn' && ev.rosterId === 'hero_bow_hill') {
    if (isTutorialBefore(step, TutorialStep.BATTLE1_ARCHER_JOIN)) {
      advanceTutorial(state, TutorialStep.BATTLE1_ARCHER_JOIN);
    }
    return;
  }

  if (ev.type === 'spawn' && ev.rosterId === 'hero_shield_gron') {
    if (isTutorialBefore(step, TutorialStep.BATTLE3_WATCH_GRON)) {
      advanceTutorial(state, TutorialStep.BATTLE3_WATCH_GRON);
    }
    return;
  }

  if (ev.type === 'placed') {
    if (step === TutorialStep.DEPLOY2_PLACE_SWORD && ev.rosterId === 'hero_sword_ray') {
      advanceTutorial(state, TutorialStep.DEPLOY2_PLACE_BOW);
    } else if (step === TutorialStep.DEPLOY2_PLACE_BOW && ev.rosterId === 'hero_bow_hill') {
      advanceTutorial(state, TutorialStep.DEPLOY2_START);
    }
    return;
  }

  if (ev.type === 'bought'
    && (step === TutorialStep.SHOP_BUY_POTION || step === TutorialStep.SHOP_INTRO)) {
    advanceTutorial(state, TutorialStep.SHOP_LEAVE);
    return;
  }

  if (ev.type === 'pilot' && step === TutorialStep.BATTLE2_PILOT) {
    advanceTutorial(state, TutorialStep.BATTLE2_WATCH);
  }
}
