import type { TerrainId, UnitState, Vec2 } from '@/battle/types';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize, inBounds } from '@/battle/grid';
import { enemyBaseStats } from '@/data/enemyCatalog';
import type { StageEnemySpawn } from '@/data/stagesMvp';
import { canProfessionEquipSkill, defaultSkillId, skillDefForId } from '@/data/skillCatalog';
import { resolveEnemyBattleSkill } from '@/data/enemySkillCatalog';
import { characterEffectiveStats } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import {
  currentEnemyScale,
  currentStage,
  getCharacter,
  nextPid,
  requireRun,
  type MvpGameState,
  type RunState,
} from './GameState';

function enemyAt(state: MvpGameState, pos: Vec2): boolean {
  return currentStage(state).enemies.some((e) => e.x === pos.x && e.y === pos.y);
}

function overlayAt(run: RunState, pos: Vec2): boolean {
  return run.terrainOverlay.some((o) => o.x === pos.x && o.y === pos.y);
}

const DEFAULT_MAX_DEPLOY = 3;

/** 当前节点的有效最大上阵人数（含广告额外位） */
export function getMaxDeploy(state: MvpGameState): number {
  const run = requireRun(state);
  const base = currentStage(state).maxDeploy ?? DEFAULT_MAX_DEPLOY;
  return base + (run.adExtraSlot ?? 0);
}

export function canPlaceAt(state: MvpGameState, pos: Vec2): boolean {
  const run = requireRun(state);
  const { h } = gridSize(currentStage(state).terrain);
  const [r0, r1] = playerDeployRowRange(h);
  if (pos.y !== r0 && pos.y !== r1) return false;
  if (run.placements.some((p) => p.pos.x === pos.x && p.pos.y === pos.y)) return false;
  if (overlayAt(run, pos)) return false;
  if (run.placements.length >= getMaxDeploy(state)) return false;
  return true;
}

/** 地形券库存总数 */
export function terrainChargesTotal(run: RunState): number {
  let s = 0;
  for (const k of Object.keys(run.terrainCharges)) s += run.terrainCharges[k] ?? 0;
  return s;
}

/** 该格是否允许放置地形（不检查库存，库存在 `placeTerrainCell` 检查） */
export function canPlaceTerrain(state: MvpGameState, pos: Vec2): boolean {
  const run = requireRun(state);
  const ter = currentStage(state).terrain;
  if (!inBounds(pos, ter)) return false;
  if (enemyAt(state, pos)) return false;
  if (run.placements.some((p) => p.pos.x === pos.x && p.pos.y === pos.y)) return false;
  if (overlayAt(run, pos)) return false;
  return true;
}

export function placeTerrainCell(state: MvpGameState, pos: Vec2, terrain: TerrainId): boolean {
  const run = requireRun(state);
  if ((run.terrainCharges[terrain] ?? 0) <= 0) return false;
  if (!canPlaceTerrain(state, pos)) return false;
  run.terrainCharges[terrain] = (run.terrainCharges[terrain] ?? 0) - 1;
  run.terrainOverlay.push({ x: pos.x, y: pos.y, terrain });
  return true;
}

export function placeCharacter(state: MvpGameState, rosterId: string, pos: Vec2): boolean {
  const run = requireRun(state);
  if (!getCharacter(state, rosterId)) return false;
  if (!run.partyRosterIds.includes(rosterId)) return false;
  if (run.placements.some((p) => p.rosterId === rosterId)) return false;
  if (!canPlaceAt(state, pos)) return false;
  run.placements.push({ uid: nextPid(), rosterId, pos: { ...pos } });
  return true;
}

export function removePlacement(state: MvpGameState, pos: Vec2): void {
  const run = requireRun(state);
  const i = run.placements.findIndex((p) => p.pos.x === pos.x && p.pos.y === pos.y);
  if (i < 0) return;
  run.placements.splice(i, 1);
}

/**
 * 本局某角色主槽可选的技能。
 *
 * 只有局外用魂晶学到的技能进得来：商店买的临时技能走的是**另一个槽**
 * （`run.runTempSkill`），不参与主槽轮换。两个池子混在一起时，
 * 「换主技能」和「买到新技能」这两件事在布阵页长得一模一样，
 * 但前者是可逆的选择、后者是花过钱的既成事实。
 */
export function effectiveOwnedSkillIds(_state: MvpGameState, m: Character): string[] {
  return [...new Set(m.ownedSkillIds)];
}

/** 本局某角色的临时技能（第二槽）id；没买过则 undefined */
export function tempSkillIdForRoster(state: MvpGameState, rosterId: string): string | undefined {
  return state.run?.runTempSkill[rosterId];
}

/** 本局某角色当前装配技能 = 局内覆盖 ?? 持久装配 */
export function activeSkillIdForRun(state: MvpGameState, m: Character): string {
  return state.run?.runEquip[m.rosterId] ?? m.activeSkillId;
}

/** 本局某角色实际会带上场的两个技能槽 */
export function battleSkillIdsForCharacter(
  state: MvpGameState,
  m: Character,
): { main: string; temp?: string } {
  const temp = tempSkillIdForRoster(state, m.rosterId);
  return { main: resolveBattleSkillIdForCharacter(state, m), temp };
}

export function resolveBattleSkillIdForCharacter(state: MvpGameState, m: Character): string {
  const owned = effectiveOwnedSkillIds(state, m);
  const active = activeSkillIdForRun(state, m);
  if (
    owned.includes(active) &&
    canProfessionEquipSkill(m.profession, active) &&
    skillDefForId(active)
  ) {
    return active;
  }
  const firstValid = owned.find(
    (id) => canProfessionEquipSkill(m.profession, id) && skillDefForId(id),
  );
  if (firstValid) return firstValid;
  return defaultSkillId(m.profession);
}

export function cycleSkillForRoster(state: MvpGameState, rosterId: string): void {
  const run = requireRun(state);
  const m = getCharacter(state, rosterId);
  if (!m) return;
  const valid = effectiveOwnedSkillIds(state, m).filter((id) =>
    canProfessionEquipSkill(m.profession, id),
  );
  if (valid.length <= 1) return;
  const cur = activeSkillIdForRun(state, m);
  const i = Math.max(0, valid.indexOf(cur));
  run.runEquip[rosterId] = valid[(i + 1) % valid.length]!;
}

/**
 * 敌方摆位 → 战场单位。
 *
 * 单独抽出来是因为布阵页的「点敌人看信息」也要用它：预览和实战必须是同一份数值，
 * 各算各的迟早出现预览写 28 攻、开打变 34 攻，而玩家会按预览做决策。
 */
export function enemySpawnToUnitState(e: StageEnemySpawn, scale: number): UnitState {
  const b = { ...enemyBaseStats(e.defId), ...e.stats };
  const maxHp = Math.round(b.maxHp * scale);
  // 敌方技能只来自蓝图显式配置；没有就是纯普攻。不再回退兵种默认技。
  const battleSkill = resolveEnemyBattleSkill({
    skillSkin: e.skillSkin,
    skillId: e.skillId,
  });
  return {
    uid: e.uid,
    defId: e.defId,
    faction: 'enemy',
    hp: maxHp,
    pos: { x: e.x, y: e.y },
    skillCd: 0,
    movedInTurn: false,
    battleSkill,
    displayName: e.name,
    boss: e.boss,
    animSet: e.animSet,
    mercMaxHp: maxHp,
    mercAtk: Math.round(b.atk * scale),
    mercSpd: b.spd,
    mercMove: b.move,
  };
}

export function buildBattleUnits(state: MvpGameState): UnitState[] {
  const run = requireRun(state);
  const st = currentStage(state);
  const scale = currentEnemyScale(state);
  const units: UnitState[] = [];
  for (const e of st.enemies) units.push(enemySpawnToUnitState(e, scale));
  for (const p of run.placements) {
    const m = getCharacter(state, p.rosterId);
    if (!m) continue;
    const eff = characterEffectiveStats(m);
    const slots = battleSkillIdsForCharacter(state, m);
    const skInfo = skillDefForId(slots.main);
    const battleSkill = skInfo
      ? { id: skInfo.id, name: skInfo.name, cooldown: skInfo.cooldown, kind: skInfo.kind }
      : undefined;
    const tmpInfo = slots.temp ? skillDefForId(slots.temp) : undefined;
    const tempSkill = tmpInfo
      ? { id: tmpInfo.id, name: tmpInfo.name, cooldown: tmpInfo.cooldown, kind: tmpInfo.kind }
      : undefined;
    units.push({
      uid: p.uid,
      defId: m.profession,
      faction: 'player',
      hp: eff.maxHp,
      pos: { ...p.pos },
      skillCd: 0,
      movedInTurn: false,
      battleSkill,
      tempSkill,
      tempSkillCd: 0,
      // 词条按**角色**挂，所以两个槽都吃：规则是「这个人的技能更强了」，
      // 不是「这一招更强了」。临时技能大多是控制/治疗，`canApply` 会把
      // 「伤害 +25%」这类挂不上去的自动跳过，不会出现临时技能白嫖伤害词条。
      skillMods: run.skillMods[m.rosterId],
      rosterId: m.rosterId,
      displayName: m.name,
      mercMaxHp: eff.maxHp,
      mercAtk: eff.atk,
      mercSpd: eff.spd,
      mercMove: eff.move,
      mercRange: m.strike.range,
      mercIsRanged: m.strike.isRanged,
      mercTaunt: m.strike.taunt,
    });
  }
  return units;
}

/** 战败/重打：撤回本节点部署、退回地形券（不影响 meta） */
export function undoDeployForRetry(state: MvpGameState): void {
  const run = requireRun(state);
  run.placements = [];
  for (const o of run.terrainOverlay) {
    run.terrainCharges[o.terrain] = (run.terrainCharges[o.terrain] ?? 0) + 1;
  }
  run.terrainOverlay = [];
  run.adExtraSlot = 0;
}
