import { describe, expect, it } from 'vitest';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { getCharacterDef } from '@/data/characterCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import { createInitialState, currentStage } from '../GameState';
import { startRun } from '../ProgressManager';
import { TutorialStep } from '@/game/tutorial/tutorialSteps';
import {
  TUTORIAL_GRON_ID,
  TUTORIAL_HILL_ID,
  TUTORIAL_RAYEN_ID,
} from '@/game/tutorial/tutorialRules';
import {
  buildBattleUnits,
  placeCharacter,
  placeOrReplaceCharacter,
} from '../DeployManager';

function partyOf(ids: string[]) {
  const s = createInitialState();
  s.meta.tutorialStep = TutorialStep.COMPLETED;
  s.meta.roster = ids.map((id) => instantiateCharacter(getCharacterDef(id)!));
  startRun(s, DUNGEON_DEFS[0]!.id, ids);
  return s;
}

function frontCell(s: ReturnType<typeof partyOf>, x: number) {
  const { h } = gridSize(currentStage(s).terrain);
  const [row] = playerDeployRowRange(h);
  return { x, y: row };
}

describe('布阵点选替换', () => {
  it('选中替补再点阵上的人，直接换上去，开战名单也是换完的人', () => {
    const s = partyOf([TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID, TUTORIAL_GRON_ID]);
    const pos = frontCell(s, 0);
    expect(placeCharacter(s, TUTORIAL_RAYEN_ID, pos)).toBe(true);

    expect(placeOrReplaceCharacter(s, TUTORIAL_HILL_ID, pos)).toBe(true);
    expect(s.run!.placements.map((p) => p.rosterId)).toEqual([TUTORIAL_HILL_ID]);
    expect(s.run!.placements[0]!.pos).toEqual(pos);

    const players = buildBattleUnits(s).filter((u) => u.faction === 'player');
    expect(players).toHaveLength(1);
    expect(players[0]!.pos).toEqual(pos);
    expect(players[0]!.animSet).toBe('bow');
    expect(s.run!.placements.some((p) => p.rosterId === TUTORIAL_RAYEN_ID)).toBe(false);
    expect(s.run!.placements.some((p) => p.rosterId === TUTORIAL_HILL_ID)).toBe(true);
  });

  it('空格仍然是普通上阵', () => {
    const s = partyOf([TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID]);
    const a = frontCell(s, 0);
    const b = frontCell(s, 1);
    expect(placeOrReplaceCharacter(s, TUTORIAL_RAYEN_ID, a)).toBe(true);
    expect(placeOrReplaceCharacter(s, TUTORIAL_HILL_ID, b)).toBe(true);
    expect(s.run!.placements.map((p) => p.rosterId).sort()).toEqual(
      [TUTORIAL_HILL_ID, TUTORIAL_RAYEN_ID].sort(),
    );
  });

  it('满编时替换不超员', () => {
    const s = partyOf([TUTORIAL_RAYEN_ID, TUTORIAL_HILL_ID, TUTORIAL_GRON_ID]);
    const a = frontCell(s, 0);
    const b = frontCell(s, 1);
    expect(placeCharacter(s, TUTORIAL_RAYEN_ID, a)).toBe(true);
    expect(placeCharacter(s, TUTORIAL_HILL_ID, b)).toBe(true);
    const max = s.run!.placements.length;
    expect(placeOrReplaceCharacter(s, TUTORIAL_GRON_ID, a)).toBe(true);
    expect(s.run!.placements).toHaveLength(max);
    expect(s.run!.placements.map((p) => p.rosterId).sort()).toEqual(
      [TUTORIAL_GRON_ID, TUTORIAL_HILL_ID].sort(),
    );
  });
});
