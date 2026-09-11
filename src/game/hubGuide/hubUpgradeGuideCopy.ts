import { HubUpgradeGuideStep } from './hubUpgradeGuide';

export const HUB_UPGRADE_GUIDE_COPY: Partial<Record<HubUpgradeGuideStep, {
  title: string;
  body: string;
}>> = {
  [HubUpgradeGuideStep.OPEN_ROSTER]: {
    title: '变强从这里开始',
    body: '先打开底部的[[角色]]页。给[[雷恩]]升一级，解锁他的专属纹章。',
  },
  [HubUpgradeGuideStep.TAP_RAYEN]: {
    title: '点开雷恩',
    body: '点[[雷恩]]，打开他的培养。',
  },
  [HubUpgradeGuideStep.TAP_LEVELUP]: {
    title: '升到 2 级',
    body: '点[[升级]]。升一级就会解锁专属纹章，之后战斗里能抽到。',
  },
  [HubUpgradeGuideStep.OPEN_EMBLEM]: {
    title: '看看永久纹章',
    body: '点[[永久纹章]]。打通草原首领后，雷恩身上刻了一枚。',
  },
};
