import { describe, expect, it } from 'vitest';
import { levelUpCost } from '@/data/characterCatalog';
import { createInitialState } from '../GameState';
import {
  MAX_CHARACTER_LEVEL,
  canAffordCharacterLevelUp,
  rosterHasAffordableLevelUp,
} from '../MetaManager';

describe('角色升级提醒', () => {
  it('魂晶够付这一级才算可升级', () => {
    const s = createInitialState();
    const ray = s.meta.roster[0]!;
    expect(ray.level).toBe(1);
    const cost = levelUpCost(1);
    s.meta.metaCurrency = cost - 1;
    expect(canAffordCharacterLevelUp(s.meta, ray)).toBe(false);
    expect(rosterHasAffordableLevelUp(s.meta)).toBe(false);
    s.meta.metaCurrency = cost;
    expect(canAffordCharacterLevelUp(s.meta, ray)).toBe(true);
    expect(rosterHasAffordableLevelUp(s.meta)).toBe(true);
  });

  it('满级不再提醒', () => {
    const s = createInitialState();
    const ray = s.meta.roster[0]!;
    ray.level = MAX_CHARACTER_LEVEL;
    s.meta.metaCurrency = 999;
    expect(canAffordCharacterLevelUp(s.meta, ray)).toBe(false);
    expect(rosterHasAffordableLevelUp(s.meta)).toBe(false);
  });
});
