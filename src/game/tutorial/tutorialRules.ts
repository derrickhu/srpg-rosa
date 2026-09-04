import { effectiveUnitDef } from '@/battle/effectiveUnit';
import type { UnitState, Vec2 } from '@/battle/types';
import { UNIT_DEFS } from '@/data/unitDefs';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import { characterArtKey, characterStatsAtLevel, getCharacterDef } from '@/data/characterCatalog';
import { POTION_DEFS } from '@/data/potionCatalog';
import { getSkillSpec, skillDefForId } from '@/data/skillCatalog';
import type { StageEnemySpawn } from '@/data/stagesMvp';
import { instantiateCharacter } from '@/game/characterFactory';
import {
  currentNode,
  currentStage,
  nextPid,
  requireRun,
  type MvpGameState,
  type PlacementEntry,
  type ShopOffer,
} from '@/game/state/GameState';
import { isTutorialActive, isTutorialCompleted, readTutorialStep } from './TutorialManager';
import { TutorialStep } from './tutorialSteps';

export const TUTORIAL_DUNGEON_ID = 'dungeon_grassland';
export const TUTORIAL_RAYEN_ID = 'hero_sword_ray';
export const TUTORIAL_HILL_ID = 'hero_bow_hill';
export const TUTORIAL_GRON_ID = 'hero_shield_gron';

export const BATTLE1_RAYEN_POS: Vec2 = { x: 3, y: 6 };
export const BATTLE1_MOVE_TO: Vec2 = { x: 3, y: 4 };
/** 走过去之后雷恩站在 (3,4)，旋风斩不含自身格，必须点旁边的黏泥怪 */
export const BATTLE1_SKILL_AIM: Vec2 = { x: 3, y: 3 };
export const BATTLE1_HILL_POS: Vec2 = { x: 5, y: 6 };

/** 第 3 战：格隆刷在百夫长脚下前排，进场就能顶上去 */
export const BATTLE3_GRON_SPAWN: Vec2 = { x: 4, y: 3 };

/** 第 2 战布阵：近战前排、远程后排各指定一格，遮罩只漏这一格。 */
export function tutorialDeploySlot(state: MvpGameState, kind: 'sword' | 'bow'): Vec2 {
  const { w, h } = gridSize(currentStage(state).terrain);
  const [front, back] = playerDeployRowRange(h);
  const mid = Math.floor((w - 1) / 2);
  return kind === 'sword'
    ? { x: mid, y: front }
    : { x: Math.min(w - 1, mid + 2), y: back };
}

export const TUTORIAL_BATTLE2_ENEMY_SCALE = 0.65;
export const TUTORIAL_BATTLE3_ENEMY_SCALE = 0.7;

/** 正在打教程那一局草原（未完成前）。重打第一章不走这套。 */
export function isTutorialRun(state: MvpGameState): boolean {
  if (isTutorialCompleted(state.meta)) return false;
  if (!state.run) return false;
  return state.run.dungeonId === TUTORIAL_DUNGEON_ID
    && readTutorialStep(state.meta) !== TutorialStep.NOT_STARTED;
}

export function shouldSkipTutorialDeploy(state: MvpGameState): boolean {
  if (!isTutorialRun(state)) return false;
  return state.run!.nodeIndex === 0 && currentNode(state).kind === 'battle';
}

export function shouldAutostartTutorial(state: MvpGameState): boolean {
  if (isTutorialCompleted(state.meta)) return false;
  return !state.run && readTutorialStep(state.meta) === TutorialStep.NOT_STARTED;
}

export function shouldResumeTutorialRun(state: MvpGameState): boolean {
  return isTutorialActive(state) && Boolean(state.run);
}

export function applyTutorialBattle1Placement(state: MvpGameState): PlacementEntry {
  const run = requireRun(state);
  const entry: PlacementEntry = {
    uid: nextPid(),
    rosterId: TUTORIAL_RAYEN_ID,
    pos: { ...BATTLE1_RAYEN_POS },
  };
  run.placements = [entry];
  return entry;
}

export function tutorialBattle1Enemies(): StageEnemySpawn[] {
  return [
    {
      defId: 'sword',
      x: 3,
      y: 3,
      uid: 'tut_e_slime_a',
      name: '黏泥怪',
      animSet: 'slime',
      stats: { maxHp: 50, atk: 12, spd: 3 },
    },
    {
      defId: 'sword',
      x: 5,
      y: 2,
      uid: 'tut_e_slime_b',
      name: '黏泥怪',
      animSet: 'slime',
      stats: { maxHp: 50, atk: 12, spd: 3 },
    },
  ];
}

export function tutorialEnemyScaleMul(state: MvpGameState): number {
  if (!isTutorialRun(state)) return 1;
  const i = state.run!.nodeIndex;
  if (i === 1) return TUTORIAL_BATTLE2_ENEMY_SCALE;
  if (i === 3) return TUTORIAL_BATTLE3_ENEMY_SCALE;
  return 1;
}

export function buildStoryAllyUnit(rosterId: string, pos: Vec2, uid: string): UnitState {
  const def = getCharacterDef(rosterId);
  if (!def) throw new Error(`Unknown story ally ${rosterId}`);
  const st = characterStatsAtLevel(def, 1);
  const sk = skillDefForId(def.defaultSkillId);
  return {
    uid,
    defId: def.profession,
    faction: 'player',
    hp: st.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: sk
      ? { id: sk.id, name: sk.name, cooldown: sk.cooldown, kind: sk.kind }
      : undefined,
    rosterId: def.id,
    displayName: def.name,
    animSet: characterArtKey({ rosterId: def.id, profession: def.profession }),
    mercMaxHp: st.maxHp,
    mercAtk: st.atk,
    mercSpd: st.spd,
    mercMove: st.move,
  };
}

export function pickEmptyCell(
  taken: readonly Vec2[],
  prefer: Vec2,
  gridW: number,
  gridH: number,
): Vec2 {
  const blocked = new Set(taken.map((p) => `${p.x},${p.y}`));
  if (
    prefer.x >= 0 && prefer.x < gridW && prefer.y >= 0 && prefer.y < gridH
    && !blocked.has(`${prefer.x},${prefer.y}`)
  ) {
    return { ...prefer };
  }
  const [r0, r1] = playerDeployRowRange(gridH);
  for (const y of [r0, r1]) {
    for (let x = 0; x < gridW; x++) {
      if (!blocked.has(`${x},${y}`)) return { x, y };
    }
  }
  return { ...prefer };
}

/** 刷在精英邻格，优先贴在面向玩家的那一侧 */
export function tutorialGronSpawnPos(state: MvpGameState): Vec2 {
  const stage = currentStage(state);
  const { w, h } = gridSize(stage.terrain);
  const elite = stage.enemies.find((e) => e.name?.includes('百夫长')) ?? stage.enemies[0];
  if (!elite) return { ...BATTLE3_GRON_SPAWN };
  const blocked = new Set(stage.enemies.map((e) => `${e.x},${e.y}`));
  const candidates: Vec2[] = [
    { x: elite.x, y: elite.y + 1 },
    { x: elite.x - 1, y: elite.y },
    { x: elite.x + 1, y: elite.y },
    { x: elite.x, y: elite.y - 1 },
  ];
  for (const c of candidates) {
    if (c.x >= 0 && c.x < w && c.y >= 0 && c.y < h && !blocked.has(`${c.x},${c.y}`)) {
      return c;
    }
  }
  return { ...BATTLE3_GRON_SPAWN };
}

export function tutorialScriptedSpawns(state: MvpGameState): { round: number; unit: UnitState; auto: boolean }[] {
  if (!isTutorialRun(state)) return [];
  const i = state.run!.nodeIndex;
  if (i === 0) {
    return [{
      round: 2,
      unit: buildStoryAllyUnit(TUTORIAL_HILL_ID, { ...BATTLE1_HILL_POS }, 'tut_hill'),
      auto: true,
    }];
  }
  if (i === 3) {
    const pos = tutorialGronSpawnPos(state);
    return [{
      round: 2,
      unit: buildStoryAllyUnit(TUTORIAL_GRON_ID, pos, 'tut_gron'),
      auto: true,
    }];
  }
  return [];
}

export function grantStoryCharacter(state: MvpGameState, characterId: string): boolean {
  if (state.meta.roster.some((m) => m.rosterId === characterId)) return false;
  const def = getCharacterDef(characterId);
  if (!def) return false;
  state.meta.roster.push(instantiateCharacter(def));
  if (state.run && !state.run.partyRosterIds.includes(characterId)) {
    state.run.partyRosterIds.push(characterId);
  }
  return true;
}

/** 第 1 战结束后发希尔，第 3 战结束后发格隆。返回刚入队的 id。 */
export function grantTutorialJoinerAfterBattle(state: MvpGameState): string | null {
  if (!isTutorialRun(state) && !isTutorialActive(state)) return null;
  const i = state.run?.nodeIndex;
  if (i === 0 && grantStoryCharacter(state, TUTORIAL_HILL_ID)) return TUTORIAL_HILL_ID;
  if (i === 3 && grantStoryCharacter(state, TUTORIAL_GRON_ID)) return TUTORIAL_GRON_ID;
  return null;
}

export function tutorialShopOffers(): ShopOffer[] {
  const heal = POTION_DEFS.heal;
  const spec = getSkillSpec('temp_gl_snare');
  return [
    { type: 'potion', potionId: 'heal', name: heal.name, price: 5 },
    { type: 'tempSkill', skillId: 'temp_gl_snare', name: spec?.name ?? '野草缠足', price: 6 },
  ];
}

export function isTutorialShop(state: MvpGameState): boolean {
  if (!isTutorialRun(state)) return false;
  return currentNode(state).kind === 'shop';
}

/**
 * 第 3 战敌人被削过，半血几乎打不到。
 * 掉到约 85% 就算「挨过实伤」，和场上雷恩 83/98 对得上。
 */
export const TUTORIAL_POTION_HINT_HP_RATIO = 0.85;

/** 第 3 战：有治疗药、且有活着的自己人掉到提示线以下。 */
export function shouldHintHealPotion(units: readonly UnitState[], healCount: number): boolean {
  if (healCount <= 0) return false;
  return units.some((u) => {
    if (u.faction !== 'player' || u.hp <= 0) return false;
    const max = effectiveUnitDef(u, UNIT_DEFS).maxHp;
    return max > 0 && u.hp < max * TUTORIAL_POTION_HINT_HP_RATIO;
  });
}
