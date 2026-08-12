import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '@/data/unitDefs';
import { emptyTerrain } from '../grid';
import type { UnitState } from '../types';
import {
  attackableCellsFrom,
  cellsThreatenedByEnemies,
  dangerMoveCellsForMover,
  enemiesThreateningCell,
} from '../threatMap';
import { effectiveUnitDef } from '../effectiveUnit';

function makeUnit(
  uid: string,
  defId: 'sword' | 'bow' | 'cavalry' | 'shield',
  faction: 'player' | 'enemy',
  pos: { x: number; y: number },
): UnitState {
  const d = UNIT_DEFS[defId];
  return {
    uid,
    defId,
    faction,
    hp: d.base.maxHp,
    pos: { ...pos },
    skillCd: 0,
    movedInTurn: false,
  };
}

describe('attackableCellsFrom', () => {
  it('melee: four neighbors', () => {
    const def = effectiveUnitDef(makeUnit('e', 'sword', 'enemy', { x: 2, y: 2 }), UNIT_DEFS);
    const cells = attackableCellsFrom(def, { x: 2, y: 2 }, emptyTerrain(5, 5));
    expect(new Set(cells.map((c) => `${c.x},${c.y}`))).toEqual(
      new Set(['1,2', '3,2', '2,1', '2,3']),
    );
  });

  it('ranged: manhattan 1..range', () => {
    const def = effectiveUnitDef(makeUnit('e', 'bow', 'enemy', { x: 0, y: 0 }), UNIT_DEFS);
    const cells = attackableCellsFrom(def, { x: 0, y: 0 }, emptyTerrain(5, 5));
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('0,0')).toBe(false);
    expect(keys.has('3,0')).toBe(true);
    expect(keys.has('4,0')).toBe(false);
  });
});

describe('cellsThreatenedByEnemies', () => {
  it('melee enemy threatens adjacent cells from standing tile', () => {
    const enemy = makeUnit('e1', 'sword', 'enemy', { x: 2, y: 2 });
    const player = makeUnit('p1', 'sword', 'player', { x: 0, y: 0 });
    const threat = cellsThreatenedByEnemies(
      [enemy, player],
      UNIT_DEFS,
      emptyTerrain(5, 5),
      'player',
    );
    expect(threat.has('2,1')).toBe(true);
    // 敌人走开再打回来时，原脚下也在威胁里——和战棋危险区一致
    expect(threat.has('2,2')).toBe(true);
  });

  it('includes cells reachable after enemy move', () => {
    // sword move=3：站在 (0,0) 可走到 (3,0)，再普攻 (4,0)
    const enemy = makeUnit('e1', 'sword', 'enemy', { x: 0, y: 0 });
    const threat = cellsThreatenedByEnemies(
      [enemy],
      UNIT_DEFS,
      emptyTerrain(5, 5),
      'player',
    );
    expect(threat.has('4,0')).toBe(true);
  });

  it('blocking unit shortens threat', () => {
    // 1 高走廊：敌人 (0,0)，己方挡在 (1,0)，敌人穿不过去
    const enemy = makeUnit('e1', 'sword', 'enemy', { x: 0, y: 0 });
    const blocker = makeUnit('p2', 'sword', 'player', { x: 1, y: 0 });
    const terrain = emptyTerrain(5, 1);
    const threat = cellsThreatenedByEnemies(
      [enemy, blocker],
      UNIT_DEFS,
      terrain,
      'player',
    );
    // 可达仅脚下；普攻可打挡路格，打不到更远
    expect(threat.has('1,0')).toBe(true);
    expect(threat.has('4,0')).toBe(false);
  });
});

describe('enemiesThreateningCell', () => {
  it('lists enemy that can reach-and-strike the cell', () => {
    const enemy = makeUnit('e1', 'bow', 'enemy', { x: 0, y: 0 });
    const player = makeUnit('p1', 'sword', 'player', { x: 4, y: 0 });
    const hit = enemiesThreateningCell(
      [enemy, player],
      UNIT_DEFS,
      emptyTerrain(5, 5),
      { x: 4, y: 0 },
      'player',
    );
    // bow move=2, range=3：走两步到 (2,0) 可打 (4,0)（距离 2）
    expect(hit.map((u) => u.uid)).toEqual(['e1']);
  });

  it('empty when out of move+range', () => {
    const enemy = makeUnit('e1', 'sword', 'enemy', { x: 0, y: 0 });
    const hit = enemiesThreateningCell(
      [enemy],
      UNIT_DEFS,
      emptyTerrain(8, 1),
      { x: 7, y: 0 },
      'player',
    );
    expect(hit).toEqual([]);
  });
});

describe('dangerMoveCellsForMover', () => {
  it('按落点占位算威胁，避免「原地挡路」把危险格标成安全', () => {
    // 1 高走廊：敌人 (0,0)，玩家挡在 (2,0)。若仍按原地算，(4,0) 够不到；
    // 玩家走到 (4,0) 后让出通道，敌人可走到 (3,0) 普攻——落点必须标红。
    const enemy = makeUnit('e1', 'sword', 'enemy', { x: 0, y: 0 });
    const player = makeUnit('p1', 'sword', 'player', { x: 2, y: 0 });
    const terrain = emptyTerrain(5, 1);
    const stayPut = cellsThreatenedByEnemies(
      [enemy, player],
      UNIT_DEFS,
      terrain,
      'player',
    );
    expect(stayPut.has('4,0')).toBe(false);
    const danger = dangerMoveCellsForMover(
      [enemy, player],
      UNIT_DEFS,
      terrain,
      'p1',
      [{ x: 4, y: 0 }],
    );
    expect(danger).toEqual([{ x: 4, y: 0 }]);
  });
});
