import type { BattleEvent, UnitState, Vec2 } from './types';
import { getTerrainAt, inBounds, type TerrainGrid } from './grid';
import { getTerrainSpec } from '@/data/terrainSpec';

/**
 * 强制位移原语：突进和击退共用的那一件事。
 *
 * 「岚骑捅完穿到目标背后」和「格隆把目标顶开两格」在玩家眼里是两个技能，
 * 在棋盘上是同一件事——把某个单位沿「施法者 → 目标」的方向推 N 格。
 * 差别只有两个参数：推的是谁，以及推进时能不能穿过某个人。
 * 写成两套逻辑的话，「推到墙上怎么停」「推出界怎么办」「推到人身上怎么办」
 * 这三个判断要各写一遍，而它们必须一致，否则同一堵墙对两招表现不同。
 */

function passable(p: Vec2, terrain: TerrainGrid): boolean {
  if (!inBounds(p, terrain)) return false;
  return getTerrainSpec(getTerrainAt(terrain, p)).moveCost < Infinity;
}

/**
 * 从 `from` 沿 `dir` 推进最多 `cells` 格，返回**最后一个真正空着的格子**。
 *
 * 逐格走而不是直接算终点：中间隔着墙时终点格可能恰好是空地，
 * 一步跳过去等于**穿墙**。逐格判之后撞上什么就停在什么前面，
 * 这也让「把敌人撞在墙上」成为玩家可以主动制造的局面。
 *
 * `passThrough` 是「可以穿过但不能停在上面」的格子（突进穿过被捅的那个）。
 * 落点必须空——停在别人身上等于两个单位占同一格，后面的寻路 / 普攻都会乱。
 *
 * 一格都推不动时返回 `null`（贴着墙 / 背后就是人），调用方据此不发位移事件——
 * 发一个 `from === to` 的事件会让回放播一段零长度滑行，看着像卡了一帧。
 */
export function displaceLanding(
  from: Vec2,
  dir: Vec2,
  cells: number,
  terrain: TerrainGrid,
  occupied: ReadonlySet<string>,
  passThrough: ReadonlySet<string> = new Set(),
): Vec2 | null {
  let last: Vec2 | null = null;
  let p = { x: from.x, y: from.y };
  for (let i = 0; i < cells; i++) {
    const next = { x: p.x + dir.x, y: p.y + dir.y };
    const key = `${next.x},${next.y}`;
    if (!passable(next, terrain)) break;
    if (occupied.has(key) && !passThrough.has(key)) break;
    p = next;
    if (!occupied.has(key)) last = next;
  }
  return last;
}

/** 「施法者 → 目标」的四向单位方向；斜向返回 null（算不出唯一的「背后」） */
export function axisDirection(from: Vec2, to: Vec2): Vec2 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx !== 0 && dy !== 0) return null;
  if (dx === 0 && dy === 0) return null;
  return { x: Math.sign(dx), y: Math.sign(dy) };
}

/**
 * 真正把单位挪过去并生成事件。
 *
 * `ignoreUids` 是「推进时可以穿过谁」：突进要穿过被捅的那个目标落到它背后，
 * 而击退不能穿过任何人。传 uid 而不是布尔，是因为突进只该穿过**那一个**目标——
 * 允许穿过所有人就成了瞬移，队友和第二个敌人都拦不住它。
 */
export function displaceUnit(
  mover: UnitState,
  dir: Vec2,
  cells: number,
  units: readonly UnitState[],
  terrain: TerrainGrid,
  reason: 'dash' | 'knockback',
  ignoreUids: readonly string[] = [],
): BattleEvent | null {
  if (mover.hp <= 0 || cells <= 0) return null;
  const occupied = new Set(
    units.filter((u) => u.hp > 0 && u.uid !== mover.uid).map((u) => `${u.pos.x},${u.pos.y}`),
  );
  const passThrough = new Set(
    units
      .filter((u) => u.hp > 0 && ignoreUids.includes(u.uid))
      .map((u) => `${u.pos.x},${u.pos.y}`),
  );
  const to = displaceLanding(mover.pos, dir, cells, terrain, occupied, passThrough);
  if (!to) return null;
  const from = { ...mover.pos };
  mover.pos = to;
  return { type: 'displace', uid: mover.uid, from, to: { ...to }, reason };
}
