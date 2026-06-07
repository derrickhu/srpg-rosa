import type { TerrainId, UnitKind, UnitState, Vec2 } from '@/battle/types';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize, inBounds } from '@/battle/grid';
import { UNIT_DEFS } from '@/data/unitDefs';
import { POTION_DEFS } from '@/data/potionCatalog';
import { STAT_POTION_DEFS } from '@/data/statPotionCatalog';
import { canProfessionEquipSkill, defaultSkillId, skillDefForId } from '@/data/skillCatalog';
import type { Mercenary } from '@/game/mercenaryTypes';
import {
  addStatBonus,
  currentStage,
  getMercenary,
  nextPid,
  ZERO_STAT,
  type MvpGameState,
} from './GameState';

function enemyAt(state: MvpGameState, pos: Vec2): boolean {
  return currentStage(state).enemies.some((e) => e.x === pos.x && e.y === pos.y);
}

function overlayAt(state: MvpGameState, pos: Vec2): boolean {
  return state.terrainOverlay.some((o) => o.x === pos.x && o.y === pos.y);
}

const DEFAULT_MAX_DEPLOY = 3;

/** 当前关卡的有效最大上阵人数（含广告额外位） */
export function getMaxDeploy(state: MvpGameState): number {
  const base = currentStage(state).maxDeploy ?? DEFAULT_MAX_DEPLOY;
  return base + (state.adExtraSlot ?? 0);
}

export function canPlaceAt(state: MvpGameState, pos: Vec2): boolean {
  const { h } = gridSize(currentStage(state).terrain);
  const [r0, r1] = playerDeployRowRange(h);
  if (pos.y !== r0 && pos.y !== r1) return false;
  if (state.placements.some((p) => p.pos.x === pos.x && p.pos.y === pos.y)) return false;
  if (overlayAt(state, pos)) return false;
  if (state.placements.length >= getMaxDeploy(state)) return false;
  return true;
}

export function canPlaceTerrain(state: MvpGameState, pos: Vec2): boolean {
  if (state.terrainCharges <= 0) return false;
  const ter = currentStage(state).terrain;
  if (!inBounds(pos, ter)) return false;
  if (enemyAt(state, pos)) return false;
  if (state.placements.some((p) => p.pos.x === pos.x && p.pos.y === pos.y)) return false;
  if (overlayAt(state, pos)) return false;
  return true;
}

export function placeTerrainCell(state: MvpGameState, pos: Vec2, terrain: TerrainId = 'high'): boolean {
  if (!canPlaceTerrain(state, pos)) return false;
  state.terrainCharges -= 1;
  state.terrainOverlay.push({ x: pos.x, y: pos.y, terrain });
  return true;
}

export function placeMercenary(state: MvpGameState, rosterId: string, pos: Vec2): boolean {
  if (!getMercenary(state, rosterId)) return false;
  if (state.placements.some((p) => p.rosterId === rosterId)) return false;
  if (!canPlaceAt(state, pos)) return false;
  const carry = state.offFieldStatByRosterId[rosterId];
  if (carry) delete state.offFieldStatByRosterId[rosterId];
  state.placements.push({
    uid: nextPid(),
    rosterId,
    pos: { ...pos },
    statBonus: carry ? { ...carry } : { ...ZERO_STAT },
  });
  return true;
}

export function removePlacement(state: MvpGameState, pos: Vec2): void {
  const i = state.placements.findIndex((p) => p.pos.x === pos.x && p.pos.y === pos.y);
  if (i < 0) return;
  const [p] = state.placements.splice(i, 1)!;
  if (p.potionId) {
    state.potions[p.potionId] = (state.potions[p.potionId] ?? 0) + 1;
  }
  state.offFieldStatByRosterId[p.rosterId] = addStatBonus(
    state.offFieldStatByRosterId[p.rosterId],
    p.statBonus ?? { ...ZERO_STAT },
  );
}

export function attachStatPotionToPlacement(state: MvpGameState, pos: Vec2, statPotionId: string): boolean {
  const spec = STAT_POTION_DEFS[statPotionId];
  if (!spec) return false;
  if ((state.statPotions[statPotionId] ?? 0) <= 0) return false;
  const pl = state.placements.find((x) => x.pos.x === pos.x && x.pos.y === pos.y);
  if (!pl) return false;
  if (!pl.statBonus) pl.statBonus = { ...ZERO_STAT };
  pl.statBonus.atk += spec.addAtk;
  pl.statBonus.spd += spec.addSpd;
  pl.statBonus.move += spec.addMove;
  state.statPotions[statPotionId] -= 1;
  return true;
}

export function attachPotionToPlacement(state: MvpGameState, pos: Vec2, potionId: string): boolean {
  const def = POTION_DEFS[potionId];
  if (!def) return false;
  if ((state.potions[potionId] ?? 0) <= 0) return false;
  const pl = state.placements.find((x) => x.pos.x === pos.x && x.pos.y === pos.y);
  if (!pl) return false;
  if (pl.potionId) return false;
  pl.potionId = potionId;
  state.potions[potionId] -= 1;
  return true;
}

function resolveBattleSkillIdForMercenary(m: Mercenary): string {
  if (canProfessionEquipSkill(m.profession, m.activeSkillId) && skillDefForId(m.activeSkillId)) {
    return m.activeSkillId;
  }
  const owned = m.ownedSkillIds.find(
    (id) => canProfessionEquipSkill(m.profession, id) && skillDefForId(id),
  );
  if (owned) return owned;
  return defaultSkillId(m.profession);
}

export function cycleSkillForRoster(state: MvpGameState, rosterId: string): void {
  const m = getMercenary(state, rosterId);
  if (!m || m.ownedSkillIds.length <= 1) return;
  const valid = m.ownedSkillIds.filter((id) => canProfessionEquipSkill(m.profession, id));
  if (valid.length === 0) return;
  if (!valid.includes(m.activeSkillId)) {
    m.activeSkillId = valid[0]!;
    return;
  }
  const i = Math.max(0, valid.indexOf(m.activeSkillId));
  m.activeSkillId = valid[(i + 1) % valid.length]!;
}

export function buildBattleUnits(state: MvpGameState): UnitState[] {
  const st = currentStage(state);
  const units: UnitState[] = [];
  for (const e of st.enemies) {
    const d = UNIT_DEFS[e.defId];
    units.push({
      uid: e.uid,
      defId: e.defId,
      faction: 'enemy',
      hp: d.base.maxHp,
      pos: { x: e.x, y: e.y },
      skillCd: 0,
      movedInTurn: false,
    });
  }
  for (const p of state.placements) {
    const m = getMercenary(state, p.rosterId);
    if (!m) continue;
    const skInfo = skillDefForId(resolveBattleSkillIdForMercenary(m));
    const battleSkill = skInfo
      ? { id: skInfo.id, name: skInfo.name, cooldown: skInfo.cooldown, kind: skInfo.kind }
      : undefined;
    const pot = p.potionId ? POTION_DEFS[p.potionId] : undefined;
    const sb = p.statBonus ?? ZERO_STAT;
    units.push({
      uid: p.uid,
      defId: m.profession,
      faction: 'player',
      hp: m.base.maxHp,
      pos: { ...p.pos },
      skillCd: 0,
      movedInTurn: false,
      battleSkill,
      tempAtkMul: pot?.atkMul,
      bonusAtk: sb.atk,
      bonusSpd: sb.spd,
      bonusMove: sb.move,
      rosterId: m.rosterId,
      displayName: m.name,
      mercMaxHp: m.base.maxHp,
      mercAtk: m.base.atk,
      mercSpd: m.base.spd,
      mercMove: m.base.move,
      mercRange: m.strike.range,
      mercIsRanged: m.strike.isRanged,
      mercTaunt: m.strike.taunt,
    });
  }
  return units;
}

export function undoDeployForRetry(state: MvpGameState): void {
  for (const p of state.placements) {
    if (p.potionId) {
      state.potions[p.potionId] = (state.potions[p.potionId] ?? 0) + 1;
    }
    state.offFieldStatByRosterId[p.rosterId] = addStatBonus(
      state.offFieldStatByRosterId[p.rosterId],
      p.statBonus ?? { ...ZERO_STAT },
    );
  }
  state.placements = [];
  state.terrainCharges += state.terrainOverlay.length;
  state.terrainOverlay = [];
  state.adExtraSlot = 0;
}
