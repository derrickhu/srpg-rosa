import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import {
  DUNGEON_REPEAT_SOUL,
  advanceNode,
  applyDungeonClearUnlocks,
  canSweep,
  consumeSweep,
  finishRunVictory,
  nodeClearedBefore,
  startRun,
  sweepLeftToday,
  sweepQuota,
  sweepUsedToday,
} from '../ProgressManager';
import { createInitialState, type MvpGameState } from '../GameState';

const DUNGEON = DUNGEON_DEFS[0]!;
const BATTLE_NODES = DUNGEON.nodes.filter((n) => n.kind !== 'shop').length;

function newRun(): MvpGameState {
  const s = createInitialState();
  startRun(s, DUNGEON.id, s.meta.roster.slice(0, 3).map((m) => m.rosterId));
  return s;
}

/** 把整章标成打通过：扫荡的前提是这一关赢过 */
function markAllCleared(s: MvpGameState): void {
  s.meta.clearedNodesByDungeonId[DUNGEON.id] = DUNGEON.nodes.length;
}

/** 走到下一个战斗节点（跳过商店） */
function advanceToBattle(s: MvpGameState): void {
  do {
    advanceNode(s);
  } while (DUNGEON.nodes[s.run!.nodeIndex]!.kind === 'shop');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('扫荡资格', () => {
  it('没打赢过的关不能扫荡：扫荡是兑现已有结果，不是白送通关', () => {
    const s = newRun();
    expect(nodeClearedBefore(s)).toBe(false);
    expect(canSweep(s)).toBe(false);
  });

  it('打赢过的关可以扫荡', () => {
    const s = newRun();
    markAllCleared(s);
    expect(canSweep(s)).toBe(true);
  });

  it('商店节点不参与扫荡，也不吃配额', () => {
    const s = newRun();
    markAllCleared(s);
    // 走到第一个商店节点
    while (DUNGEON.nodes[s.run!.nodeIndex]!.kind !== 'shop') advanceNode(s);
    expect(nodeClearedBefore(s)).toBe(false);
    expect(canSweep(s)).toBe(false);
  });
});

describe('每日扫荡配额', () => {
  it('配额按副本长度给，够完整扫一轮——不会扫到一半被扣下', () => {
    expect(sweepQuota(DUNGEON.id)).toBe(BATTLE_NODES);
    for (const d of DUNGEON_DEFS) {
      const battles = d.nodes.filter((n) => n.kind !== 'shop').length;
      expect(sweepQuota(d.id), `${d.name} 的配额不足一轮`).toBeGreaterThanOrEqual(battles);
    }
  });

  it('扫满一轮后当天就扫不动了', () => {
    const s = newRun();
    markAllCleared(s);
    for (let i = 0; i < BATTLE_NODES; i += 1) {
      expect(canSweep(s), `第 ${i + 1} 次扫荡应该还有配额`).toBe(true);
      consumeSweep(s);
      if (i < BATTLE_NODES - 1) advanceToBattle(s);
    }
    expect(sweepLeftToday(s.meta, DUNGEON.id)).toBe(0);
    expect(canSweep(s)).toBe(false);
  });

  it('配额按副本分开算：草原扫空了，密林还是满的', () => {
    const s = newRun();
    markAllCleared(s);
    consumeSweep(s);
    const other = DUNGEON_DEFS[1]!;
    expect(sweepUsedToday(s.meta, DUNGEON.id)).toBe(1);
    expect(sweepUsedToday(s.meta, other.id)).toBe(0);
    expect(sweepLeftToday(s.meta, other.id)).toBe(sweepQuota(other.id));
  });

  it('跨天恢复', () => {
    const s = newRun();
    markAllCleared(s);
    consumeSweep(s);
    expect(sweepUsedToday(s.meta, DUNGEON.id)).toBe(1);

    vi.setSystemTime(new Date(2026, 7, 15, 0, 30, 0));
    expect(sweepUsedToday(s.meta, DUNGEON.id)).toBe(0);
    expect(canSweep(s)).toBe(true);
  });

  it('时钟回拨也当作新的一天，不会把玩家锁在零次上', () => {
    // 存的日期只要不等于今天就归零。宁可让改时钟的人白拿额度，也不能让跨时区
    // 或夏令时的正常玩家永远扫不了——那是个玩家完全无法自救的死锁。
    const s = newRun();
    markAllCleared(s);
    for (let i = 0; i < BATTLE_NODES; i += 1) consumeSweep(s);
    expect(canSweep(s)).toBe(false);

    vi.setSystemTime(new Date(2026, 7, 13, 12, 0, 0));
    expect(canSweep(s)).toBe(true);
  });

  it('配额是当天用掉的次数，不随进新副本重置', () => {
    const s = newRun();
    markAllCleared(s);
    consumeSweep(s);
    consumeSweep(s);
    // 重开一局（放弃后再进）不该刷新配额，否则限制形同不存在
    startRun(s, DUNGEON.id, s.meta.roster.slice(0, 3).map((m) => m.rosterId));
    expect(sweepUsedToday(s.meta, DUNGEON.id)).toBe(2);
    expect(sweepLeftToday(s.meta, DUNGEON.id)).toBe(BATTLE_NODES - 2);
  });
});

describe('扫荡的奖励和手打一样', () => {
  it('用了扫荡也照拿整章重复通关的魂晶', () => {
    // 这条是扫荡存在的理由。奖励一削，通关后的玩家就没有任何理由点它——
    // 刷取该由每日配额去限，而不是让按钮本身变得没用。
    const s = newRun();
    markAllCleared(s);
    applyDungeonClearUnlocks(s.meta, DUNGEON.id);
    s.run!.nodeIndex = DUNGEON.nodes.length - 1;
    consumeSweep(s);

    const before = s.meta.metaCurrency;
    const gained = finishRunVictory(s);
    expect(gained).toBe(DUNGEON_REPEAT_SOUL);
    expect(s.meta.metaCurrency).toBe(before + DUNGEON_REPEAT_SOUL);
  });
});
