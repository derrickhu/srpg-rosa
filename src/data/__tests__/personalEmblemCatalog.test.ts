import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS, getCharacterDef } from '@/data/characterCatalog';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import {
  allPersonalEmblems,
  describePersonalEmblem,
  hydratePersonalEmblems,
  officialChaptersMissingEmblem,
  personalEmblemLevel,
  personalEmblemsForDungeon,
  previewPersonalEmblemsForDungeon,
  claimPersonalEmblemsForDungeon,
  personalEmblemOwnedCardCopy,
  personalEmblemRosterCards,
  sumPersonalEmblemMods,
} from '@/data/personalEmblemCatalog';

describe('跟人专属纹章目录', () => {
  it('每章主线恰好一枚，指到真实角色', () => {
    expect(officialChaptersMissingEmblem()).toEqual([]);
    for (const d of DUNGEON_DEFS) {
      const list = personalEmblemsForDungeon(d.id);
      expect(list, d.id).toHaveLength(1);
    }
    const ids = allPersonalEmblems().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of allPersonalEmblems()) {
      expect(getCharacterDef(e.rosterId), e.rosterId).toBeDefined();
      expect(e.effects.length).toBeGreaterThan(0);
      expect(describePersonalEmblem(e).length).toBeGreaterThan(2);
    }
  });

  it('岚骑没有主线纹章——他是魂晶解锁，不绑在某一章首通上', () => {
    const lance = CHARACTER_DEFS.find((c) => c.id === 'hero_cav_lance')!;
    expect(lance.unlock.kind).toBe('meta');
    expect(allPersonalEmblems().some((e) => e.rosterId === lance.id)).toBe(false);
  });

  it('效果叠在同一个人身上会相乘 / 相加', () => {
    const a = allPersonalEmblems().find((e) => e.id === 'pe_ray_grassland')!;
    const b = {
      ...a,
      id: 'pe_ray_extra',
      effects: [{ kind: 'skillDealtMul' as const, mul: 1.1 }, { kind: 'stat' as const, atk: 1 }],
    };
    const sum = sumPersonalEmblemMods([a, b]);
    expect(sum.stats.atk).toBe(3);
    expect(sum.skillDealtMul).toBeCloseTo(1.05 * 1.1, 6);
  });

  it('首通预览只给还没领的，领取后再预览为空', () => {
    const meta = { claimedPersonalEmblemIds: [] as string[] };
    const fresh = previewPersonalEmblemsForDungeon(meta, 'dungeon_grassland');
    expect(fresh.map((e) => e.def.id)).toEqual(['pe_ray_grassland']);
    expect(fresh[0]!.level).toBe(1);
    expect(claimPersonalEmblemsForDungeon(meta, 'dungeon_grassland').map((e) => e.def.id))
      .toEqual(['pe_ray_grassland']);
    expect(previewPersonalEmblemsForDungeon(meta, 'dungeon_grassland')).toEqual([]);
    expect(claimPersonalEmblemsForDungeon(meta, 'dungeon_grassland')).toEqual([]);
  });

  it('精英首通升同一枚到 2 级，再打不再升', () => {
    const meta = { claimedPersonalEmblemIds: [] as string[], personalEmblemLevelById: {} };
    claimPersonalEmblemsForDungeon(meta, 'dungeon_grassland');
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(1);
    const up = previewPersonalEmblemsForDungeon(meta, 'elite_grassland');
    expect(up).toEqual([expect.objectContaining({
      def: expect.objectContaining({ id: 'pe_ray_grassland' }),
      level: 2,
    })]);
    claimPersonalEmblemsForDungeon(meta, 'elite_grassland');
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(2);
    expect(previewPersonalEmblemsForDungeon(meta, 'elite_grassland')).toEqual([]);
    expect(describePersonalEmblem(allPersonalEmblems()[0]!, 2)).toContain('攻击 +4');
    expect(describePersonalEmblem(allPersonalEmblems()[0]!, 2)).toContain('+8%');
  });

  it('老档已通关补领：主线 1 级，精英通关升 2 级', () => {
    const meta = {
      clearedDungeonIds: ['dungeon_grassland', 'elite_grassland', 'dungeon_forest'],
      claimedPersonalEmblemIds: [] as string[],
    };
    hydratePersonalEmblems(meta);
    expect(meta.claimedPersonalEmblemIds).toEqual(
      expect.arrayContaining(['pe_ray_grassland', 'pe_hill_forest']),
    );
    expect(meta.claimedPersonalEmblemIds).toHaveLength(2);
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(2);
    expect(personalEmblemLevel(meta, 'pe_hill_forest')).toBe(1);
    hydratePersonalEmblems(meta);
    expect(meta.claimedPersonalEmblemIds).toHaveLength(2);
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(2);
  });

  it('没拿到不露名字、数值和章节', () => {
    const floe = allPersonalEmblems().find((e) => e.id === 'pe_floe_dragon')!;
    expect(personalEmblemOwnedCardCopy(floe, 0)).toBeNull();
    const lv1 = personalEmblemOwnedCardCopy(floe, 1)!;
    expect(lv1.title).toBe('霜脊');
    expect(lv1.source).toBe('已铭刻 · 1级');
    expect(lv1.source).not.toMatch(/精英|升到/);
    expect(lv1.desc).toContain('生命 +8');
    const cards = personalEmblemRosterCards({ claimedPersonalEmblemIds: [] }, 'hero_mage_floe');
    expect(cards).toEqual([]);
  });

  it('岚骑没有可画的纹章卡', () => {
    expect(personalEmblemRosterCards({}, 'hero_cav_lance')).toEqual([]);
  });
});
