import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import {
  adventureChapterList,
  isSandboxDungeon,
  SANDBOX_DUNGEON,
  SANDBOX_DUNGEON_ID,
  SANDBOX_STAGE,
} from '@/data/sandboxLab';
import {
  CHAPTER_STAGE_INDICES,
  CHAPTER2_FOREST,
  CHAPTER3_GARRISON,
  CHAPTER4_MIRE,
  CHAPTER5_DRAKE,
} from '@/data/stagesMvp';
import { getEnemySkillSkin } from '@/data/enemySkillCatalog';

describe('特效试炼不进正式章节表', () => {
  it('不在 DUNGEON_DEFS 里，章节数仍与关卡表对齐', () => {
    expect(DUNGEON_DEFS.some((d) => d.id === SANDBOX_DUNGEON_ID)).toBe(false);
    expect(CHAPTER_STAGE_INDICES.length).toBe(DUNGEON_DEFS.length);
  });

  it('getDungeonDef 能取到试炼副本', () => {
    expect(getDungeonDef(SANDBOX_DUNGEON_ID)?.id).toBe(SANDBOX_DUNGEON_ID);
    expect(isSandboxDungeon(SANDBOX_DUNGEON.id)).toBe(true);
    expect(isSandboxDungeon('dungeon_grassland')).toBe(false);
  });

  it('冒险页章节表把试炼接在最后', () => {
    const list = adventureChapterList(DUNGEON_DEFS);
    expect(list[list.length - 1]!.id).toBe(SANDBOX_DUNGEON_ID);
    expect(list.length).toBe(DUNGEON_DEFS.length + 1);
  });

  it('木桩场有各职业木桩和五章 Boss 皮', () => {
    const defs = new Set(SANDBOX_STAGE.enemies.map((e) => e.defId));
    expect(defs.has('sword')).toBe(true);
    expect(defs.has('bow')).toBe(true);
    expect(defs.has('mage')).toBe(true);
    expect(defs.has('healer')).toBe(true);
    // 五章 Boss 皮全在场，少一个就没法在一屏里比形态有没有撞车
    const skins = SANDBOX_STAGE.enemies.map((e) => e.skillSkin).filter(Boolean);
    expect(skins).toEqual([
      'bloodfang_roar',
      'bloodfang_wildfire',
      'bloodfang_breach',
      'mirequeen_miasma',
      'drake_cataclysm',
    ]);
    for (const id of skins) {
      expect(getEnemySkillSkin(id!), `${id} 皮肤未登记`).toBeDefined();
    }
  });

  /**
   * 这个场的用途就是「一屏之内比出有没有撞形态」，所以**每个会出手的木桩都得有
   * 自己的外观**。共用图集在这里不是省事，是直接让这个场失去意义。
   */
  it('木桩场里每个会出手的桩都有专属图集，不共用', () => {
    const casters = SANDBOX_STAGE.enemies.filter((e) => e.skillSkin || e.skillId);
    const sets = casters.map((e) => e.animSet);
    expect(sets.every(Boolean), '有会出手的桩没配 animSet').toBe(true);
    expect(new Set(sets).size, `图集有重复：${sets.join(', ')}`).toBe(sets.length);
  });

  /**
   * 杂兵桩的技能必须**取自** `stagesMvp` 的章节模板，不能在 sandbox 里另抄一份 id。
   * 抄了就会走岔，而走岔的表现是「试炼场里试的招和实战里放的不是同一个」。
   */
  it('杂兵桩覆盖章节模板里所有会出手的怪', () => {
    const expected = [CHAPTER2_FOREST, CHAPTER3_GARRISON, CHAPTER4_MIRE, CHAPTER5_DRAKE]
      .flatMap((c) => Object.values(c))
      .filter((t) => t.skillId);
    const onField = new Set(SANDBOX_STAGE.enemies.map((e) => e.skillId).filter(Boolean));
    // 投放曲线：第二、三章各 1 条，第四章 2 条，终章 4 条
    expect(expected).toHaveLength(8);
    for (const t of expected) {
      expect(onField.has(t.skillId), `${t.name} 的「${t.skillId}」没上木桩场`).toBe(true);
    }
  });
});
