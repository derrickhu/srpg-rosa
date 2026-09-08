import { describe, expect, it } from 'vitest';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import { getCharacterDef } from '@/data/characterCatalog';
import { createInitialState, currentStage } from '../GameState';
import { advanceNode, startRun } from '../ProgressManager';
import { applyCarriedPlacements, undoDeployForRetry } from '../DeployManager';
import { TutorialStep } from '@/game/tutorial/tutorialSteps';
import {
  TUTORIAL_DUNGEON_ID,
  TUTORIAL_HILL_ID,
  TUTORIAL_RAYEN_ID,
} from '@/game/tutorial/tutorialRules';

function partyOf(ids: string[]) {
  const s = createInitialState();
  s.meta.tutorialStep = TutorialStep.COMPLETED;
  s.meta.roster = ids.map((id) => instantiateCharacter(getCharacterDef(id)!));
  startRun(s, DUNGEON_DEFS[0]!.id, ids);
  return s;
}

function placeOnFront(s: ReturnType<typeof createInitialState>, rosterIds: string[]) {
  const { h } = gridSize(currentStage(s).terrain);
  const [row] = playerDeployRowRange(h);
  s.run!.placements = rosterIds.map((rosterId, i) => ({
    uid: `p${i}`,
    rosterId,
    pos: { x: i, y: row },
  }));
}

describe('同一章上阵沿用', () => {
  it('下一关默认沿用同一批人，前后排对齐到新图', () => {
    const s = partyOf([TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID]);
    placeOnFront(s, [TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID]);
    advanceNode(s);
    const { h } = gridSize(currentStage(s).terrain);
    const [front] = playerDeployRowRange(h);
    expect(s.phase).toBe('deploy');
    expect(s.run!.placements.map((p) => ({ rosterId: p.rosterId, pos: p.pos }))).toEqual([
      { rosterId: TUTORIAL_RAYEN_ID, pos: { x: 0, y: front } },
      { rosterId: TUTORIAL_HILL_ID, pos: { x: 1, y: front } },
    ]);
  });

  it('原格超出下一张图时改站空位', () => {
    const s = partyOf([TUTORIAL_RAYEN_ID]);
    s.run!.lastBattlePlacements = [{
      uid: 'p0',
      rosterId: TUTORIAL_RAYEN_ID,
      pos: { x: 99, y: 0 },
    }];
    s.run!.lastBattleGridH = gridSize(currentStage(s).terrain).h;
    applyCarriedPlacements(s);
    const p = s.run!.placements[0];
    expect(p?.rosterId).toBe(TUTORIAL_RAYEN_ID);
    const { h, w } = gridSize(currentStage(s).terrain);
    const [r0, r1] = playerDeployRowRange(h);
    expect(p!.pos.x).toBeGreaterThanOrEqual(0);
    expect(p!.pos.x).toBeLessThan(w);
    expect([r0, r1]).toContain(p!.pos.y);
  });

  it('中间隔着商店，下一战仍沿用', () => {
    const s = partyOf([TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID]);
    s.run!.nodeIndex = 1;
    placeOnFront(s, [TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID]);
    advanceNode(s);
    expect(s.phase).toBe('shop');
    expect(s.run!.placements).toEqual([]);
    advanceNode(s);
    expect(s.phase).toBe('deploy');
    expect(s.run!.placements.map((p) => p.rosterId)).toEqual([
      TUTORIAL_RAYEN_ID,
      TUTORIAL_HILL_ID,
    ]);
  });

  it('教学第二战不沿用，好让玩家自己点近战和远程', () => {
    const s = createInitialState();
    s.meta.tutorialStep = TutorialStep.BATTLE1_WATCH_ARCHER;
    const hill = instantiateCharacter(getCharacterDef(TUTORIAL_HILL_ID)!);
    s.meta.roster.push(hill);
    startRun(s, TUTORIAL_DUNGEON_ID, [TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID]);
    placeOnFront(s, [TUTORIAL_RAYEN_ID]);
    advanceNode(s);
    expect(s.run!.nodeIndex).toBe(1);
    expect(s.run!.placements).toEqual([]);
  });

  it('战败重打不拆上阵，只退地形券', () => {
    const s = partyOf([TUTORIAL_RAYEN_ID]);
    placeOnFront(s, [TUTORIAL_RAYEN_ID]);
    s.run!.terrainCharges.high = 0;
    s.run!.terrainOverlay = [{ x: 1, y: 1, terrain: 'high' }];
    const kept = s.run!.placements[0]!;
    undoDeployForRetry(s);
    expect(s.run!.placements).toEqual([kept]);
    expect(s.run!.terrainOverlay).toEqual([]);
    expect(s.run!.terrainCharges.high).toBe(1);
  });
});
