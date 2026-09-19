import { describe, expect, it } from 'vitest';
import { getTerrainAt, gridSize } from '@/battle/grid';
import { getTerrainSpec } from '@/data/terrainSpec';
import {
  CHAPTER1_ROOKIE,
  CHAPTER2_FOREST,
  CHAPTER3_GARRISON,
  CHAPTER4_MIRE,
  CHAPTER5_DRAKE,
  CHAPTER6_RITE,
} from '@/data/stagesMvp';
import {
  ENDLESS_MILESTONE_EVERY,
  ENDLESS_MILESTONE_SOUL,
  endlessAiDifficulty,
  endlessMilestoneSoul,
  endlessRecordBonus,
  endlessTerrain,
  endlessWaveChapter,
  endlessWaveCount,
  endlessWaveScale,
  endlessWaveSoul,
  endlessWaveVictorySoul,
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

  it('前 10 波每波 +15%，之后每波 +20%', () => {
    expect(endlessWaveScale(1)).toBe(1);
    expect(endlessWaveScale(2)).toBeCloseTo(1.15);
    expect(endlessWaveScale(ENDLESS_MILESTONE_EVERY)).toBeCloseTo(1 + 9 * 0.15);
    expect(endlessWaveScale(11)).toBeCloseTo(1 + 9 * 0.15 + 0.2);
    expect(endlessWaveScale(16)).toBeCloseTo(1 + 9 * 0.15 + 6 * 0.2);
  });

  it('按波换章节怪物表', () => {
    expect(endlessWaveChapter(1)).toBe(1);
    expect(endlessWaveChapter(3)).toBe(1);
    expect(endlessWaveChapter(4)).toBe(2);
    expect(endlessWaveChapter(7)).toBe(3);
    expect(endlessWaveChapter(10)).toBe(4);
    expect(endlessWaveChapter(13)).toBe(5);
    expect(endlessWaveChapter(16)).toBe(6);
  });

  it('程序决策随波次加难', () => {
    expect(endlessAiDifficulty(1)).toBe('easy');
    expect(endlessAiDifficulty(5)).toBe('normal');
    expect(endlessAiDifficulty(10)).toBe('hard');
  });
});

describe('无尽试炼魂晶公式', () => {
  it('每波随层涨：第 1 波 1，第 5 波 3，第 10 波 5', () => {
    expect(endlessWaveSoul(1)).toBe(1);
    expect(endlessWaveSoul(5)).toBe(3);
    expect(endlessWaveSoul(10)).toBe(5);
    expect(endlessWaveSoul(11)).toBe(6);
  });

  it('每清完 10 的倍数当场加里程碑', () => {
    expect(endlessMilestoneSoul(9)).toBe(0);
    expect(endlessMilestoneSoul(10)).toBe(ENDLESS_MILESTONE_SOUL);
    expect(endlessMilestoneSoul(20)).toBe(ENDLESS_MILESTONE_SOUL);
    expect(endlessWaveVictorySoul(10)).toBe(5 + ENDLESS_MILESTONE_SOUL);
  });

  it('破纪录奖是新纪录减旧纪录', () => {
    expect(endlessRecordBonus(0, 7)).toBe(7);
    expect(endlessRecordBonus(7, 10)).toBe(3);
    expect(endlessRecordBonus(10, 8)).toBe(0);
  });
});

describe('无尽试炼落点', () => {
  it('不踩占用格、不踩不可通行、同一波不叠格', () => {
    const terrain = endlessTerrain();
    const occupied = [{ x: 3, y: 6 }, { x: 4, y: 6 }, { x: 2, y: 1 }];
    const cells = pickEndlessSpawnCells(terrain, occupied, 6, seeded(11));
    expect(cells).toHaveLength(6);
    const keys = cells.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(cells.length);
    for (const p of cells) {
      expect(occupied.some((o) => o.x === p.x && o.y === p.y)).toBe(false);
      expect(getTerrainSpec(getTerrainAt(terrain, p)).moveCost).not.toBe(Infinity);
    }
  });

  it('第 1 波用第一章新兵名，第 4 波用第二章并带后排技能', () => {
    const terrain = endlessTerrain();
    const { w, h } = gridSize(terrain);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    const wave1 = generateEndlessWave(1, terrain, [{ x: 1, y: 7 }], seeded(3));
    expect(wave1).toHaveLength(endlessWaveCount(1));
    expect(wave1.every((e) => Object.values(CHAPTER1_ROOKIE).some((r) => r.name === e.name))).toBe(true);

    const wave4 = generateEndlessWave(4, terrain, [{ x: 1, y: 7 }], seeded(3));
    expect(wave4).toHaveLength(endlessWaveCount(4));
    expect(new Set(wave4.map((e) => e.uid)).size).toBe(wave4.length);
    expect(wave4.every((e) => Object.values(CHAPTER2_FOREST).some((r) => r.name === e.name))).toBe(true);
    expect(wave4.some((e) => e.skillId === CHAPTER2_FOREST.bow.skillId)).toBe(true);
  });

  it('后期波换到对应章节表', () => {
    const terrain = endlessTerrain();
    const occ = [{ x: 1, y: 7 }];
    const names = (wave: number) => generateEndlessWave(wave, terrain, occ, seeded(8)).map((e) => e.name);
    expect(names(8).every((n) => Object.values(CHAPTER3_GARRISON).some((r) => r.name === n))).toBe(true);
    expect(names(11).every((n) => Object.values(CHAPTER4_MIRE).some((r) => r.name === n))).toBe(true);
    expect(names(14).every((n) => Object.values(CHAPTER5_DRAKE).some((r) => r.name === n))).toBe(true);
    expect(names(20).every((n) => Object.values(CHAPTER6_RITE).some((r) => r.name === n))).toBe(true);
  });
});
