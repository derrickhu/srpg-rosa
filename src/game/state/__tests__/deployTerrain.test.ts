import { describe, expect, it } from 'vitest';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import { createInitialState, currentStage } from '../GameState';
import { startRun } from '../ProgressManager';
import { TutorialStep } from '@/game/tutorial/tutorialSteps';
import {
  canOfferAdExtraSlot,
  canPlaceTerrain,
  getBaseMaxDeploy,
  getMaxDeploy,
  grantAdExtraSlot,
  placeTerrainCell,
  placedTerrainAt,
  removeTerrainCell,
} from '../DeployManager';

function fresh() {
  const s = createInitialState();
  startRun(s, DUNGEON_DEFS[0]!.id, s.meta.roster.slice(0, 2).map((m) => m.rosterId));
  s.run!.terrainCharges.high = 1;
  s.run!.terrainCharges.forest = 1;
  const stage = currentStage(s);
  const pos = { x: 0, y: 0 };
  expect(canPlaceTerrain(s, pos), '测试格必须能放').toBe(true);
  expect(stage.terrain[pos.y]![pos.x]).not.toBe('high');
  return { s, pos };
}

describe('布阵地形收回', () => {
  it('放上去再点下来，券退回库存', () => {
    const { s, pos } = fresh();
    expect(placeTerrainCell(s, pos, 'high')).toBe(true);
    expect(s.run!.terrainCharges.high).toBe(0);
    expect(placedTerrainAt(s, pos)).toBe('high');

    expect(removeTerrainCell(s, pos)).toBe('high');
    expect(s.run!.terrainCharges.high).toBe(1);
    expect(placedTerrainAt(s, pos)).toBeNull();
    expect(s.run!.terrainOverlay).toHaveLength(0);
  });

  it('地图自带的地形收不走', () => {
    const { s } = fresh();
    expect(removeTerrainCell(s, { x: 0, y: 0 })).toBeNull();
    expect(s.run!.terrainCharges.high).toBe(1);
  });

  it('收回之后可以换一种再放', () => {
    const { s, pos } = fresh();
    expect(placeTerrainCell(s, pos, 'high')).toBe(true);
    expect(placeTerrainCell(s, pos, 'forest')).toBe(false);
    removeTerrainCell(s, pos);
    expect(placeTerrainCell(s, pos, 'forest')).toBe(true);
    expect(placedTerrainAt(s, pos)).toBe('forest');
    expect(s.run!.terrainCharges.high).toBe(1);
    expect(s.run!.terrainCharges.forest).toBe(0);
  });
});

describe('广告额外上阵位', () => {
  it('满编且替补还有人时，看广告把上限 +1', () => {
    const s = createInitialState();
    s.meta.roster = CHARACTER_DEFS.slice(0, 4).map(instantiateCharacter);
    startRun(s, DUNGEON_DEFS[0]!.id, s.meta.roster.map((m) => m.rosterId));
    const { h } = gridSize(currentStage(s).terrain);
    const [row] = playerDeployRowRange(h);
    const base = getBaseMaxDeploy(s);
    s.run!.placements = s.meta.roster.slice(0, base).map((m, i) => ({
      uid: `p${i}`,
      rosterId: m.rosterId,
      pos: { x: i, y: row },
    }));

    expect(s.meta.roster.length).toBeGreaterThan(base);
    expect(canOfferAdExtraSlot(s)).toBe(true);
    expect(grantAdExtraSlot(s)).toBe(true);
    expect(getMaxDeploy(s)).toBe(base + 1);
    expect(canOfferAdExtraSlot(s)).toBe(false);
  });

  it('满编但替补没人时，不出广告加位', () => {
    const s = createInitialState();
    s.meta.roster = CHARACTER_DEFS.slice(0, 3).map(instantiateCharacter);
    startRun(s, DUNGEON_DEFS[0]!.id, s.meta.roster.map((m) => m.rosterId));
    // 第一章第三战默认 3 人上限；第一战上限是 2，三人队在那里还会剩一名替补
    s.run!.nodeIndex = 3;
    const { h } = gridSize(currentStage(s).terrain);
    const [row] = playerDeployRowRange(h);
    const base = getBaseMaxDeploy(s);
    s.run!.placements = s.meta.roster.map((m, i) => ({
      uid: `p${i}`,
      rosterId: m.rosterId,
      pos: { x: i, y: row },
    }));

    expect(base).toBe(s.meta.roster.length);
    expect(s.run!.placements).toHaveLength(base);
    expect(canOfferAdExtraSlot(s)).toBe(false);
    expect(grantAdExtraSlot(s)).toBe(false);
  });

  it('教学前两战不给广告加位，后面节点满编可以', () => {
    const s = createInitialState();
    s.meta.roster = CHARACTER_DEFS.slice(0, 4).map(instantiateCharacter);
    s.meta.tutorialStep = TutorialStep.BATTLE3_PLAY;
    startRun(s, DUNGEON_DEFS[0]!.id, s.meta.roster.map((m) => m.rosterId));

    const fill = (): void => {
      const { h } = gridSize(currentStage(s).terrain);
      const [row] = playerDeployRowRange(h);
      const base = getBaseMaxDeploy(s);
      s.run!.placements = s.meta.roster.slice(0, base).map((m, i) => ({
        uid: `p${i}`,
        rosterId: m.rosterId,
        pos: { x: i, y: row },
      }));
    };

    fill();
    expect(s.run!.nodeIndex).toBe(0);
    expect(canOfferAdExtraSlot(s)).toBe(false);

    s.run!.nodeIndex = 1;
    fill();
    expect(canOfferAdExtraSlot(s)).toBe(false);

    s.run!.nodeIndex = 3;
    fill();
    expect(getBaseMaxDeploy(s)).toBeGreaterThanOrEqual(3);
    expect(canOfferAdExtraSlot(s)).toBe(true);
  });
});
