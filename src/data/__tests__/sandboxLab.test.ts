import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS, getDungeonDef } from '@/data/dungeonCatalog';
import {
  adventureChapterList,
  isSandboxDungeon,
  SANDBOX_DUNGEON,
  SANDBOX_DUNGEON_ID,
  SANDBOX_STAGE,
} from '@/data/sandboxLab';
import { CHAPTER_STAGE_INDICES } from '@/data/stagesMvp';
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

  it('木桩场有各职业木桩和三只 Boss 皮', () => {
    const defs = new Set(SANDBOX_STAGE.enemies.map((e) => e.defId));
    expect(defs.has('sword')).toBe(true);
    expect(defs.has('bow')).toBe(true);
    expect(defs.has('mage')).toBe(true);
    expect(defs.has('healer')).toBe(true);
    const skins = SANDBOX_STAGE.enemies.map((e) => e.skillSkin).filter(Boolean);
    expect(skins).toContain('bloodfang_roar');
    expect(skins).toContain('bloodfang_wildfire');
    expect(skins).toContain('bloodfang_breach');
    for (const id of skins) {
      expect(getEnemySkillSkin(id!), `${id} 皮肤未登记`).toBeDefined();
    }
  });
});
