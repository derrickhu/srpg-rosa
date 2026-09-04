import { TutorialStep } from './tutorialSteps';

export interface TutorialLine {
  title?: string;
  body: string;
  button?: string;
}

export const TUTORIAL_COPY: Partial<Record<TutorialStep, TutorialLine>> = {
  [TutorialStep.BATTLE1_INTRO]: {
    title: '第一场',
    body: '先学会两件事：走到敌人旁边，\n再放出自己的技能。',
    button: '开始',
  },
  [TutorialStep.BATTLE1_MOVE]: {
    body: '点高亮的格子，走到黏泥怪旁边。',
  },
  [TutorialStep.BATTLE1_SKILL]: {
    body: '点技能[[旋风斩]]。\n贴身一圈的敌人都会挨刀。',
  },
  [TutorialStep.BATTLE1_ARCHER_JOIN]: {
    title: '援军',
    body: '射手[[希尔]]赶到了。这一回合先看她自己找位置。',
    button: '看好了',
  },
  [TutorialStep.BATTLE1_WATCH_ARCHER]: {
    body: '远程会自己走位开枪。你继续指挥[[雷恩]]。',
  },
  [TutorialStep.DEPLOY2_INTRO]: {
    title: '布阵',
    body: '开战前要把人放到棋盘最下面两行。先放近战，再放远程。',
    button: '知道了',
  },
  [TutorialStep.DEPLOY2_PLACE_SWORD]: {
    body: '先点[[雷恩]]。',
  },
  [TutorialStep.DEPLOY2_PLACE_BOW]: {
    body: '先点[[希尔]]。',
  },
  [TutorialStep.DEPLOY2_START]: {
    body: '两人就位。点开始战斗。',
  },
  [TutorialStep.BATTLE2_PILOT]: {
    body: '点右下角「托管」。\n这一场交给他们自己打完。',
  },
  [TutorialStep.SHOP_INTRO]: {
    title: '补给点',
    body: '打仗掉的[[金币]]，就在这种摊上花。药和路上用的卷轴都能换，看着眼缘拿。',
    button: '知道了',
  },
  [TutorialStep.BATTLE3_WATCH_GRON]: {
    title: '援军',
    body: '盾卫[[格隆]]赶到了。他会自己顶到前面。',
    button: '看好了',
  },
};

/** 旋风斩已点、正在选范围格 */
export const TUTORIAL_SKILL_AIM_COPY: TutorialLine = {
  body: '点黏泥怪脚下的格子，确认释放。',
};

export const TUTORIAL_DEPLOY_CELL_SWORD_COPY: TutorialLine = {
  body: '再点高亮的空位，放到前排。',
};

export const TUTORIAL_DEPLOY_CELL_BOW_COPY: TutorialLine = {
  body: '放到后排空位。远程别站第一排。',
};

/** 第 3 战用药提醒，不挡操作 */
export const TUTORIAL_POTION_HINT_COPY: TutorialLine = {
  body: '有人撑不住了。左下角那瓶[[治疗药剂]]，现在就能用。',
};
