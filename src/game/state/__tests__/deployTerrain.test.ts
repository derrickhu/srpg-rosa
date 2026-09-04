import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { createInitialState, currentStage } from '../GameState';
import { startRun } from '../ProgressManager';
import {
  canPlaceTerrain,
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
