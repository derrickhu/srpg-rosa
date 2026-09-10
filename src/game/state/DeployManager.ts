import type { TerrainId, UnitState, Vec2 } from '@/battle/types';
import {
  isPlayerDeployCell,
  playerDeployCells,
  remapDeployPos,
  resolveDeployZone,
} from '@/battle/deployZone';
import { gridSize, inBounds } from '@/battle/grid';
import { isPassable } from '@/data/terrainSpec';
import { enemyBaseStats } from '@/data/enemyCatalog';
import type { StageEnemySpawn } from '@/data/stagesMvp';
import { characterArtKey, getCharacterDef } from '@/data/characterCatalog';
import { isEliteDungeon } from '@/data/eliteCatalog';
import { isSandboxDungeon } from '@/data/sandboxLab';
import { allPlayerSkillSpecs, allSkillSpecs } from '@/data/skillCatalog';
import { canProfessionEquipSkill, defaultSkillId, skillDefForId } from '@/data/skillCatalog';
import { resolveEnemyBattleSkill } from '@/data/enemySkillCatalog';
import { characterEffectiveStats } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import {
  benchCharacters,
  currentEnemyScale,
  currentStage,
  getCharacter,
  nextPid,
  requireRun,
  type MvpGameState,
  type PlacementEntry,
  type RunState,
} from './GameState';
import {
  ENDLESS_DUNGEON,
  generateEndlessWave,
  endlessWaveScale,
  isEndlessDungeon,
} from '@/data/endlessCatalog';
import { battleTerrain } from './GameState';
import {
  isTutorialRun,
  tutorialBattle1Enemies,
  tutorialEnemyScaleMul,
} from '@/game/tutorial/tutorialRules';

function enemyAt(state: MvpGameState, pos: Vec2): boolean {
  // 无尽的敌人是开战时才抽落点的，布阵阶段棋盘上没有预设敌格
  if (isEndlessDungeon(requireRun(state).dungeonId)) return false;
  return currentStage(state).enemies.some((e) => e.x === pos.x && e.y === pos.y);
}

function overlayAt(run: RunState, pos: Vec2): boolean {
  return run.terrainOverlay.some((o) => o.x === pos.x && o.y === pos.y);
}

const DEFAULT_MAX_DEPLOY = 3;

/** 关卡写死的上阵上限，不含广告加位 */
export function getBaseMaxDeploy(state: MvpGameState): number {
  const run = requireRun(state);
  // 第一章第一关 maxDeploy=2，无尽复用那张地形但不能沿用 2 人上限
  if (isEndlessDungeon(run.dungeonId)) return ENDLESS_DUNGEON.maxParty;
  return currentStage(state).maxDeploy ?? DEFAULT_MAX_DEPLOY;
}

/** 当前节点的有效最大上阵人数（含本节点看广告多出来的那一个） */
export function getMaxDeploy(state: MvpGameState): number {
  return getBaseMaxDeploy(state) + (requireRun(state).adExtraSlot ?? 0);
}

function snapshotPlacements(list: PlacementEntry[]): PlacementEntry[] {
  return list.map((p) => ({ uid: p.uid, rosterId: p.rosterId, pos: { ...p.pos } }));
}

function findOpenDeployCell(state: MvpGameState): Vec2 | null {
  const run = requireRun(state);
  const stage = currentStage(state);
  for (const pos of playerDeployCells(stage)) {
    const t = stage.terrain[pos.y]?.[pos.x];
    if (!t || !isPassable(t)) continue;
    if (run.placements.some((p) => p.pos.x === pos.x && p.pos.y === pos.y)) continue;
    if (overlayAt(run, pos)) continue;
    if (enemyAt(state, pos)) continue;
    return pos;
  }
  return null;
}

/** 看广告多上一人：满编、替补还有人、棋盘还空得下、本节点还没加过 */
export function canOfferAdExtraSlot(state: MvpGameState): boolean {
  // 前两战的布阵被教程手指钉死，旁边突然多一颗广告钮会把遮罩指错。
  // 整章教学都藏起来又太狠：第三章节的 3/3 明明替补有人，玩家会以为功能丢了。
  if (isTutorialRun(state) && requireRun(state).nodeIndex <= 1) return false;
  const run = requireRun(state);
  if ((run.adExtraSlot ?? 0) > 0) return false;
  if (benchCharacters(state).length === 0) return false;
  if (run.placements.length < getBaseMaxDeploy(state)) return false;
  return findOpenDeployCell(state) != null;
}

/**
 * 第 2 战教学要空手布阵：近战前排、远程后排各点一格。
 * 带着上一场的人进来，手指会指到已经站着人的替补席。
 */
export function shouldSkipDeployCarry(state: MvpGameState): boolean {
  return isTutorialRun(state) && requireRun(state).nodeIndex === 1;
}

/** 记住当前上阵，供同一章下一关沿用。 */
export function rememberBattlePlacements(state: MvpGameState): void {
  const run = requireRun(state);
  if (run.placements.length === 0) return;
  run.lastBattlePlacements = snapshotPlacements(run.placements);
  const stage = currentStage(state);
  const { w, h } = gridSize(stage.terrain);
  run.lastBattleGridH = h;
  run.lastBattleGridW = w;
  run.lastBattleDeployZone = resolveDeployZone(stage);
}

function remapCarriedPos(state: MvpGameState, pos: Vec2): Vec2 {
  const run = requireRun(state);
  const stage = currentStage(state);
  const { w, h } = gridSize(stage.terrain);
  return remapDeployPos(
    {
      zone: run.lastBattleDeployZone ?? { kind: 'south' },
      w: run.lastBattleGridW ?? w,
      h: run.lastBattleGridH ?? h,
    },
    { zone: resolveDeployZone(stage), w, h },
    pos,
  );
}

/**
 * 把上一场上阵铺到当前关。前后排对齐到新图；原格还能站就站，
 * 被挡或超出地图就改空位。超员或人已经不在队里的丢掉。玩家仍可换人。
 */
export function applyCarriedPlacements(state: MvpGameState): void {
  const run = requireRun(state);
  const prev = run.lastBattlePlacements ?? [];
  if (prev.length === 0) return;
  const seen = new Set(run.placements.map((p) => p.rosterId));
  for (const p of prev) {
    if (run.placements.length >= getMaxDeploy(state)) break;
    if (seen.has(p.rosterId)) continue;
    if (!getCharacter(state, p.rosterId)) continue;
    if (!run.partyRosterIds.includes(p.rosterId)) continue;
    const mapped = remapCarriedPos(state, p.pos);
    const pos = canPlaceAt(state, mapped) ? mapped : findOpenDeployCell(state);
    if (!pos) continue;
    run.placements.push({ uid: nextPid(), rosterId: p.rosterId, pos: { ...pos } });
    seen.add(p.rosterId);
  }
}

export function grantAdExtraSlot(state: MvpGameState): boolean {
  if (!canOfferAdExtraSlot(state)) return false;
  requireRun(state).adExtraSlot = 1;
  return true;
}

export function canPlaceAt(state: MvpGameState, pos: Vec2): boolean {
  const run = requireRun(state);
  const stage = currentStage(state);
  const ter = stage.terrain;
  if (!inBounds(pos, ter)) return false;
  if (!isPlayerDeployCell(stage, pos)) return false;
  const cell = ter[pos.y]?.[pos.x];
  if (!cell || !isPassable(cell)) return false;
  if (run.placements.some((p) => p.pos.x === pos.x && p.pos.y === pos.y)) return false;
  if (overlayAt(run, pos)) return false;
  if (enemyAt(state, pos)) return false;
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

/** 这一格是不是玩家用券放上去的（地图自带的高地 / 林子不算） */
export function placedTerrainAt(state: MvpGameState, pos: Vec2): TerrainId | null {
  const run = requireRun(state);
  return run.terrainOverlay.find((o) => o.x === pos.x && o.y === pos.y)?.terrain ?? null;
}

/**
 * 收回自己放的地形，券退回库存。
 *
 * 和撤人同一套手感：点一下拿下来。地图自带的格子没有 overlay，收不走。
 */
export function removeTerrainCell(state: MvpGameState, pos: Vec2): TerrainId | null {
  const run = requireRun(state);
  const i = run.terrainOverlay.findIndex((o) => o.x === pos.x && o.y === pos.y);
  if (i < 0) return null;
  const [cell] = run.terrainOverlay.splice(i, 1);
  if (!cell) return null;
  run.terrainCharges[cell.terrain] = (run.terrainCharges[cell.terrain] ?? 0) + 1;
  return cell.terrain;
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
 * 这个角色的招牌技能，一人一招。唯一真相是角色表。
 *
 * 兜底到职业默认技只为名册里出现了表外角色（GM / 脏档）的情况，正常路径走不到。
 */
export function signatureSkillId(m: Character): string {
  const def = getCharacterDef(m.catalogId ?? m.rosterId);
  return def?.defaultSkillId ?? defaultSkillId(m.profession);
}

/**
 * 本局某角色主槽可选的技能。正式副本里只有招牌技能一个——主槽没有选择余地了。
 *
 * **试炼场**是例外，那里给出这个职业的全部专属招，**包括** `reserved`（在等新角色的）
 * 和 `enemyOnly`（转给敌人的）。试炼场存在的意义就是拿来试特效和手感，
 * 用正式规则约束它等于让它试不了东西；它不产出任何持久收益，放开不影响正式局。
 * 通用技（`exclusiveProfession === null`）不在这里，它们走临时槽的 `sandboxTempSkillIds`。
 */
export function effectiveOwnedSkillIds(state: MvpGameState, m: Character): string[] {
  const sig = signatureSkillId(m);
  const def = getCharacterDef(m.catalogId ?? m.rosterId);
  if (!def || !isSandboxDungeon(state.run?.dungeonId)) return [sig];
  const own = allSkillSpecs()
    .filter((s) => s.exclusiveProfession === def.profession)
    .map((s) => s.id);
  return [...new Set([sig, ...own])];
}

/** 本局某角色的临时技能（第二槽）id；没买过则 undefined */
export function tempSkillIdForRoster(state: MvpGameState, rosterId: string): string | undefined {
  return state.run?.runTempSkill[rosterId];
}

/** 本局某角色当前装配技能 = 试炼场的局内覆盖 ?? 招牌技能 */
export function activeSkillIdForRun(state: MvpGameState, m: Character): string {
  return state.run?.runEquip[m.rosterId] ?? signatureSkillId(m);
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

/** 试炼里给临时槽轮换的通用技（商店那批，不挑职业） */
export function sandboxTempSkillIds(): string[] {
  return allPlayerSkillSpecs()
    .filter((s) => s.exclusiveProfession === null && !s.reserved && !s.enemyOnly)
    .map((s) => s.id);
}

export function cycleTempSkillForRoster(state: MvpGameState, rosterId: string): void {
  const run = requireRun(state);
  if (!isSandboxDungeon(run.dungeonId)) return;
  const ids = sandboxTempSkillIds();
  if (ids.length === 0) return;
  const cur = run.runTempSkill[rosterId];
  const i = cur ? ids.indexOf(cur) : -1;
  const next = ids[(i + 1) % ids.length]!;
  run.runTempSkill[rosterId] = next;
}

/** 主槽轮换，只在试炼场存在（正式副本一人一招，`effectiveOwnedSkillIds` 只返回一个） */
export function cycleSkillForRoster(state: MvpGameState, rosterId: string): void {
  const run = requireRun(state);
  if (!isSandboxDungeon(run.dungeonId)) return;
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
  const endless = isEndlessDungeon(run.dungeonId);
  const scale = endless
    ? endlessWaveScale(run.endless?.wave ?? 1)
    : currentEnemyScale(state) * tutorialEnemyScaleMul(state);
  const units: UnitState[] = [];

  if (endless) {
    const occupied = [
      ...(run.endless?.carry ?? []).map((c) => c.pos),
      ...(run.endless?.groundDrops ?? []).map((d) => d.pos),
    ];
    const fallback = [
      ...run.placements.map((p) => p.pos),
      ...(run.endless?.groundDrops ?? []).map((d) => d.pos),
    ];
    const wave = generateEndlessWave(
      run.endless?.wave ?? 1,
      battleTerrain(state),
      occupied.length > 0 ? occupied : fallback,
    );
    for (const e of wave) units.push(enemySpawnToUnitState(e, scale));
  } else {
    const enemies = isTutorialRun(state) && run.nodeIndex === 0
      ? tutorialBattle1Enemies()
      : st.enemies;
    for (const e of enemies) units.push(enemySpawnToUnitState(e, scale));
  }

  const carryByRoster = new Map((run.endless?.carry ?? []).map((c) => [c.rosterId, c]));
  // 无尽第二波起只带还活着的人上场。死掉的不复活——「直到全队倒下」否则没有牙齿。
  const playerSlots = endless && carryByRoster.size > 0
    ? run.placements.filter((p) => carryByRoster.has(p.rosterId))
    : run.placements;

  for (const p of playerSlots) {
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
    const carry = carryByRoster.get(p.rosterId);
    units.push({
      uid: carry?.uid ?? p.uid,
      defId: m.profession,
      animSet: characterArtKey(m),
      faction: 'player',
      hp: carry ? carry.hp : eff.maxHp,
      pos: carry ? { ...carry.pos } : { ...p.pos },
      skillCd: carry?.skillCd ?? 0,
      movedInTurn: false,
      battleSkill,
      tempSkill,
      tempSkillCd: carry?.tempSkillCd ?? 0,
      timedBattleEffects: carry?.timedBattleEffects
        ? carry.timedBattleEffects.map((e) => ({ ...e }))
        : undefined,
      // 词条按**角色**挂，所以两个槽都吃：规则是「这个人的技能更强了」，
      // 不是「这一招更强了」。临时技能大多是控制/治疗，`canApply` 会把
      // 「伤害 +25%」这类挂不上去的自动跳过，不会出现临时技能白嫖伤害词条。
      skillMods: run.skillMods[m.rosterId],
      eliteTempBoost: isEliteDungeon(run.dungeonId),
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

/** 战败重打：只收回地形券。上阵沿用，玩家要换人再自己改。 */
export function undoDeployForRetry(state: MvpGameState): void {
  const run = requireRun(state);
  for (const o of run.terrainOverlay) {
    run.terrainCharges[o.terrain] = (run.terrainCharges[o.terrain] ?? 0) + 1;
  }
  run.terrainOverlay = [];
}
