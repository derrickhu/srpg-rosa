import type { BattleEvent, TerrainChangeReason, TerrainId, Vec2 } from './types';
import { cloneTerrain, getTerrainAt, inBounds, setTerrainAt, type TerrainGrid } from './grid';
import { getTerrainSpec } from '@/data/terrainSpec';

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

/**
 * 一场战斗里的地形状态机。
 *
 * 为什么地形状态用 `TerrainId` 转移（森林 → 燃烧 → 焦土）而不是在格子上另挂一层动态效果：
 * 下游的消费者——寻路读 `moveCost`、伤害读 `atkMul`/`defMul`、轮首读 `dotPerRound`、
 * 角标和商店文案从 spec 现算——**已经全部只认一个 `TerrainId`**。走转移的话这些管线
 * 一行都不用改；而叠加层要把每处都改写成「基础 + 效果」的合成读取，换来的却只是
 * 「同一格既是森林又在燃烧」这种我们并不想要的组合（树烧了就不该继续给减伤）。
 *
 * 计时器存在这里而不是格子里：格子只回答「现在是什么」，剩余回合数是运行时状态。
 * 存进 `TerrainGrid` 就会污染那份可以随时拷贝、比较、渲染的纯数据。
 */
export interface TerrainRuntime {
  /** 本场私有的地形矩阵。引擎把它当作 `terrain` 传给寻路 / 伤害 / AI */
  grid: TerrainGrid;
  /**
   * 点燃这些格里所有可燃的（`ignitesTo`），返回地形变更事件。
   * 传进来的通常是技能的 `rangeCells`，所以重复格要去重。
   */
  ignite(cells: Vec2[]): BattleEvent[];
  /** 轮首推进定时转移（燃烧烧尽成焦土）。必须在地形掉血结算**之后**调，见 `startRound` */
  tick(): BattleEvent[];
}

export function createTerrainRuntime(base: TerrainGrid): TerrainRuntime {
  const grid = cloneTerrain(base);
  const timers = new Map<string, { pos: Vec2; roundsLeft: number; to: TerrainId }>();

  function change(pos: Vec2, to: TerrainId, reason: TerrainChangeReason): BattleEvent {
    const from = getTerrainAt(grid, pos);
    setTerrainAt(grid, pos, to);
    const spec = getTerrainSpec(to);
    if (spec.decay) {
      timers.set(key(pos), { pos: { ...pos }, roundsLeft: spec.decay.rounds, to: spec.decay.to });
    } else {
      timers.delete(key(pos));
    }
    return { type: 'terrain', x: pos.x, y: pos.y, from, to, reason };
  }

  function ignite(cells: Vec2[]): BattleEvent[] {
    const out: BattleEvent[] = [];
    const seen = new Set<string>();
    for (const c of cells) {
      if (!inBounds(c, grid)) continue;
      const k = key(c);
      if (seen.has(k)) continue;
      seen.add(k);
      const spec = getTerrainSpec(getTerrainAt(grid, c));
      // 已经在燃烧的格子没有 `ignitesTo`，所以补一发火不会续上燃烧时间。
      // 这是故意的：否则站在火里的敌人会被反复延烧，变成一个不用走位的必杀技。
      if (!spec.ignitesTo) continue;
      out.push(change(c, spec.ignitesTo, 'ignite'));
    }
    return out;
  }

  function tick(): BattleEvent[] {
    const out: BattleEvent[] = [];
    // 遍历快照：`change` 可能给刚变过的格子登记新计时器，那些不该在本轮就跟着 -1
    for (const [k, t] of [...timers]) {
      t.roundsLeft -= 1;
      if (t.roundsLeft > 0) continue;
      timers.delete(k);
      out.push(change(t.pos, t.to, 'burnout'));
    }
    return out;
  }

  return { grid, ignite, tick };
}
