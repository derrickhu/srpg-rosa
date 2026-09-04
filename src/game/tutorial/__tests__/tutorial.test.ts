import { describe, expect, it } from 'vitest';
import { createBattleSim } from '@/battle/engine';
import { emptyTerrain } from '@/battle/grid';
import { UNIT_DEFS } from '@/data/unitDefs';
import { STARTER_CHARACTER_IDS } from '@/data/characterCatalog';
import { createInitialState, createInitialMeta } from '@/game/state/GameState';
import { startRun } from '@/game/state/ProgressManager';
import { buyShopOffer, rollShop } from '@/game/state/ShopManager';
import {
  advanceTutorial,
  hydrateTutorial,
  isVeteranMeta,
  notifyTutorial,
  readTutorialStep,
  startTutorial,
} from '@/game/tutorial/TutorialManager';
import { TUTORIAL_COPY } from '@/game/tutorial/TutorialCopy';
import { TutorialStep, isTutorialBefore, tutorialSceneAllows } from '@/game/tutorial/tutorialSteps';
import {
  applyTutorialBattle1Placement,
  BATTLE1_MOVE_TO,
  BATTLE1_SKILL_AIM,
  buildStoryAllyUnit,
  grantStoryCharacter,
  grantTutorialJoinerAfterBattle,
  isTutorialShop,
  shouldHintHealPotion,
  TUTORIAL_POTION_HINT_HP_RATIO,
  shouldSkipTutorialDeploy,
  TUTORIAL_DUNGEON_ID,
  TUTORIAL_GRON_ID,
  TUTORIAL_HILL_ID,
  TUTORIAL_RAYEN_ID,
  tutorialDeploySlot,
  tutorialScriptedSpawns,
  tutorialShopOffers,
  BATTLE3_GRON_SPAWN,
} from '@/game/tutorial/tutorialRules';

describe('开局名册', () => {
  it('只给雷恩', () => {
    expect(STARTER_CHARACTER_IDS).toEqual([TUTORIAL_RAYEN_ID]);
    expect(createInitialMeta().roster.map((m) => m.rosterId)).toEqual([TUTORIAL_RAYEN_ID]);
  });
});

describe('教程进度', () => {
  it('老档有希尔或通关记录则标完成', () => {
    const meta = createInitialMeta();
    meta.roster.push({ ...meta.roster[0]!, rosterId: TUTORIAL_HILL_ID, catalogId: TUTORIAL_HILL_ID });
    expect(isVeteranMeta(meta)).toBe(true);
    hydrateTutorial(meta);
    expect(meta.tutorialStep).toBe(TutorialStep.COMPLETED);
  });

  it('新档从 NOT_STARTED 开始，只能往前走', () => {
    const state = createInitialState();
    expect(readTutorialStep(state.meta)).toBe(TutorialStep.NOT_STARTED);
    startTutorial(state);
    expect(readTutorialStep(state.meta)).toBe(TutorialStep.BATTLE1_INTRO);
    expect(advanceTutorial(state, TutorialStep.BATTLE1_MOVE)).toBe(true);
    expect(advanceTutorial(state, TutorialStep.BATTLE1_INTRO)).toBe(false);
  });

  it('走到指定格才进入技能步', () => {
    const state = createInitialState();
    startTutorial(state);
    advanceTutorial(state, TutorialStep.BATTLE1_MOVE);
    notifyTutorial(state, { type: 'moved', x: 0, y: 0 });
    expect(readTutorialStep(state.meta)).toBe(TutorialStep.BATTLE1_MOVE);
    notifyTutorial(state, { type: 'moved', x: 3, y: 4 });
    expect(readTutorialStep(state.meta)).toBe(TutorialStep.BATTLE1_SKILL);
  });

  it('旋风斩瞄准格是旁边的黏泥怪，不是雷恩自己脚下', () => {
    expect(BATTLE1_SKILL_AIM).toEqual({ x: 3, y: 3 });
    expect(BATTLE1_SKILL_AIM).not.toEqual(BATTLE1_MOVE_TO);
  });

  it('第 2 战点托管后进入旁观，商店提示后自由离开', () => {
    const state = createInitialState();
    startTutorial(state);
    expect(advanceTutorial(state, TutorialStep.BATTLE2_PILOT)).toBe(true);
    notifyTutorial(state, { type: 'pilot' });
    expect(readTutorialStep(state.meta)).toBe(TutorialStep.BATTLE2_WATCH);
    expect(advanceTutorial(state, TutorialStep.SHOP_INTRO)).toBe(true);
    notifyTutorial(state, { type: 'dialogNext' });
    expect(readTutorialStep(state.meta)).toBe(TutorialStep.SHOP_LEAVE);
    expect(isTutorialBefore(TutorialStep.BATTLE2_PILOT, TutorialStep.SHOP_INTRO)).toBe(true);
    expect(isTutorialBefore(TutorialStep.BATTLE2_WATCH, TutorialStep.SHOP_INTRO)).toBe(true);
    expect(TUTORIAL_COPY[TutorialStep.SHOP_INTRO]?.body).toContain('[[金币]]');
    expect(TUTORIAL_COPY[TutorialStep.SHOP_INTRO]?.body).not.toContain('地形');
    expect(tutorialSceneAllows('battle', TutorialStep.SHOP_LEAVE)).toBe(false);
    expect(tutorialSceneAllows('battle', TutorialStep.BATTLE3_WATCH_GRON)).toBe(true);
    expect(TUTORIAL_COPY[TutorialStep.DEPLOY2_PLACE_SWORD]?.body).toContain('[[雷恩]]');
    expect(TUTORIAL_COPY[TutorialStep.DEPLOY2_PLACE_BOW]?.body).toContain('[[希尔]]');
    expect(TUTORIAL_COPY[TutorialStep.BATTLE3_WATCH_GRON]?.body).toContain('[[格隆]]');
    expect(TUTORIAL_COPY[TutorialStep.BATTLE1_SKILL]?.body).toContain('点技能[[旋风斩]]');
    expect(advanceTutorial(state, TutorialStep.BATTLE3_WATCH_GRON)).toBe(true);
    notifyTutorial(state, { type: 'dialogNext' });
    expect(readTutorialStep(state.meta)).toBe(TutorialStep.BATTLE3_PLAY);
  });

  it('第 3 战格隆刷在百夫长旁边，进场就能顶上去', () => {
    const state = createInitialState();
    startTutorial(state);
    startRun(state, TUTORIAL_DUNGEON_ID, [TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID]);
    state.run!.nodeIndex = 3;
    const spawns = tutorialScriptedSpawns(state);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.round).toBe(2);
    expect(spawns[0]!.unit.pos).toEqual(BATTLE3_GRON_SPAWN);
    expect(spawns[0]!.auto).toBe(true);
  });

  it('第 2 战近战放前排、远程放后排，两格不同', () => {
    const state = createInitialState();
    startTutorial(state);
    startRun(state, TUTORIAL_DUNGEON_ID, [TUTORIAL_RAYEN_ID]);
    state.run!.nodeIndex = 1;
    const sword = tutorialDeploySlot(state, 'sword');
    const bow = tutorialDeploySlot(state, 'bow');
    expect(sword.y).toBeLessThan(bow.y);
    expect(sword).not.toEqual(bow);
  });
});

describe('第 3 战血瓶提醒', () => {
  it('有药且自己人掉到提示线以下才提醒', () => {
    const ray = buildStoryAllyUnit(TUTORIAL_RAYEN_ID, { x: 1, y: 1 }, 'p_ray');
    const max = ray.mercMaxHp ?? ray.hp;
    expect(max).toBe(98);
    expect(shouldHintHealPotion([ray], 1)).toBe(false);
    // 场上常见：雷恩 83/98，半血过不了，八成五过得了
    ray.hp = 83;
    expect(83).toBeLessThan(max * TUTORIAL_POTION_HINT_HP_RATIO);
    expect(shouldHintHealPotion([ray], 1)).toBe(true);
    expect(shouldHintHealPotion([ray], 0)).toBe(false);
    ray.hp = Math.ceil(max * TUTORIAL_POTION_HINT_HP_RATIO);
    expect(shouldHintHealPotion([ray], 1)).toBe(false);
    ray.hp = 0;
    expect(shouldHintHealPotion([ray], 1)).toBe(false);
  });
});

describe('教程局覆盖', () => {
  it('第 1 关跳过布阵并写死雷恩站位', () => {
    const state = createInitialState();
    startTutorial(state);
    startRun(state, TUTORIAL_DUNGEON_ID, [TUTORIAL_RAYEN_ID]);
    expect(shouldSkipTutorialDeploy(state)).toBe(true);
    const p = applyTutorialBattle1Placement(state);
    expect(p.rosterId).toBe(TUTORIAL_RAYEN_ID);
    expect(p.pos).toEqual({ x: 3, y: 6 });
  });

  it('商店只出药和技能', () => {
    const state = createInitialState();
    startTutorial(state);
    startRun(state, TUTORIAL_DUNGEON_ID, [TUTORIAL_RAYEN_ID]);
    state.run!.nodeIndex = 2;
    expect(isTutorialShop(state)).toBe(true);
    const offers = rollShop(state);
    expect(offers.map((o) => o.type).sort()).toEqual(['potion', 'tempSkill']);
    expect(offers.some((o) => o.type === 'terrain')).toBe(false);
    expect(tutorialShopOffers()).toHaveLength(2);
  });

  it('教程店按货架价能买，不跟涨价后的章节池打架', () => {
    const state = createInitialState();
    startTutorial(state);
    startRun(state, TUTORIAL_DUNGEON_ID, [TUTORIAL_RAYEN_ID]);
    state.run!.nodeIndex = 2;
    state.run!.gold = 18;
    const heal = tutorialShopOffers().find((o) => o.type === 'potion')!;
    expect(heal.price).toBe(5);
    expect(buyShopOffer(state, heal)).toBe(true);
    expect(state.run!.gold).toBe(13);
    expect(state.run!.potions.heal).toBe(1);
  });

  it('第 1 战胜利发希尔，第 3 战胜利发格隆', () => {
    const state = createInitialState();
    startTutorial(state);
    startRun(state, TUTORIAL_DUNGEON_ID, [TUTORIAL_RAYEN_ID]);
    expect(grantTutorialJoinerAfterBattle(state)).toBe(TUTORIAL_HILL_ID);
    expect(state.meta.roster.some((m) => m.rosterId === TUTORIAL_HILL_ID)).toBe(true);
    expect(state.run!.partyRosterIds).toContain(TUTORIAL_HILL_ID);
    expect(grantStoryCharacter(state, TUTORIAL_HILL_ID)).toBe(false);
    state.run!.nodeIndex = 3;
    expect(grantTutorialJoinerAfterBattle(state)).toBe(TUTORIAL_GRON_ID);
    expect(state.meta.roster.some((m) => m.rosterId === TUTORIAL_GRON_ID)).toBe(true);
  });
});

describe('中途入场', () => {
  it('spawnUnit 加人且 auto 单位不进 pending', () => {
    const ray = buildStoryAllyUnit(TUTORIAL_RAYEN_ID, { x: 1, y: 1 }, 'p_ray');
    const foe = {
      uid: 'e1',
      defId: 'sword' as const,
      faction: 'enemy' as const,
      hp: 40,
      pos: { x: 3, y: 1 },
      skillCd: 0,
      movedInTurn: false,
      mercMaxHp: 40,
      mercAtk: 8,
      mercSpd: 1,
    };
    const sim = createBattleSim([ray, foe], emptyTerrain(7, 6), UNIT_DEFS, { mode: 'manual' });
    sim.stepTurn();
    const hill = buildStoryAllyUnit(TUTORIAL_HILL_ID, { x: 5, y: 4 }, 'p_hill');
    const evs = sim.spawnUnit(hill, true);
    expect(evs.some((e) => e.type === 'spawn')).toBe(true);
    expect(sim.getUnit('p_hill')?.hp).toBeGreaterThan(0);
    // 希尔在 autoUids 里：轮到她时走 AI，不出现 pending
    let sawHillPending = false;
    for (let i = 0; i < 12 && !sim.isDone(); i++) {
      const pending = sim.pending();
      if (pending?.uid === 'p_hill') sawHillPending = true;
      if (pending) sim.commandWait(pending.uid);
      else sim.stepTurn();
    }
    expect(sawHillPending).toBe(false);
  });
});
