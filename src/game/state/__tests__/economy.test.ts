import { describe, it, expect } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import {
  abandonRun,
  advanceNode,
  applyDungeonClearUnlocks,
  applyVictory,
  finishRunVictory,
  isRunComplete,
  splitStageGold,
  startRun,
  DUNGEON_REPEAT_SOUL,
  NODE_FIRST_CLEAR_SOUL,
  BOSS_FIRST_CLEAR_SOUL,
} from '../ProgressManager';
import { createInitialState, currentNode, type MvpGameState } from '../GameState';

const DUNGEON_ID = DUNGEON_DEFS[0]!.id;

function newGame(): MvpGameState {
  return createInitialState();
}

function party(state: MvpGameState): string[] {
  return state.meta.roster.slice(0, 2).map((m) => m.rosterId);
}

/** 打赢当前节点并推进；商店节点直接过 */
function winCurrentNode(state: MvpGameState): void {
  applyVictory(state);
  advanceNode(state);
}

/** 从头打通整个副本，返回通关入账的魂晶 */
function clearWholeDungeon(state: MvpGameState): number {
  startRun(state, DUNGEON_ID, party(state));
  while (!isRunComplete(state)) winCurrentNode(state);
  applyVictory(state);
  return finishRunVictory(state).soul;
}

describe('击杀拆金币', () => {
  it('总额不变，按击杀份数摊开', () => {
    expect(splitStageGold(8, 3).reduce((a, b) => a + b, 0)).toBe(8);
    expect(splitStageGold(8, 3)).toEqual([3, 3, 2]);
    expect(splitStageGold(8, 10)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
    expect(splitStageGold(5, 0)).toEqual([]);
  });
});

describe('魂晶只按首通发放', () => {
  it('第一次通过某个节点给魂晶，重复打同一节点不再给', () => {
    const s = newGame();
    startRun(s, DUNGEON_ID, party(s));

    applyVictory(s);
    expect(s.run!.lastVictory?.firstClear).toBe(true);
    expect(s.run!.lastVictory?.soul).toBe(NODE_FIRST_CLEAR_SOUL);
    expect(s.meta.metaCurrency).toBe(NODE_FIRST_CLEAR_SOUL);

    // 放弃后重进，再打同一个节点
    abandonRun(s);
    startRun(s, DUNGEON_ID, party(s));
    applyVictory(s);
    expect(s.run!.lastVictory?.firstClear).toBe(false);
    expect(s.run!.lastVictory?.soul).toBe(0);
    expect(s.meta.metaCurrency).toBe(NODE_FIRST_CLEAR_SOUL);
  });

  it('Boss 节点首通给得更多', () => {
    const s = newGame();
    startRun(s, DUNGEON_ID, party(s));
    while (!isRunComplete(s)) winCurrentNode(s);
    expect(currentNode(s).kind).toBe('boss');
    applyVictory(s);
    expect(s.run!.lastVictory?.soul).toBe(BOSS_FIRST_CLEAR_SOUL);
  });

  it('金币始终照发——它是局内货币，和首通与否无关', () => {
    const s = newGame();
    startRun(s, DUNGEON_ID, party(s));
    applyVictory(s);
    const firstGold = s.run!.lastVictory!.gold;
    expect(firstGold).toBeGreaterThan(0);

    abandonRun(s);
    startRun(s, DUNGEON_ID, party(s));
    applyVictory(s);
    expect(s.run!.lastVictory!.gold).toBe(firstGold);
    expect(s.run!.gold).toBe(firstGold);
  });
});

describe('反刷：重复打前几关拿不到永久收益', () => {
  it('「进副本赢两场就跑」重复十次，魂晶不再增长', () => {
    const s = newGame();

    // 第一趟：前两个节点首通，确实给钱
    startRun(s, DUNGEON_ID, party(s));
    winCurrentNode(s);
    winCurrentNode(s);
    abandonRun(s);
    const afterFirst = s.meta.metaCurrency;
    expect(afterFirst).toBeGreaterThan(0);

    // 之后每一趟都打同样的两关，一分不该再进账
    for (let i = 0; i < 10; i += 1) {
      startRun(s, DUNGEON_ID, party(s));
      winCurrentNode(s);
      winCurrentNode(s);
      abandonRun(s);
    }
    expect(s.meta.metaCurrency).toBe(afterFirst);
  });

  it('放弃不没收已经到手的魂晶', () => {
    const s = newGame();
    startRun(s, DUNGEON_ID, party(s));
    applyVictory(s);
    const earned = s.meta.metaCurrency;
    abandonRun(s);
    expect(s.meta.metaCurrency).toBe(earned);
    expect(s.run).toBeNull();
  });

  it('往深处打才有更多收益：推进得越远，累计魂晶越高', () => {
    const shallow = newGame();
    startRun(shallow, DUNGEON_ID, party(shallow));
    winCurrentNode(shallow);
    abandonRun(shallow);

    const deep = newGame();
    startRun(deep, DUNGEON_ID, party(deep));
    winCurrentNode(deep);
    winCurrentNode(deep);
    winCurrentNode(deep);
    abandonRun(deep);

    expect(deep.meta.metaCurrency).toBeGreaterThan(shallow.meta.metaCurrency);
  });
});

describe('整章通关奖励', () => {
  it('首通给副本大奖，重复通关给固定的复刷额度', () => {
    const s = newGame();
    const first = clearWholeDungeon(s);
    expect(first).toBe(DUNGEON_DEFS[0]!.metaReward);

    const second = clearWholeDungeon(s);
    expect(second).toBe(DUNGEON_REPEAT_SOUL);
    expect(second).toBeLessThan(first);
  });

  it('复刷整章仍有收益——否则通关之后就没有可刷的地方了', () => {
    const s = newGame();
    clearWholeDungeon(s);
    const before = s.meta.metaCurrency;
    clearWholeDungeon(s);
    expect(s.meta.metaCurrency).toBeGreaterThan(before);
  });

  it('首通草原解锁奥莉，再调一次不再重复入队', () => {
    const s = newGame();
    expect(s.meta.roster.some((m) => m.rosterId === 'hero_mage_aoli')).toBe(false);
    const first = applyDungeonClearUnlocks(s.meta, 'dungeon_grassland');
    expect(first).toEqual(['hero_mage_aoli']);
    expect(s.meta.roster.some((m) => m.rosterId === 'hero_mage_aoli')).toBe(true);
    expect(applyDungeonClearUnlocks(s.meta, 'dungeon_grassland')).toEqual([]);
  });
});
