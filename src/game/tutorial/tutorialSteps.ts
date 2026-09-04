/** 新手引导步骤。编号只保证顺序，实际推进看 `TUTORIAL_SEQUENCE`。 */
export enum TutorialStep {
  NOT_STARTED = 0,
  BATTLE1_INTRO = 1,
  BATTLE1_MOVE = 2,
  BATTLE1_SKILL = 3,
  BATTLE1_ARCHER_JOIN = 4,
  BATTLE1_WATCH_ARCHER = 5,
  HILL_REVEAL = 6,
  DEPLOY2_INTRO = 7,
  DEPLOY2_PLACE_SWORD = 8,
  DEPLOY2_PLACE_BOW = 9,
  DEPLOY2_START = 10,
  SHOP_INTRO = 11,
  SHOP_BUY_POTION = 12,
  SHOP_LEAVE = 13,
  BATTLE3_WATCH_GRON = 14,
  GRON_REVEAL = 15,
  /** 插在布阵开战和商店之间；编号避开已写入存档的 11–15 */
  BATTLE2_PILOT = 16,
  BATTLE2_WATCH = 17,
  BATTLE3_PLAY = 18,
  COMPLETED = 99,
}

export const TUTORIAL_SEQUENCE: readonly TutorialStep[] = [
  TutorialStep.NOT_STARTED,
  TutorialStep.BATTLE1_INTRO,
  TutorialStep.BATTLE1_MOVE,
  TutorialStep.BATTLE1_SKILL,
  TutorialStep.BATTLE1_ARCHER_JOIN,
  TutorialStep.BATTLE1_WATCH_ARCHER,
  TutorialStep.HILL_REVEAL,
  TutorialStep.DEPLOY2_INTRO,
  TutorialStep.DEPLOY2_PLACE_SWORD,
  TutorialStep.DEPLOY2_PLACE_BOW,
  TutorialStep.DEPLOY2_START,
  TutorialStep.BATTLE2_PILOT,
  TutorialStep.BATTLE2_WATCH,
  TutorialStep.SHOP_INTRO,
  TutorialStep.SHOP_BUY_POTION,
  TutorialStep.SHOP_LEAVE,
  TutorialStep.BATTLE3_WATCH_GRON,
  TutorialStep.BATTLE3_PLAY,
  TutorialStep.GRON_REVEAL,
  TutorialStep.COMPLETED,
];

const ORDER = new Map<TutorialStep, number>(
  TUTORIAL_SEQUENCE.map((step, i) => [step, i]),
);

export function tutorialOrder(step: TutorialStep): number {
  return ORDER.get(step) ?? -1;
}

export function canAdvanceTutorial(from: TutorialStep, to: TutorialStep): boolean {
  if (to === TutorialStep.COMPLETED) return from < TutorialStep.COMPLETED;
  return tutorialOrder(to) > tutorialOrder(from);
}

export function isTutorialBefore(step: TutorialStep, milestone: TutorialStep): boolean {
  return tutorialOrder(step) < tutorialOrder(milestone);
}

export function isTutorialAtLeast(step: TutorialStep, milestone: TutorialStep): boolean {
  return tutorialOrder(step) >= tutorialOrder(milestone);
}

export type TutorialScene = 'battle' | 'deploy' | 'shop';

const SCENE_STEPS: Record<TutorialScene, readonly TutorialStep[]> = {
  battle: [
    TutorialStep.BATTLE1_INTRO,
    TutorialStep.BATTLE1_MOVE,
    TutorialStep.BATTLE1_SKILL,
    TutorialStep.BATTLE1_ARCHER_JOIN,
    TutorialStep.BATTLE1_WATCH_ARCHER,
    TutorialStep.BATTLE2_PILOT,
    TutorialStep.BATTLE3_WATCH_GRON,
  ],
  deploy: [
    TutorialStep.DEPLOY2_INTRO,
    TutorialStep.DEPLOY2_PLACE_SWORD,
    TutorialStep.DEPLOY2_PLACE_BOW,
    TutorialStep.DEPLOY2_START,
  ],
  shop: [TutorialStep.SHOP_INTRO],
};

/** 商店离开提示不能带到战场上。 */
export function tutorialSceneAllows(scene: TutorialScene, step: TutorialStep): boolean {
  return SCENE_STEPS[scene].includes(step);
}
