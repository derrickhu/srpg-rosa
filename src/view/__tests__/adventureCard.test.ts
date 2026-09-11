import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { ELITE_REPEAT_SOUL, eliteDungeonOf } from '@/data/eliteCatalog';
import { ENDLESS_DUNGEON_ID } from '@/data/endlessCatalog';
import { adventureChapterList, SANDBOX_DUNGEON_ID } from '@/data/sandboxLab';
import { DUNGEON_REPEAT_SOUL, startRun } from '@/game/state/ProgressManager';
import { createInitialMeta, createInitialState, createRunState } from '@/game/state/GameState';
import { C, mix } from '@/view/mvpTheme';
import {
  adventureActiveDef,
  adventureCardTitle,
  adventureChapterIndexOf,
  adventureFooterModel,
  chapterRewardModel,
  defaultAdventureChapterIndex,
  eliteModeUnlocked,
  nextAdventureChapterIndex,
} from '@/view/AdventureView';

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

  it('精英本本关奖励是 5，不和主线 3 串', () => {
    const elite = eliteDungeonOf(DUNGEON)!;
    const meta = createInitialMeta();
    const m = chapterRewardModel(elite, meta);
    expect(m.repeatSoul).toBe(ELITE_REPEAT_SOUL);
    expect(m.firstClaimed).toBe(false);
    expect(m.pendingNodeFirstClears).toBe(
      DUNGEON.nodes.filter((n) => n.kind !== 'shop').length,
    );
  });
});

describe('冒险卡普通 / 精英开关', () => {
  it('未通关不能开精英；通关后奖励井改读精英本', () => {
    const meta = createInitialMeta();
    expect(eliteModeUnlocked(meta, DUNGEON.id)).toBe(false);
    expect(adventureActiveDef(DUNGEON, false).id).toBe(DUNGEON.id);
    expect(adventureActiveDef(DUNGEON, true).id).toBe('elite_grassland');
    meta.clearedDungeonIds.push(DUNGEON.id);
    expect(eliteModeUnlocked(meta, DUNGEON.id)).toBe(true);
    expect(adventureCardTitle(0, DUNGEON.name, true)).toBe('第 1 章 · 草原战线 · 精英');
    expect(adventureCardTitle(0, DUNGEON.name, false)).toBe('第 1 章 · 草原战线');
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

describe('冒险页默认章节', () => {
  const chapters = adventureChapterList(DUNGEON_DEFS);
  const party = (s: ReturnType<typeof createInitialState>) =>
    s.meta.roster.slice(0, 2).map((m) => m.rosterId);

  it('新档停在第一章', () => {
    expect(defaultAdventureChapterIndex(createInitialState(), chapters)).toBe(0);
  });

  it('第一章已通、没有进行中的局：翻到下一章', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON_DEFS[0]!.id);
    expect(defaultAdventureChapterIndex(s, chapters)).toBe(1);
    expect(chapters[1]!.id).toBe('dungeon_forest');
  });

  it('通关后首页下标是下一章，失败离开关卡仍指当前章', () => {
    expect(nextAdventureChapterIndex(chapters, DUNGEON_DEFS[0]!.id)).toBe(1);
    expect(adventureChapterIndexOf(chapters, DUNGEON_DEFS[1]!.id)).toBe(1);
    expect(adventureChapterIndexOf(chapters, 'elite_forest')).toBe(1);
  });

  it('有进行中的冒险局：停在那一章', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON_DEFS[0]!.id);
    startRun(s, DUNGEON_DEFS[1]!.id, party(s));
    expect(defaultAdventureChapterIndex(s, chapters)).toBe(1);
  });

  it('无尽挂在前台时仍跟冒险挂起局走', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON_DEFS[0]!.id);
    s.parkedRun = createRunState(DUNGEON_DEFS[1]!.id, party(s));
    s.run = createRunState(ENDLESS_DUNGEON_ID, party(s));
    expect(defaultAdventureChapterIndex(s, chapters)).toBe(1);
  });

  it('进行中的精英局：停在对应主线卡，不另开一张', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON_DEFS[0]!.id);
    startRun(s, 'elite_grassland', party(s));
    expect(defaultAdventureChapterIndex(s, chapters)).toBe(0);
  });

  it('正式章全通：停在最后一章，不落到试炼卡', () => {
    const s = createInitialState();
    for (const d of DUNGEON_DEFS) s.meta.clearedDungeonIds.push(d.id);
    const withLab = adventureChapterList(DUNGEON_DEFS, true);
    expect(defaultAdventureChapterIndex(s, withLab)).toBe(DUNGEON_DEFS.length - 1);
    expect(withLab[DUNGEON_DEFS.length]!.id).toBe(SANDBOX_DUNGEON_ID);
  });
});

describe('冒险页底栏', () => {
  const party = (s: ReturnType<typeof createInitialState>) =>
    s.meta.roster.slice(0, 2).map((m) => m.rosterId);

  it('已通关章在另一章战斗中仍出开始和扫荡', () => {
    const s = createInitialState();
    s.meta.clearedDungeonIds.push(DUNGEON.id);
    s.meta.unlockedDungeonIds.push(DUNGEON_DEFS[5]?.id ?? DUNGEON_DEFS[1]!.id);
    startRun(s, DUNGEON_DEFS[5]?.id ?? DUNGEON_DEFS[1]!.id, party(s));
    const footer = adventureFooterModel(s, DUNGEON, false);
    expect(footer.kind).toBe('play');
    if (footer.kind !== 'play') return;
    expect(footer.cleared).toBe(true);
    expect(footer.canSweep).toBe(true);
    expect(footer.startLabel).toContain('开');
  });

  it('正在打的那一章仍出继续，不改成开始', () => {
    const s = createInitialState();
    s.meta.unlockedDungeonIds.push(DUNGEON_DEFS[1]!.id);
    startRun(s, DUNGEON_DEFS[1]!.id, party(s));
    const footer = adventureFooterModel(s, DUNGEON_DEFS[1]!, false);
    expect(footer.kind).toBe('continue');
    if (footer.kind !== 'continue') return;
    expect(footer.canSweep).toBe(false);
  });
});
