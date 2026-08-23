import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { SANDBOX_DUNGEON_ID } from '@/data/sandboxLab';
import { applyVictory, startRun } from '../ProgressManager';
import { createInitialState } from '../GameState';
import { effectiveOwnedSkillIds } from '../DeployManager';
import { gmAddSoul, gmPrepareSandboxRoster, gmUnlockAllCharacters } from '../gmCheats';

describe('GM 作弊', () => {
  it('一键解锁全部角色', () => {
    const state = createInitialState();
    const added = gmUnlockAllCharacters(state);
    expect(state.meta.roster).toHaveLength(CHARACTER_DEFS.length);
    expect(added).toBe(CHARACTER_DEFS.length - 3);
    expect(gmUnlockAllCharacters(state)).toBe(0);
  });

  it('一键加魂晶', () => {
    const state = createInitialState();
    expect(gmAddSoul(state, 99)).toBe(99);
    expect(state.meta.metaCurrency).toBe(99);
  });

});

describe('特效试炼不写进度', () => {
  it('打赢不发魂晶、不记首通', () => {
    const state = createInitialState();
    gmPrepareSandboxRoster(state);
    const soul = state.meta.metaCurrency;
    startRun(state, SANDBOX_DUNGEON_ID, state.meta.roster.map((m) => m.rosterId));
    applyVictory(state);
    expect(state.meta.metaCurrency).toBe(soul);
    expect(state.meta.clearedNodesByDungeonId[SANDBOX_DUNGEON_ID]).toBeUndefined();
    expect(state.meta.clearedDungeonIds).not.toContain(SANDBOX_DUNGEON_ID);
  });

  /**
   * 试炼场是拿来试特效和手感的，所以它给的是**这个职业的全部专属招**，
   * 包括已经从角色身上摘下来的那些（重劈转给了敌人、破阵斩在等第二个剑士）。
   * 正式副本里一人一招，这里放开不影响任何持久进度。
   */
  it('试炼里布阵能切到这个职业的全部专属技能，含已摘下的那些', () => {
    const state = createInitialState();
    startRun(state, SANDBOX_DUNGEON_ID, state.meta.roster.map((m) => m.rosterId));
    const sword = state.meta.roster.find((m) => m.profession === 'sword')!;
    const ids = effectiveOwnedSkillIds(state, sword);
    expect(ids).toContain('whirl');
    expect(ids).toContain('cleave');
    expect(ids).toContain('blade_rush');
  });

  it('正式副本里主槽只有招牌技能', () => {
    const state = createInitialState();
    startRun(state, 'dungeon_grassland', state.meta.roster.map((m) => m.rosterId));
    const sword = state.meta.roster.find((m) => m.profession === 'sword')!;
    expect(effectiveOwnedSkillIds(state, sword)).toEqual(['whirl']);
  });
});
