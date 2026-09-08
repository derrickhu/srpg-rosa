import { describe, expect, it } from 'vitest';
import { createInitialMeta, createInitialState } from '@/game/state/GameState';
import {
  TUTORIAL_GRON_ID,
  TUTORIAL_HILL_ID,
  TUTORIAL_RAYEN_ID,
} from '@/game/tutorial/tutorialRules';
import {
  HubUpgradeGuideStep,
  canOfferHubUpgradeGuide,
  completeHubUpgradeGuide,
  hydrateHubUpgradeGuide,
  isHubUpgradeGuideActive,
  isHubUpgradeGuideClear,
  notifyHubUpgradeGuide,
  readHubUpgradeGuideStep,
  shouldSkipHubUpgradeGuide,
  tryBeginHubUpgradeGuide,
  visibleHubUpgradeGuideStep,
} from '../hubUpgradeGuide';
import { HUB_UPGRADE_GUIDE_COPY } from '../hubUpgradeGuideCopy';

function ch1Meta() {
  const meta = createInitialMeta();
  meta.clearedDungeonIds = ['dungeon_grassland'];
  meta.roster.push(
    { ...meta.roster[0]!, rosterId: TUTORIAL_HILL_ID, catalogId: TUTORIAL_HILL_ID },
    { ...meta.roster[0]!, rosterId: TUTORIAL_GRON_ID, catalogId: TUTORIAL_GRON_ID },
  );
  return meta;
}

describe('大厅升级指引', () => {
  it('第一次通关草原、雷恩还是 1 级才开', () => {
    const meta = ch1Meta();
    expect(canOfferHubUpgradeGuide(meta)).toBe(true);
    expect(shouldSkipHubUpgradeGuide(meta)).toBe(false);
    expect(tryBeginHubUpgradeGuide(meta)).toBe(true);
    expect(readHubUpgradeGuideStep(meta)).toBe(HubUpgradeGuideStep.OPEN_ROSTER);
    expect(isHubUpgradeGuideActive(meta)).toBe(true);
    expect(tryBeginHubUpgradeGuide(meta)).toBe(false);
  });

  it('雷恩已经升过级就跳过', () => {
    const meta = ch1Meta();
    meta.roster[0]!.level = 2;
    expect(shouldSkipHubUpgradeGuide(meta)).toBe(true);
    expect(tryBeginHubUpgradeGuide(meta)).toBe(false);
    expect(readHubUpgradeGuideStep(meta)).toBe(HubUpgradeGuideStep.DONE);
  });

  it('打过后续章或无尽就跳过', () => {
    const later = ch1Meta();
    later.clearedDungeonIds.push('dungeon_forest');
    expect(shouldSkipHubUpgradeGuide(later)).toBe(true);

    const endless = ch1Meta();
    endless.endlessBestFloor = 3;
    expect(shouldSkipHubUpgradeGuide(endless)).toBe(true);
  });

  it('精英通关不是第一章首通', () => {
    expect(isHubUpgradeGuideClear('dungeon_grassland')).toBe(true);
    expect(isHubUpgradeGuideClear('elite_grassland')).toBe(false);
  });

  it('老档只打过第一章、雷恩还是 1 级，读档后补开', () => {
    const meta = ch1Meta();
    hydrateHubUpgradeGuide(meta);
    expect(readHubUpgradeGuideStep(meta)).toBe(HubUpgradeGuideStep.OPEN_ROSTER);
  });

  it('有格隆不会冲掉这套指引', () => {
    const meta = ch1Meta();
    expect(meta.roster.some((m) => m.rosterId === TUTORIAL_GRON_ID)).toBe(true);
    hydrateHubUpgradeGuide(meta);
    expect(readHubUpgradeGuideStep(meta)).toBe(HubUpgradeGuideStep.OPEN_ROSTER);
  });

  it('按角色页 → 雷恩 → 升级往前走，点错人不进升级步', () => {
    const state = createInitialState();
    state.meta = ch1Meta();
    tryBeginHubUpgradeGuide(state.meta);
    expect(notifyHubUpgradeGuide(state, { type: 'openRoster' })).toBe(true);
    expect(readHubUpgradeGuideStep(state.meta)).toBe(HubUpgradeGuideStep.TAP_RAYEN);
    expect(notifyHubUpgradeGuide(state, { type: 'openRayen', rosterId: TUTORIAL_HILL_ID })).toBe(false);
    expect(notifyHubUpgradeGuide(state, { type: 'openRayen', rosterId: TUTORIAL_RAYEN_ID })).toBe(true);
    expect(readHubUpgradeGuideStep(state.meta)).toBe(HubUpgradeGuideStep.TAP_LEVELUP);
    expect(notifyHubUpgradeGuide(state, { type: 'leveledRayen', rosterId: TUTORIAL_RAYEN_ID })).toBe(true);
    expect(readHubUpgradeGuideStep(state.meta)).toBe(HubUpgradeGuideStep.DONE);
    expect(completeHubUpgradeGuide(state.meta)).toBe(false);
  });

  it('已经在角色页就指雷恩，没打开详情不指升级', () => {
    const meta = ch1Meta();
    meta.hubUpgradeGuideStep = HubUpgradeGuideStep.TAP_LEVELUP;
    expect(visibleHubUpgradeGuideStep(meta, 'adventure', null)).toBe(HubUpgradeGuideStep.OPEN_ROSTER);
    expect(visibleHubUpgradeGuideStep(meta, 'roster', null)).toBe(HubUpgradeGuideStep.TAP_RAYEN);
    expect(visibleHubUpgradeGuideStep(meta, 'roster', TUTORIAL_RAYEN_ID)).toBe(HubUpgradeGuideStep.TAP_LEVELUP);
    expect(visibleHubUpgradeGuideStep(meta, 'roster', TUTORIAL_HILL_ID)).toBe(HubUpgradeGuideStep.TAP_RAYEN);
  });

  it('三步文案都点名要做什么', () => {
    expect(HUB_UPGRADE_GUIDE_COPY[HubUpgradeGuideStep.OPEN_ROSTER]!.body).toContain('[[角色]]');
    expect(HUB_UPGRADE_GUIDE_COPY[HubUpgradeGuideStep.TAP_RAYEN]!.body).toContain('[[雷恩]]');
    expect(HUB_UPGRADE_GUIDE_COPY[HubUpgradeGuideStep.TAP_LEVELUP]!.body).toContain('[[升级]]');
  });
});
