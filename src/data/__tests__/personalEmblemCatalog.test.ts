import { describe, expect, it } from 'vitest';
import { applySkillCastFoeEffects } from '@/battle/timedBattleEffects';
import type { UnitState } from '@/battle/types';
import { CHARACTER_DEFS, getCharacterDef } from '@/data/characterCatalog';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import {
  allPersonalEmblems,
  describePersonalEmblem,
  personalEmblemEffectLines,
  hydratePersonalEmblems,
  officialChaptersMissingEmblem,
  personalEmblemLevel,
  personalEmblemsForDungeon,
  previewPersonalEmblemsForDungeon,
  activatePersonalEmblem,
  claimPersonalEmblemsForDungeon,
  claimUniversalEmblemsForDungeon,
  previewUniversalEmblemGrant,
  personalEmblemReleasePrompt,
  personalEmblemSpendAvailable,
  releasePersonalEmblem,
  upgradePersonalEmblem,
  personalEmblemOwnedCardCopy,
  personalEmblemRosterCards,
  personalEmblemsForRoster,
  sumPersonalEmblemMods,
} from '@/data/personalEmblemCatalog';

describe('跟人专属纹章目录', () => {
  it('前六章各送一枚，第七章起不送人，每人恰好两枚', () => {
    expect(officialChaptersMissingEmblem()).toEqual([]);
    DUNGEON_DEFS.forEach((d, i) => {
      const list = personalEmblemsForDungeon(d.id);
      expect(list, d.id).toHaveLength(i < 6 ? 1 : 0);
    });
    expect(personalEmblemsForDungeon('dungeon_mist')).toEqual([]);
    for (const c of CHARACTER_DEFS) {
      expect(personalEmblemsForRoster(c.id), c.name).toHaveLength(2);
    }
    const ids = allPersonalEmblems().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of allPersonalEmblems()) {
      expect(getCharacterDef(e.rosterId), e.rosterId).toBeDefined();
      expect(e.effects.length).toBeGreaterThan(0);
      expect(describePersonalEmblem(e).length).toBeGreaterThan(2);
    }
  });

  it('效果行拆开，给首杀专页排在图框下', () => {
    const e = allPersonalEmblems().find((x) => x.id === 'pe_ray_grassland')!;
    expect(personalEmblemEffectLines(e, 1)).toEqual(['攻击 +2', '技能伤害 +5%']);
    expect(personalEmblemEffectLines(e, 2)).toEqual(['攻击 +4', '技能伤害 +8%']);
  });

  it('魂晶角色的两枚不绑章节', () => {
    const bought = CHARACTER_DEFS.filter((c) => c.unlock.kind === 'meta');
    expect(bought.map((c) => c.id)).toEqual(['hero_cav_lance', 'hero_bow_luoling']);
    for (const c of bought) {
      const list = personalEmblemsForRoster(c.id);
      expect(list, c.name).toHaveLength(2);
      expect(list.every((e) => e.dungeonId == null), c.name).toBe(true);
    }
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

  it('没激活的不进已铭刻卡，激活后才露名字', () => {
    expect(personalEmblemRosterCards({}, 'hero_cav_lance')).toEqual([]);
    expect(personalEmblemRosterCards({}, 'hero_bow_luoling')).toEqual([]);
    const meta = {
      roster: [{ rosterId: 'hero_bow_luoling' }],
      universalEmblemTokens: 1,
      personalEmblemLevelById: {},
      claimedPersonalEmblemIds: [] as string[],
    };
    expect(activatePersonalEmblem(meta, 'hero_bow_luoling', 'pe_luoling_blight')).toBe(true);
    expect(personalEmblemRosterCards(meta, 'hero_bow_luoling').map((c) => c.copy.title)).toEqual(['咒毒']);
  });

  it('万能纹章只发给第七章及以后的首通，重复不再发', () => {
    const meta = { clearedDungeonIds: [] as string[], universalEmblemTokens: 0, universalEmblemPaidDungeonIds: [] as string[] };
    expect(previewUniversalEmblemGrant(meta, 'dungeon_grassland')).toBe(0);
    expect(previewUniversalEmblemGrant(meta, 'elite_grassland')).toBe(0);
    expect(previewUniversalEmblemGrant(meta, 'dungeon_mist')).toBe(2);
    expect(previewUniversalEmblemGrant(meta, 'elite_mist')).toBe(1);
    expect(claimUniversalEmblemsForDungeon(meta, 'dungeon_mist')).toBe(2);
    expect(claimUniversalEmblemsForDungeon(meta, 'dungeon_mist')).toBe(0);
    expect(meta.universalEmblemTokens).toBe(2);
    expect(claimUniversalEmblemsForDungeon(meta, 'elite_mist')).toBe(1);
    expect(meta.universalEmblemTokens).toBe(3);
  });

  it('没有这个人就不能激活，收回按等级退，收回后精英不再补', () => {
    const meta = {
      roster: [{ rosterId: 'hero_sword_ray' }],
      clearedDungeonIds: [] as string[],
      claimedPersonalEmblemIds: [] as string[],
      personalEmblemLevelById: {} as Record<string, number>,
      personalEmblemReleasedIds: [] as string[],
      universalEmblemTokens: 2,
      universalEmblemPaidDungeonIds: [] as string[],
    };
    expect(activatePersonalEmblem(meta, 'hero_bow_luoling', 'pe_luoling_blight')).toBe(false);
    expect(meta.universalEmblemTokens).toBe(2);
    expect(activatePersonalEmblem(meta, 'hero_sword_ray', 'pe_ray_grassland')).toBe(false);
    expect(meta.universalEmblemTokens).toBe(2);
    expect(activatePersonalEmblem(meta, 'hero_sword_ray', 'pe_ray_mist')).toBe(true);
    expect(upgradePersonalEmblem(meta, 'hero_sword_ray', 'pe_ray_mist')).toBe(true);
    expect(personalEmblemLevel(meta, 'pe_ray_mist')).toBe(2);
    expect(meta.universalEmblemTokens).toBe(0);
    expect(personalEmblemEffectLines(
      allPersonalEmblems().find((e) => e.id === 'pe_luoling_blight')!,
      2,
    )).toEqual(['中毒每回合 +4']);

    claimPersonalEmblemsForDungeon(meta, 'dungeon_grassland');
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(1);
    expect(releasePersonalEmblem(meta, 'pe_ray_grassland')).toBe(1);
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(0);
    expect(meta.universalEmblemTokens).toBe(1);
    meta.clearedDungeonIds = ['dungeon_grassland', 'elite_grassland'];
    expect(previewPersonalEmblemsForDungeon(meta, 'elite_grassland')).toEqual([]);
    hydratePersonalEmblems(meta);
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(0);
    expect(activatePersonalEmblem(meta, 'hero_sword_ray', 'pe_ray_grassland')).toBe(true);
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(1);
    expect(meta.personalEmblemReleasedIds).toContain('pe_ray_grassland');
    claimPersonalEmblemsForDungeon(meta, 'elite_grassland');
    hydratePersonalEmblems(meta);
    expect(personalEmblemLevel(meta, 'pe_ray_grassland')).toBe(1);
    expect(releasePersonalEmblem(meta, 'pe_ray_mist')).toBe(2);
    expect(meta.universalEmblemTokens).toBe(2);
  });

  it('章节还没送的纹章不能提前买，不算可铭刻', () => {
    const pendingOnly = {
      universalEmblemTokens: 1,
      clearedDungeonIds: [] as string[],
      personalEmblemLevelById: { pe_ray_mist: 2 },
    };
    expect(personalEmblemSpendAvailable(pendingOnly, 'hero_sword_ray')).toBe(false);
    expect(personalEmblemSpendAvailable({ universalEmblemTokens: 0 }, 'hero_bow_luoling')).toBe(false);
    expect(personalEmblemSpendAvailable({ universalEmblemTokens: 1 }, 'hero_bow_luoling')).toBe(true);
  });

  it('收回前提示退回数量，并说明纹玉可以拿去给别人铭刻', () => {
    const pending = {
      clearedDungeonIds: ['dungeon_grassland'],
      personalEmblemLevelById: { pe_ray_grassland: 1 },
      personalEmblemReleasedIds: [] as string[],
    };
    const prompt = personalEmblemReleasePrompt(pending, 'pe_ray_grassland');
    expect(prompt?.title).toBe('收回纹章');
    expect(prompt?.cancelLabel).toBe('取消');
    expect(prompt?.confirmLabel).toBe('看广告');
    expect(prompt?.body).toBe('收回「草原开辟」，退回 1 枚纹玉。可用于其他角色的永久纹章铭刻。');

    const spent = {
      clearedDungeonIds: ['dungeon_grassland', 'elite_grassland'],
      personalEmblemLevelById: { pe_ray_grassland: 2 },
    };
    const maxed = personalEmblemReleasePrompt(spent, 'pe_ray_grassland');
    expect(maxed?.body).toBe('收回「草原开辟」，退回 2 枚纹玉。可用于其他角色的永久纹章铭刻。');

    const second = {
      personalEmblemLevelById: { pe_ray_mist: 1 },
    };
    const mist = personalEmblemReleasePrompt(second, 'pe_ray_mist');
    expect(mist?.body).toBe('收回「雾行」，退回 1 枚纹玉。可用于其他角色的永久纹章铭刻。');

    expect(personalEmblemReleasePrompt(pending, 'pe_ray_mist')).toBeNull();
  });

  it('咒毒加在施放时的中毒上', () => {
    const target = { timedBattleEffects: undefined } as UnitState;
    applySkillCastFoeEffects(target, getSkillSpec('hex_mark')!, () => 0, 2);
    expect(target.timedBattleEffects).toContainEqual({
      kind: 'poison', dmgPerRound: 10, roundsLeft: 3,
    });
  });
});
