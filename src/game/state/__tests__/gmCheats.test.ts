import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { SANDBOX_DUNGEON_ID } from '@/data/sandboxLab';
import { applyVictory, startRun } from '../ProgressManager';
import { createInitialState } from '../GameState';
import { effectiveOwnedSkillIds } from '../DeployManager';
import {
  gmAddSoul,
  gmLearnAllSkills,
  gmPrepareSandboxRoster,
  gmUnlockAllCharacters,
} from '../gmCheats';

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

  it('学满技能写入名册', () => {
    const state = createInitialState();
    gmUnlockAllCharacters(state);
    const n = gmLearnAllSkills(state);
    expect(n).toBeGreaterThan(0);
    const mage = state.meta.roster.find((m) => m.rosterId === 'hero_mage_aoli')!;
    expect(mage.ownedSkillIds).toContain('ember');
    expect(mage.ownedSkillIds).toContain('flame_ring');
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

  it('试炼里布阵能切到角色路线上的全部技能', () => {
    const state = createInitialState();
    startRun(state, SANDBOX_DUNGEON_ID, state.meta.roster.map((m) => m.rosterId));
    const sword = state.meta.roster.find((m) => m.profession === 'sword')!;
    const ids = effectiveOwnedSkillIds(state, sword);
    expect(ids).toContain('whirl');
    expect(ids).toContain('cleave');
    expect(ids).toContain('blade_rush');
  });
});
