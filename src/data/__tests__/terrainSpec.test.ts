import { describe, it, expect } from 'vitest';
import {
  TERRAIN_IDS,
  getTerrainSpec,
  isKnownTerrainId,
  isPassable,
} from '@/data/terrainSpec';
import { terrainBadge, terrainInfoLines } from '@/view/renderHelpers';

describe('地形表自洽性', () => {
  it('每种地形都有名字和兜底色', () => {
    for (const id of TERRAIN_IDS) {
      const spec = getTerrainSpec(id);
      expect(spec.name, `${id} 缺名字`).toBeTruthy();
      expect(spec.color, `${id} 缺兜底色`).toBeGreaterThan(0);
      expect(spec.id, `${id} 的 spec.id 与键不符`).toBe(id);
    }
  });

  /**
   * 「不可通行地形的 atkMul/defMul 恒为 1」是 `terrainSpec.ts` 里明写的约定：
   * 没有单位能站上去，写别的值只会让读代码的人以为地形已经有那个维度了
   * （城墙的 defMul: 0.5 就这样误导过一次）。
   */
  it('不可通行地形不带站位加成', () => {
    for (const id of TERRAIN_IDS) {
      if (isPassable(id)) continue;
      const spec = getTerrainSpec(id);
      expect(spec.atkMul, `${spec.name} 不可通行却带 atkMul`).toBe(1);
      expect(spec.defMul, `${spec.name} 不可通行却带 defMul`).toBe(1);
      expect(spec.dotPerRound, `${spec.name} 不可通行却带持续伤害`).toBe(0);
    }
  });

  it('转移边指向的地形都存在，且不会自己指向自己', () => {
    for (const id of TERRAIN_IDS) {
      const spec = getTerrainSpec(id);
      if (spec.ignitesTo) {
        expect(isKnownTerrainId(spec.ignitesTo), `${spec.name} 的 ignitesTo 不存在`).toBe(true);
        expect(spec.ignitesTo, `${spec.name} 点燃后还是自己，会烧不完`).not.toBe(id);
      }
      if (spec.decay) {
        expect(isKnownTerrainId(spec.decay.to), `${spec.name} 的 decay.to 不存在`).toBe(true);
        expect(spec.decay.to, `${spec.name} 定时转移到自己，计时器会永远重挂`).not.toBe(id);
        expect(spec.decay.rounds, `${spec.name} 的 decay.rounds 必须为正`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * 可燃地形的链条必须能走到终点。写成环（森林→燃烧→森林）在数据上看不出问题，
   * 但战斗里那一格会永远烧着，是一个不会报错的死循环。
   */
  it('定时转移链最终会停下来', () => {
    for (const id of TERRAIN_IDS) {
      const seen = new Set<string>([id]);
      let cur = getTerrainSpec(id).decay?.to;
      while (cur) {
        expect(seen.has(cur), `${id} 的转移链成环，会永远烧着`).toBe(false);
        seen.add(cur);
        cur = getTerrainSpec(cur).decay?.to;
      }
    }
  });
});

describe('地形文案', () => {
  it('每种地形都给得出至少一条说明，且没有空行', () => {
    for (const id of TERRAIN_IDS) {
      const lines = terrainInfoLines(id);
      expect(lines.length, `${id} 说明为空`).toBeGreaterThan(0);
      for (const l of lines) expect(l.trim(), `${id} 有空说明行`).toBeTruthy();
    }
  });

  it('可通行且有动词的地形都出角标', () => {
    // 角标是玩家在布阵页唯一能扫到的地形提示，漏掉等于那条规则在布阵时不存在
    for (const id of TERRAIN_IDS) {
      const spec = getTerrainSpec(id);
      if (!isPassable(id)) continue;
      const hasVerb = spec.atkMul !== 1 || spec.defMul !== 1 || spec.dotPerRound > 0;
      if (!hasVerb) continue;
      expect(terrainBadge(id), `${spec.name} 有效果却不出角标`).not.toBeNull();
    }
  });

  it('燃烧格会说清自己会烧尽，焦土会说自己没效果', () => {
    // 新地形最容易出的问题是「玩家不知道它会变」，那会让烧尽看起来像 bug
    expect(terrainInfoLines('burning').join(' ')).toContain('焦土');
    expect(terrainInfoLines('forest').join(' ')).toContain('点燃');
    expect(terrainInfoLines('scorched').join(' ')).toContain('没有特殊效果');
  });

  /**
   * 两种不可通行地形在棋盘上都只是「过不去」的样子，而一个挡箭一个不挡。
   * 这条差别在界面上没有别的地方能读到，说明卡漏了它就等于是隐藏规则。
   */
  it('城墙和深渊的说明能区分开挡不挡视线', () => {
    expect(terrainInfoLines('wall').join(' ')).toContain('阻挡远程');
    expect(terrainInfoLines('abyss').join(' ')).toContain('不阻挡远程');
    expect(terrainInfoLines('wall')).not.toEqual(terrainInfoLines('abyss'));
  });
});
