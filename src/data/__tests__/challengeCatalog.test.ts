import { describe, expect, it } from 'vitest';
import { UI_BUNDLE } from '@/core/assetBundles';
import {
  CHALLENGE_ENTRIES,
  challengeDungeon,
  challengeStatus,
  chapterRepeatEntries,
  endlessBestFloor,
} from '@/data/challengeCatalog';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { createInitialMeta } from '@/game/state/GameState';

describe('副本页条目表', () => {
  it('每条都有名称、说明、奖励、时限', () => {
    for (const e of CHALLENGE_ENTRIES) {
      expect(e.name.length, `${e.id} 缺名称`).toBeGreaterThan(0);
      expect(e.desc.length, `${e.id} 缺说明`).toBeGreaterThan(0);
      // 奖励行是玩家决定要不要打的唯一依据，空着这张卡就没有存在意义
      expect(e.reward.length, `${e.id} 缺奖励说明`).toBeGreaterThan(0);
      expect(e.window.length, `${e.id} 缺开放时间`).toBeGreaterThan(0);
    }
  });

  // 图标 key 写错不会报错，只会静默少一张图，而那只在真机上看得见
  it('图标都在 ui bundle 里登记过', () => {
    for (const e of CHALLENGE_ENTRIES) {
      expect(UI_BUNDLE.assets[e.icon], `条目「${e.name}」的图标 ${e.icon} 未登记`).toBeDefined();
    }
    for (const e of chapterRepeatEntries({
      ...createInitialMeta(),
      clearedDungeonIds: DUNGEON_DEFS.map((d) => d.id),
    })) {
      expect(UI_BUNDLE.assets[e.icon], `章节条目「${e.name}」的图标未登记`).toBeDefined();
    }
  });

  it('id 唯一', () => {
    const ids = new Set(CHALLENGE_ENTRIES.map((e) => e.id));
    expect(ids.size).toBe(CHALLENGE_ENTRIES.length);
  });

  it('活动与无尽两类都有条目，页面不会出现空分区', () => {
    expect(CHALLENGE_ENTRIES.some((e) => e.kind === 'event')).toBe(true);
    expect(CHALLENGE_ENTRIES.some((e) => e.kind === 'endless')).toBe(true);
  });

  /**
   * 章节重挑战由通关记录派生，不写死在表里。
   *
   * 抄一份章节名进 `challengeCatalog` 的话，改章节名要改两个地方，
   * 而漏掉的那处会让同一个副本在两页显示不同的名字。
   */
  it('章节重挑战跟着通关记录走', () => {
    const meta = createInitialMeta();
    expect(chapterRepeatEntries(meta)).toHaveLength(0);

    const first = DUNGEON_DEFS[0]!;
    meta.clearedDungeonIds.push(first.id);
    const entries = chapterRepeatEntries(meta);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe(first.name);
    expect(challengeDungeon(entries[0]!)?.id).toBe(first.id);
    expect(challengeStatus(entries[0]!, meta)).toEqual({ kind: 'open' });
  });

  // 「还没做」和「你还没到」必须分开，否则玩家会去找一个不存在的解锁条件
  it('未实装活动的状态是 soon，不是 locked', () => {
    const meta = createInitialMeta();
    for (const e of CHALLENGE_ENTRIES.filter((x) => x.kind === 'event')) {
      expect(challengeStatus(e, meta).kind).toBe('soon');
    }
  });

  it('无尽试炼可以直接挑战，并且挂着 dungeonId', () => {
    const meta = createInitialMeta();
    const endless = CHALLENGE_ENTRIES.filter((e) => e.kind === 'endless');
    expect(endless.length).toBeGreaterThan(0);
    for (const e of endless) {
      expect(challengeStatus(e, meta)).toEqual({ kind: 'open' });
      expect(e.dungeonId).toBeTruthy();
      expect(challengeDungeon(e)?.id).toBe(e.dungeonId);
    }
  });

  it('无尽层数在老存档上缺省为 0', () => {
    const meta = createInitialMeta();
    expect(endlessBestFloor(meta)).toBe(0);
    expect(endlessBestFloor({ ...meta, endlessBestFloor: 7 })).toBe(7);
  });
});
