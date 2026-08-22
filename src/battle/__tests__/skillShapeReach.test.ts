import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '@/data/unitDefs';
import { getSkillSpec, skillDefForId } from '@/data/skillCatalog';
import { emptyTerrain } from '../grid';
import type { UnitKind, UnitState } from '../types';
import { castSkillManual, trySkillAfterMove } from '../skills';

/**
 * 形状 × `timing` 必须是两个自由维度，且 `reach` 要真的区分「正好 N 格」和「N 格内」。
 *
 * 两条都是踩过的坑：
 * - AI 的 afterMove 路径曾经硬写 `shape.type !== 'lineBestRayAllFoes' continue`，
 *   于是 afterMove 技能一换形状，自动模式就**静默不放**（人工模式一切正常）。
 * - 选单体的形状原先只有「距离正好等于 N」一种，远程点杀没法表达：
 *   取 3 就变成「只能打正好 3 格外的」，被贴脸反而无解。
 */

function unit(
  uid: string,
  kind: UnitKind,
  pos: { x: number; y: number },
  faction: 'player' | 'enemy',
  skillId?: string,
): UnitState {
  return {
    uid,
    defId: kind,
    faction,
    hp: UNIT_DEFS[kind].base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
    battleSkill: skillId ? (skillDefForId(skillId) ?? undefined) : undefined,
  };
}

function castHits(self: UnitState, units: UnitState[]): string[] | null {
  const events = castSkillManual(self, UNIT_DEFS, units, emptyTerrain(7, 7));
  const cast = events.find((e) => e.type === 'skillCast');
  if (cast?.type !== 'skillCast') return null;
  return cast.hits.map((h) => h.target);
}

describe('afterMove 技能不限于射线形状', () => {
  it('速射是 afterMove + 点名单体，AI 也要放得出来', () => {
    const spec = getSkillSpec('snap')!;
    // 前提写进断言：这个测试的意义全在「afterMove 配了一个非射线形状」上，
    // 哪天速射改回射线，这里该提醒改测试而不是安静地失去覆盖。
    expect(spec.timing).toBe('afterMove');
    expect(spec.shape.type).toBe('neighborPickFoe');

    const self = unit('p1', 'bow', { x: 0, y: 3 }, 'player', 'snap');
    const foe = unit('e1', 'sword', { x: 2, y: 3 }, 'enemy');
    const events = trySkillAfterMove(self, UNIT_DEFS, [self, foe], emptyTerrain(7, 7));
    const cast = events.find((e) => e.type === 'skillCast');
    expect(cast?.type, 'AI 的 afterMove 路径漏掉了非射线形状').toBe('skillCast');
    expect(foe.hp).toBeLessThan(UNIT_DEFS.sword.base.maxHp);
  });

  it('AI 点杀按策略打最低血，不读技能里的选血字段', () => {
    // 炎弹曾经写 pick: highestHp。两个敌人都在 3 格内时，AI 应打残血那个。
    const self = unit('p1', 'mage', { x: 0, y: 3 }, 'player', 'ember');
    const tank = unit('e1', 'shield', { x: 2, y: 3 }, 'enemy');
    const low = unit('e2', 'bow', { x: 1, y: 3 }, 'enemy');
    low.hp = 8;
    const events = trySkillAfterMove(self, UNIT_DEFS, [self, tank, low], emptyTerrain(7, 7));
    const cast = events.find((e) => e.type === 'skillCast');
    expect(cast?.type).toBe('skillCast');
    if (cast?.type !== 'skillCast') return;
    expect(cast.hits[0]?.target).toBe('e2');
  });
});

describe("reach: 'within' 是一片射程，不是一圈环", () => {
  it('速射 3 格内都能打，含贴脸格', () => {
    for (const d of [1, 2, 3]) {
      const self = unit('p1', 'bow', { x: 0, y: 3 }, 'player', 'snap');
      const foe = unit('e1', 'sword', { x: d, y: 3 }, 'enemy');
      expect(castHits(self, [self, foe]), `距离 ${d} 打不到`).toEqual(['e1']);
    }
  });

  it('速射打不到 4 格外', () => {
    const self = unit('p1', 'bow', { x: 0, y: 3 }, 'player', 'snap');
    const foe = unit('e1', 'sword', { x: 4, y: 3 }, 'enemy');
    expect(castHits(self, [self, foe])).toBeNull();
  });

  it('回放高亮的范围格跟着 reach 走，不能画成一圈环', () => {
    const self = unit('p1', 'bow', { x: 3, y: 3 }, 'player', 'snap');
    const foe = unit('e1', 'sword', { x: 4, y: 3 }, 'enemy');
    const events = castSkillManual(self, UNIT_DEFS, [self, foe], emptyTerrain(9, 9));
    const cast = events.find((e) => e.type === 'skillCast');
    if (cast?.type !== 'skillCast') throw new Error('没放出来');
    const cells = cast.rangeCells ?? [];
    // 贴脸格必须在高亮里：玩家会照着高亮记射程，画少了他就不敢在近身时按这一招
    expect(cells.some((c) => c.x === 4 && c.y === 3), '3 格内的贴脸格没高亮').toBe(true);
    expect(cells.some((c) => c.x === 6 && c.y === 3), '正好 3 格的格子没高亮').toBe(true);
    expect(cells.some((c) => c.x === 7 && c.y === 3), '4 格外的格子不该高亮').toBe(false);
  });

  it('长驱突刺仍是「正好 2 格」：贴脸捅不到，那是它的代价', () => {
    const near = unit('p1', 'cavalry', { x: 0, y: 3 }, 'player', 'lance_thrust');
    expect(castHits(near, [near, unit('e1', 'sword', { x: 1, y: 3 }, 'enemy')])).toBeNull();

    const far = unit('p2', 'cavalry', { x: 0, y: 3 }, 'player', 'lance_thrust');
    expect(castHits(far, [far, unit('e2', 'sword', { x: 2, y: 3 }, 'enemy')])).toEqual(['e2']);
  });
});

/**
 * `squareAoE` 存在的唯一理由就是**打得到斜角**，而这件事极容易静默退回去：
 * 把形状改成 `discAoE radius:1` 看着像个等价重构（都叫「半径 1 的整片」），
 * 实际上那个半径量的是曼哈顿距离，斜角邻居的曼哈顿距离是 2，于是一改就漏。
 * 漏掉之后没有任何报错——只是玩家躲在斜角上不再被旋风斩打到，
 * 而特效照旧画满 3×3。所以这一组断言必须显式对比三种形状。
 */
describe('squareAoE 打得到斜角，环形和曼哈顿圆打不到', () => {
  /** 四个斜角 + 四个正交，全部贴身 */
  const RING8 = [
    { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
    { x: 2, y: 3 }, /* 施法者 (3,3) */ { x: 4, y: 3 },
    { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 },
  ];

  function castAgainstRing(
    skillId: string,
    kind: UnitKind = 'sword',
  ): { hits: string[]; cells: string[] } {
    // 兵种要和技能的 exclusiveProfession 对得上，否则施放校验直接拒掉
    const self = unit('p1', kind, { x: 3, y: 3 }, 'player', skillId);
    const foes = RING8.map((p, i) => unit(`e${i}`, 'sword', p, 'enemy'));
    const events = castSkillManual(self, UNIT_DEFS, [self, ...foes], emptyTerrain(7, 7));
    const cast = events.find((e) => e.type === 'skillCast');
    if (cast?.type !== 'skillCast') throw new Error(`${skillId} 没放出来`);
    return {
      hits: cast.hits.map((h) => h.target).sort(),
      cells: (cast.rangeCells ?? []).map((c) => `${c.x},${c.y}`).sort(),
    };
  }

  it('旋风斩打满贴身八格，四个斜角一个都不漏', () => {
    expect(getSkillSpec('whirl')!.shape).toEqual({ type: 'squareAoE', radius: 1 });
    const { hits, cells } = castAgainstRing('whirl');
    expect(hits.length, '八格里有人没被打到').toBe(8);
    // 斜角是 e0/e2/e5/e7（RING8 的四角）
    for (const uid of ['e0', 'e2', 'e5', 'e7']) {
      expect(hits, `斜角 ${uid} 没被打到`).toContain(uid);
    }
    // 高亮范围必须和实际命中一致，否则玩家照着高亮走位会被骗
    expect(cells.length).toBe(8);
    expect(cells).toContain('2,2');
    expect(cells).toContain('4,4');
    // 施法者自己那一格不高亮
    expect(cells).not.toContain('3,3');
  });

  it('炎环那类 neighborAoE 仍只打正交，斜角本来就不该被它打到', () => {
    // 盾墙震慑是 `neighborAoE manhattan:1`：形态是同心环但**没有**改成方形，
    // 因为它的特效画的就是环，不是盖满 3×3 的刃圈
    expect(getSkillSpec('shield_wall')!.shape).toEqual({ type: 'neighborAoE', manhattan: 1 });
    const { hits } = castAgainstRing('shield_wall', 'shield');
    expect(hits.sort()).toEqual(['e1', 'e3', 'e4', 'e6']);
  });
});
