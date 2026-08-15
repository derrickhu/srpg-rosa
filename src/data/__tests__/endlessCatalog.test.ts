import { describe, expect, it } from 'vitest';
import { getTerrainAt, gridSize } from '@/battle/grid';
import { getTerrainSpec } from '@/data/terrainSpec';
import {
  ENDLESS_MAX_WAVES,
  endlessAiDifficulty,
  endlessTerrain,
  endlessWaveCount,
  endlessWaveScale,
  generateEndlessWave,
  pickEndlessSpawnCells,
} from '@/data/endlessCatalog';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('无尽试炼波次表', () => {
  it('人数从 2 起每两波加一只，封顶 6', () => {
    expect(endlessWaveCount(1)).toBe(2);
    expect(endlessWaveCount(2)).toBe(2);
    expect(endlessWaveCount(3)).toBe(3);
    expect(endlessWaveCount(9)).toBe(6);
    expect(endlessWaveCount(10)).toBe(6);
    expect(endlessWaveCount(99)).toBe(6);
  });

  it('第 1 波和第一章开局同级，之后每波 +15%', () => {
    expect(endlessWaveScale(1)).toBe(1);
    expect(endlessWaveScale(2)).toBeCloseTo(1.15);
    expect(endlessWaveScale(ENDLESS_MAX_WAVES)).toBeCloseTo(1 + 9 * 0.15);
  });

  it('AI 随波次加难', () => {
    expect(endlessAiDifficulty(1)).toBe('easy');
    expect(endlessAiDifficulty(5)).toBe('normal');
    expect(endlessAiDifficulty(10)).toBe('hard');
  });
});

describe('无尽试炼落点', () => {
  it('不踩占用格、不踩不可通行、同一波不叠格', () => {
    const terrain = endlessTerrain();
    const occupied = [{ x: 3, y: 6 }, { x: 4, y: 6 }];
    const cells = pickEndlessSpawnCells(terrain, occupied, 6, seeded(11));
    expect(cells).toHaveLength(6);
    const keys = cells.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(cells.length);
    for (const p of cells) {
      expect(occupied.some((o) => o.x === p.x && o.y === p.y)).toBe(false);
      expect(getTerrainSpec(getTerrainAt(terrain, p)).moveCost).not.toBe(Infinity);
    }
  });

  it('生成的敌人数量跟波次表走，uid 不重复', () => {
    const terrain = endlessTerrain();
    const { w, h } = gridSize(terrain);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    const wave = generateEndlessWave(4, terrain, [{ x: 1, y: 7 }], seeded(3));
    expect(wave).toHaveLength(endlessWaveCount(4));
    expect(new Set(wave.map((e) => e.uid)).size).toBe(wave.length);
    expect(wave.every((e) => e.defId)).toBe(true);
  });
});
