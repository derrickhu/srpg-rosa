import type { MetaState, MvpGameState } from '@/game/state/GameState';
import {
  TutorialStep,
  canAdvanceTutorial,
  isTutorialBefore,
} from './tutorialSteps';

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

/** 老档：已经打过关或名册里已有希尔/格隆，直接标完成，避免再被拉进教程。 */
export function isVeteranMeta(meta: MetaState): boolean {
  if ((meta.clearedDungeonIds?.length ?? 0) > 0) return true;
  if (Object.values(meta.clearedNodesByDungeonId ?? {}).some((n) => n > 0)) return true;
  if (meta.roster.some((m) => m.rosterId === 'hero_bow_hill' || m.rosterId === 'hero_shield_gron')) {
    return true;
  }
  return false;
}

export function hydrateTutorial(meta: MetaState): void {
  if (meta.tutorialStep === TutorialStep.COMPLETED) return;
  if (meta.tutorialStep != null && meta.tutorialStep > TutorialStep.NOT_STARTED) return;
  if (isVeteranMeta(meta)) {
    meta.tutorialStep = TutorialStep.COMPLETED;
    return;
  }
  meta.tutorialStep = TutorialStep.NOT_STARTED;
}

export function startTutorial(state: MvpGameState): void {
  if (isTutorialCompleted(state.meta)) return;
  state.meta.tutorialStep = TutorialStep.BATTLE1_INTRO;
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
