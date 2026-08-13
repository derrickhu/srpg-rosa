import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { allSkillMods, getSkillMod } from '@/data/skillModCatalog';
import { rollLoot, startRun } from '../ProgressManager';
import { createInitialState, partyCharacters, type MvpGameState } from '../GameState';

const DUNGEON_ID = DUNGEON_DEFS[0]!.id;

/** 线性同余，够随机又可复现——统计类断言不能靠 Math.random 决定过不过 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function newRun(): MvpGameState {
  const s = createInitialState();
  startRun(s, DUNGEON_ID, s.meta.roster.slice(0, 3).map((m) => m.rosterId));
  return s;
}

describe('战后三选一的池子', () => {
  it('三张卡不重复同一条词条', () => {
    const s = newRun();
    const rng = seeded(7);
    for (let i = 0; i < 200; i += 1) {
      const picks = rollLoot(s, rng);
      expect(picks).toHaveLength(3);
      const mods = picks.filter((p) => p.kind === 'skillMod').map((p) => p.modId);
      expect(new Set(mods).size, `重复词条：${mods.join(' / ')}`).toBe(mods.length);
    }
  });

  it('稀有度真的影响出率，不再是只换个卡框颜色', () => {
    const s = newRun();
    const rng = seeded(99);
    const count = { common: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 300; i += 1) {
      for (const p of rollLoot(s, rng)) {
        if (p.kind !== 'skillMod') continue;
        const mod = getSkillMod(p.modId);
        if (mod) count[mod.rarity] += 1;
      }
    }
    expect(count.common).toBeGreaterThan(count.rare);
    expect(count.rare).toBeGreaterThan(count.epic);
    expect(count.epic).toBeGreaterThan(0);
  });

  it('专属词条在一局里够常见，不至于一整章都遇不上', () => {
    const s = newRun();
    const rng = seeded(31);
    let seen = 0;
    // 一章 6 场左右，这里按 20 屏抽，专属至少要露过面
    for (let i = 0; i < 20; i += 1) {
      for (const p of rollLoot(s, rng)) {
        if (p.kind === 'skillMod' && p.modId.startsWith('ex_')) seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  /**
   * 词条只强化主技能，所以临时技能一张候选都不该出。
   *
   * 这条早先是反的（两个槽都出候选），结果卡面画着临时技能、写着「锋锐」，
   * 而实际吃到 25% 的是主技能和临时技能两招——卡面在撒谎。
   * 现在卡面画的那一招就是唯一被改的那一招，所以这里钉死「skillId 永远是主槽的」。
   */
  it('临时技能不出候选：卡面画的那一招就是被改的那一招', () => {
    const s = newRun();
    const who = partyCharacters(s)[0]!;
    s.run!.runTempSkill[who.rosterId] = 'temp_gl_swarm';

    const rng = seeded(2026);
    for (let i = 0; i < 200; i += 1) {
      for (const p of rollLoot(s, rng)) {
        if (p.kind !== 'skillMod') continue;
        expect(p.skillId, '临时技能不该出现在三选一里').not.toBe('temp_gl_swarm');
      }
    }
  });

  it('词条全点满后退化成药剂，而不是给出空的三选一', () => {
    const s = newRun();
    // 把每个人的每条词条都塞到上限
    for (const m of partyCharacters(s)) {
      s.run!.skillMods[m.rosterId] = allSkillMods().flatMap((mod) =>
        Array(mod.maxStacks).fill(mod.id),
      );
    }
    const picks = rollLoot(s, seeded(5));
    expect(picks).toHaveLength(3);
    expect(picks.every((p) => p.kind === 'potion')).toBe(true);
  });

  it('尽量凑不同的角色，而不是把三张都发给同一个人', () => {
    const s = newRun();
    const rng = seeded(1234);
    let allSame = 0;
    for (let i = 0; i < 100; i += 1) {
      const owners = new Set(
        rollLoot(s, rng).filter((p) => p.kind === 'skillMod').map((p) => p.rosterId),
      );
      if (owners.size === 1) allSame += 1;
    }
    expect(allSame).toBe(0);
  });
});
