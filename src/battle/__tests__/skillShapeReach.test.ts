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
