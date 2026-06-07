import type {
  BattleEvent,
  BattleReport,
  UnitArchetypeDef,
  UnitDef,
  UnitKind,
  UnitState,
  Vec2,
} from './types';
import { effectiveUnitDef } from './effectiveUnit';
import { canAttackFrom, chooseTurnAction, type AiDifficulty } from './ai';
import { computeDamage, terrainEvade } from './damage';
import { getSkillSpec } from '@/data/skillCatalog';
import { getTerrainAt, type TerrainGrid } from './grid';
import { MAX_BATTLE_ROUNDS } from './constants';
import { cellsFromDist, reachableCells, shortestPath4 } from './path';
import { trySkillAfterMove, trySkillBeforeMove } from './skills';
import { tickTimedBattleEffects } from './timedBattleEffects';
import { getTerrainSpec } from '@/data/terrainSpec';

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

function cloneUnits(units: UnitState[]): UnitState[] {
  return units.map((u) => ({
    uid: u.uid,
    defId: u.defId,
    faction: u.faction,
    hp: u.hp,
    pos: { ...u.pos },
    skillCd: u.skillCd ?? 0,
    movedInTurn: false,
    battleSkill: u.battleSkill,
    tempAtkMul: u.tempAtkMul,
    bonusAtk: u.bonusAtk,
    bonusSpd: u.bonusSpd,
    bonusMove: u.bonusMove,
    rosterId: u.rosterId,
    displayName: u.displayName,
    mercMaxHp: u.mercMaxHp,
    mercAtk: u.mercAtk,
    mercSpd: u.mercSpd,
    mercMove: u.mercMove,
    mercRange: u.mercRange,
    mercIsRanged: u.mercIsRanged,
    mercTaunt: u.mercTaunt,
    timedBattleEffects: u.timedBattleEffects?.map((e) => {
      switch (e.kind) {
        case 'taunt':
          return { kind: 'taunt' as const, roundsLeft: e.roundsLeft };
        case 'atkBonus':
          return { kind: 'atkBonus' as const, addAtk: e.addAtk, roundsLeft: e.roundsLeft };
        case 'atkDown':
          return { kind: 'atkDown' as const, subAtk: e.subAtk, roundsLeft: e.roundsLeft };
        case 'spdDown':
          return { kind: 'spdDown' as const, subSpd: e.subSpd, roundsLeft: e.roundsLeft };
        case 'spdBonus':
          return { kind: 'spdBonus' as const, addSpd: e.addSpd, roundsLeft: e.roundsLeft };
      }
    }),
  }));
}

function buildBlocked(units: UnitState[], selfUid: string): Set<string> {
  const s = new Set<string>();
  for (const u of units) {
    if (u.hp <= 0) continue;
    if (u.uid === selfUid) continue;
    s.add(key(u.pos));
  }
  return s;
}

function bySpeedOrder(units: UnitState[], defs: Record<UnitKind, UnitArchetypeDef>): UnitState[] {
  return [...units]
    .filter((u) => u.hp > 0)
    .sort((a, b) => {
      const sa = effectiveUnitDef(a, defs).spd;
      const sb = effectiveUnitDef(b, defs).spd;
      if (sb !== sa) return sb - sa;
      return a.uid.localeCompare(b.uid);
    });
}

function checkWinner(units: UnitState[]): 'player' | 'enemy' | null {
  const p = units.some((u) => u.faction === 'player' && u.hp > 0);
  const e = units.some((u) => u.faction === 'enemy' && u.hp > 0);
  if (p && e) return null;
  if (p) return 'player';
  return 'enemy';
}

export function runBattle(
  initialUnits: UnitState[],
  terrain: TerrainGrid,
  defs: Record<UnitKind, UnitArchetypeDef>,
  aiDifficulty: AiDifficulty = 'normal',
): BattleReport {
  const units = cloneUnits(initialUnits);
  const events: BattleEvent[] = [];
  let rounds = 0;

  while (rounds < MAX_BATTLE_ROUNDS) {
    const w0 = checkWinner(units);
    if (w0) {
      events.push({ type: 'end', winner: w0 });
      return { events, winner: w0, rounds };
    }

    rounds += 1;
    events.push({ type: 'round', round: rounds });
    tickTimedBattleEffects(units);
    for (const u of units) {
      if (u.hp <= 0) continue;
      u.movedInTurn = false;
      if (u.skillCd > 0) u.skillCd -= 1;
      const tSpec = getTerrainSpec(getTerrainAt(terrain, u.pos));
      if (tSpec.dotPerRound > 0) {
        u.hp -= tSpec.dotPerRound;
        if (u.hp <= 0) {
          events.push({ type: 'death', uid: u.uid });
        }
      }
    }

    const order = bySpeedOrder(units, defs);
    for (const actor of order) {
      const self = units.find((u) => u.uid === actor.uid);
      if (!self || self.hp <= 0) continue;

      events.push(...trySkillBeforeMove(self, defs, units, terrain));
      let w = checkWinner(units);
      if (w) {
        events.push({ type: 'end', winner: w });
        return { events, winner: w, rounds };
      }

      const choice = chooseTurnAction(self, defs, units, terrain, self.faction === 'enemy' ? aiDifficulty : 'normal');

      const atkDef = effectiveUnitDef(self, defs);
      const blockedReach = buildBlocked(units, self.uid);
      const reachDist = reachableCells(self.pos, atkDef.move, blockedReach, terrain);
      events.push({
        type: 'moveRange',
        uid: self.uid,
        cells: cellsFromDist(self.pos, reachDist),
      });

      if (choice.moveTo) {
        const blocked = buildBlocked(units, self.uid);
        const path = shortestPath4(self.pos, choice.moveTo, blocked, terrain);
        if (path && path.length > 1) {
          for (let i = 1; i < path.length; i++) {
            const from = { ...self.pos };
            const to = { ...path[i]! };
            self.pos = to;
            self.movedInTurn = true;
            events.push({ type: 'moveStep', uid: self.uid, from, to });
          }
        }
      }

      events.push(...trySkillAfterMove(self, defs, units, terrain));
      w = checkWinner(units);
      if (w) {
        events.push({ type: 'end', winner: w });
        return { events, winner: w, rounds };
      }

      const tgt = choice.attackTarget;
      if (tgt && tgt.hp > 0) {
        const tLive = units.find((u) => u.uid === tgt.uid);
        if (!tLive || tLive.hp <= 0 || !canAttackFrom(atkDef, self.pos, tLive)) {
          // 目标可能已被技能击杀或位移后已脱战
        } else {
          const evade = terrainEvade(terrain, tLive.pos);
          if (evade > 0 && Math.random() < evade) {
            events.push({
              type: 'attack',
              attacker: self.uid,
              target: tLive.uid,
              damage: 0,
              hpLeft: tLive.hp,
              attackLabel: '闪避',
            });
          } else {
            const defT = effectiveUnitDef(tLive, defs);
            let dmg = computeDamage(atkDef, defT, terrain, self.pos, tLive.pos);
            const sk = atkDef.skill;
            const chargeMul = sk ? getSkillSpec(sk.id)?.passiveBasicAttackMulIfMoved : undefined;
            if (chargeMul && self.movedInTurn) {
              dmg = Math.max(1, Math.floor(dmg * chargeMul));
            }
            dmg = Math.max(1, Math.floor(dmg * (self.tempAtkMul ?? 1)));
            tLive.hp -= dmg;
            events.push({
              type: 'attack',
              attacker: self.uid,
              target: tLive.uid,
              damage: dmg,
              hpLeft: Math.max(0, tLive.hp),
              attackLabel: '普攻',
            });
            if (tLive.hp <= 0) {
              events.push({ type: 'death', uid: tLive.uid });
            }
          }
        }
      }

      w = checkWinner(units);
      if (w) {
        events.push({ type: 'end', winner: w });
        return { events, winner: w, rounds };
      }
    }
  }

  events.push({ type: 'end', winner: 'enemy' });
  return { events, winner: 'enemy', rounds };
}
