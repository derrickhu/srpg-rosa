import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { DUNGEON_REPEAT_SOUL } from '@/game/state/ProgressManager';
import { createInitialMeta } from '@/game/state/GameState';
import { C, mix } from '@/view/mvpTheme';
import { chapterRewardModel } from '@/view/AdventureView';

const DUNGEON = DUNGEON_DEFS[0]!;

describe('章节卡奖励分行', () => {
  it('未通关时三星未领、本关奖励先标出来', () => {
    const meta = createInitialMeta();
    const m = chapterRewardModel(DUNGEON, meta);
    expect(m.stars).toHaveLength(3);
    expect(m.stars[0]!.label).toBe('成功通关');
    expect(m.stars.every((s) => !s.claimed && !s.achieved)).toBe(true);
    expect(m.starFilled).toBe(0);
    expect(m.firstClaimed).toBe(false);
    expect(m.repeatSoul).toBe(DUNGEON_REPEAT_SOUL);
    expect(m.pendingNodeFirstClears).toBeGreaterThan(0);
  });

  it('整章通关且星已领完：本关可扫荡，通关奖励全已领取', () => {
    const meta = createInitialMeta();
    meta.clearedDungeonIds.push(DUNGEON.id);
    meta.clearedNodesByDungeonId[DUNGEON.id] = DUNGEON.nodes.length;
    meta.chapterStarsByDungeonId = { [DUNGEON.id]: 0b111 };
    const m = chapterRewardModel(DUNGEON, meta);
    expect(m.firstClaimed).toBe(true);
    expect(m.starFilled).toBe(3);
    expect(m.stars.every((s) => s.claimed && s.achieved)).toBe(true);
    expect(m.pendingNodeFirstClears).toBe(0);
    expect(m.repeatSoul).toBe(DUNGEON_REPEAT_SOUL);
  });

  it('老档已通关但没有星字段：卡上看成三星已领', () => {
    const meta = createInitialMeta();
    meta.clearedDungeonIds.push(DUNGEON.id);
    const m = chapterRewardModel(DUNGEON, meta);
    expect(m.starFilled).toBe(3);
    expect(m.stars.every((s) => s.claimed)).toBe(true);
  });
});

describe('浅底混色', () => {
  it('t=0 / t=1 落回两端，中间不写出新色相', () => {
    expect(mix(C.paper, C.secondary, 0)).toBe(C.paper);
    expect(mix(C.paper, C.secondary, 1)).toBe(C.secondary);
    expect(mix(C.paper, C.secondary, 0.5)).not.toBe(C.paper);
    expect(mix(C.paper, C.secondary, 0.5)).not.toBe(C.secondary);
  });
});
