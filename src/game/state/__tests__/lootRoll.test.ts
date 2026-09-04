import { describe, expect, it } from 'vitest';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { CHARACTER_DEFS, MAX_CHARACTER_LEVEL } from '@/data/characterCatalog';
import { allSkillMods, getSkillMod, isExclusiveMod } from '@/data/skillModCatalog';
import { instantiateCharacter } from '@/game/characterFactory';
import { rollLoot, startRun } from '../ProgressManager';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import { createInitialState, currentStage, partyCharacters, type MvpGameState } from '../GameState';

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
  // 开局名册只剩雷恩；三选一要测「给谁」必须凑出一支小队
  s.meta.roster = CHARACTER_DEFS.slice(0, 3).map(instantiateCharacter);
  startRun(s, DUNGEON_ID, s.meta.roster.map((m) => m.rosterId));
  deployParty(s);
  return s;
}

/**
 * 把全队拉到 `level` 级。
 *
 * 专属纹章按角色等级开闸。测权重 / 出率时拉到满级，否则专属进不了池，
 * 「史诗比普通少」那条会因为池子里根本没有史诗专属而变形。
 */
function levelAll(s: MvpGameState, level: number): void {
  for (const m of s.meta.roster) m.level = level;
}

/** 战后抽卡看的是布阵，不是整队。测试默认全员上场，要测替补再自己改 placements。 */
function deployParty(s: MvpGameState, rosterIds?: string[]): void {
  const ids = rosterIds ?? partyCharacters(s).map((m) => m.rosterId);
  const { h } = gridSize(currentStage(s).terrain);
  const [row] = playerDeployRowRange(h);
  s.run!.placements = ids.map((rosterId, i) => ({
    uid: `p${i}`,
    rosterId,
    pos: { x: i, y: row },
  }));
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
    levelAll(s, MAX_CHARACTER_LEVEL);
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
    levelAll(s, MAX_CHARACTER_LEVEL);
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

  /**
   * 等级闸门只挡专属。通用按技能类型进池，1 级也该能抽到稀有通用；
   * 专属要练到对应台阶才进池。
   */
  describe('角色等级只决定专属纹章', () => {
    it('1 级抽得到通用，抽不到专属', () => {
      const s = newRun();
      const rng = seeded(4242);
      let genericRare = 0;
      for (let i = 0; i < 200; i += 1) {
        for (const p of rollLoot(s, rng)) {
          if (p.kind !== 'skillMod') continue;
          const mod = getSkillMod(p.modId)!;
          expect(isExclusiveMod(mod), `1 级不该抽到专属「${mod.name}」`).toBe(false);
          if (mod.rarity !== 'common') genericRare += 1;
        }
      }
      expect(genericRare, '1 级连通用稀有都抽不到，升级前三选一会空得只剩普通').toBeGreaterThan(0);
    });

    it('练到满级之后，同一个人开始出现专属纹章', () => {
      const s = newRun();
      levelAll(s, MAX_CHARACTER_LEVEL);
      const rng = seeded(4242);
      let exclusives = 0;
      for (let i = 0; i < 200; i += 1) {
        for (const p of rollLoot(s, rng)) {
          if (p.kind === 'skillMod' && getSkillMod(p.modId)!.scope.kind === 'exclusive') {
            exclusives += 1;
          }
        }
      }
      expect(exclusives).toBeGreaterThan(0);
    });
  });

  it('某个人把一条词条叠满后，他自己不再抽到这条，别人还能抽', () => {
    const s = newRun();
    const party = partyCharacters(s);
    const owner = party[0]!;
    const sharpen = getSkillMod('sharpen')!;
    s.run!.skillMods[owner.rosterId] = Array(sharpen.maxStacks).fill('sharpen');

    const rng = seeded(2026);
    let otherSharpen = 0;
    for (let i = 0; i < 200; i += 1) {
      for (const p of rollLoot(s, rng)) {
        if (p.kind !== 'skillMod') continue;
        if (p.rosterId === owner.rosterId) {
          expect(p.modId, `${owner.name} 的锋锐已经满级，不该再出现`).not.toBe('sharpen');
        }
        if (p.modId === 'sharpen' && p.rosterId !== owner.rosterId) otherSharpen += 1;
      }
    }
    expect(otherSharpen, '别人的锋锐也被误伤剔出池了').toBeGreaterThan(0);
  });

  it('词条全点满后退化成药剂，而不是给出空的三选一', () => {
    const s = newRun();
    levelAll(s, MAX_CHARACTER_LEVEL);
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

  it('未上场的角色不进三选一', () => {
    const s = newRun();
    const party = partyCharacters(s);
    expect(party.length).toBeGreaterThanOrEqual(3);
    const bench = party[2]!;
    deployParty(s, [party[0]!.rosterId, party[1]!.rosterId]);

    const rng = seeded(88);
    for (let i = 0; i < 80; i += 1) {
      for (const p of rollLoot(s, rng)) {
        if (p.kind !== 'skillMod') continue;
        expect(p.rosterId, '替补不该出现在战后词条里').not.toBe(bench.rosterId);
      }
    }
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
