import { SAVE_META_KEY, SAVE_RUN_KEY } from '@/config/CloudConfig';
import { PersistService } from '@/core/PersistService';
import { safeStorageGet, safeStorageSet } from '@/platform/wxPlatform';
import type { MetaState, MvpGameState, RunState } from '@/game/state/GameState';
import { createInitialMeta, createInitialState, META_VERSION } from '@/game/state/GameState';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { isEndlessDungeon } from '@/data/endlessCatalog';
import { LEGACY_CHARACTER_IDS, remapLegacyCharacterId } from '@/data/characterCatalog';
import { remapLegacyRoster } from '@/game/characterFactory';
import { remapLegacySkillId } from '@/data/skillCatalog';

const META_KEY = SAVE_META_KEY;
// run v4：第一章扩为 7 关后关卡下标整体变更，v3 的局内进度直接作废（只损失一局）
const RUN_KEY = SAVE_RUN_KEY;
const LEGACY_META_KEY_V2 = 'srpg_meta_v2';
const LEGACY_RUN_KEY_V2 = 'srpg_run_v2';
const LEGACY_RUN_KEY_V3 = 'srpg_run_v3';
const LEGACY_KEY_V1 = 'srpg_save_v1';

function persistGet(key: string): string | null {
  return PersistService.readRaw(key);
}

function persistSet(key: string, value: string): void {
  if (!value) {
    PersistService.remove(key);
    return;
  }
  PersistService.writeRaw(key, value);
}

interface MetaPayload {
  version: typeof META_VERSION;
  meta: MetaState;
  savedAt: number;
}

interface RunPayload {
  version: typeof META_VERSION;
  run: RunState;
  savedAt: number;
}

/**
 * 补齐同一 version 内**新增的字段**，并丢掉已经废弃的。
 *
 * 纯字段增删不值得升 META_VERSION：升版会连带作废玩家的名册和魂晶（或者要写一份 meta 迁移），
 * 而这里只是几个数字。
 *
 * `pendingSoul` 是上一版的「累计魂晶、通关兑现」，现在改成了按节点首通当场发放
 * （见 `ProgressManager` 顶部）。老档里那个数直接丢弃：它记的是一笔**还没兑现**的账，
 * 而新规则下这局沿途的首通魂晶已经发过了，再补一次等于双倍发放。
 *
 * `statPotions` / `offFieldStatByRosterId` 是已删除的精华系统的库存，同样丢弃——
 * 精华的加成已经没有任何东西会去读了，留着只会让存档一直变大。
 *
 * `skillMods` **整个清空**而不是补默认值。老档里它按 skillId 记，新代码按 rosterId 读，
 * 两边键空间不一样但类型完全相同（`Record<string, string[]>`），
 * 直接读进来不会报错——会静默地把「旋风斩的 3 层锋锐」当成
 * 「rosterId 恰好叫 whirl 的那个角色的 3 层锋锐」，也就是谁都拿不到。
 * 这种错法比崩溃难查得多，宁可让读档的人少几条词条。
 *
 * `runSkillGrants` 是主槽技能书的库存，商店改发临时技能后没有代码再读它。
 */
function normalizeRun(run: RunState): RunState {
  const {
    pendingSoul: _soul,
    statPotions: _potions,
    offFieldStatByRosterId: _carry,
    runSkillGrants: _grants,
    ...rest
  } = run as RunState & {
    pendingSoul?: number;
    statPotions?: Record<string, number>;
    offFieldStatByRosterId?: Record<string, unknown>;
    runSkillGrants?: Record<string, string[]>;
  };
  const partyRosterIds = (rest.partyRosterIds ?? []).map(remapLegacyCharacterId);
  const remappedAway = new Set<string>();
  for (const [oldId, newId] of Object.entries(LEGACY_CHARACTER_IDS)) {
    if ((rest.partyRosterIds ?? []).includes(oldId)) remappedAway.add(newId);
  }
  const knownRoster = new Set(partyRosterIds);
  const remapKeyed = <T,>(rec: Record<string, T> | undefined): Record<string, T> =>
    Object.fromEntries(
      Object.entries(rec ?? {})
        .map(([k, v]) => [remapLegacyCharacterId(k), v] as const)
        .filter(([k]) => knownRoster.has(k) && !remappedAway.has(k)),
    );
  return {
    ...rest,
    partyRosterIds,
    lastVictory: rest.lastVictory ?? null,
    skillMods: Object.fromEntries(
      Object.entries(remapKeyed(rest.skillMods)).map(([k, mods]) => [
        k,
        (mods as string[]).map((id) => (id === 'ex_arcane_starfire' ? 'ex_flame_ignite' : id)),
      ]),
    ),
    runTempSkill: Object.fromEntries(
      Object.entries(remapKeyed(rest.runTempSkill)).map(([k, v]) => [k, remapLegacySkillId(v)]),
    ),
    runEquip: remapKeyed(rest.runEquip),
    // 老档的 placements 上挂着 statBonus，读进来会原样带着一个没人认识的字段。
    placements: rest.placements.map((p) => ({
      uid: p.uid,
      rosterId: remapLegacyCharacterId(p.rosterId),
      pos: p.pos,
    })),
    endless: rest.endless
      ? {
          ...rest.endless,
          carry: rest.endless.carry
            ? rest.endless.carry.map((c) => ({
                ...c,
                rosterId: remapLegacyCharacterId(c.rosterId),
              }))
            : rest.endless.carry,
        }
      : (
        isEndlessDungeon(rest.dungeonId)
          ? { wave: 1, clearedCurrent: false, carry: null }
          : undefined
      ),
    pendingLoot:
      rest.pendingLoot?.some(
        (o) => o.kind === 'skillMod' && o.rosterId in LEGACY_CHARACTER_IDS,
      )
        ? null
        : rest.pendingLoot ?? null,
  };
}

/**
 * 同上，meta 侧的新增字段补默认值。
 *
 * `clearedNodesByDungeonId` 缺失时补空对象而不是「按 clearedDungeonIds 推算」：
 * 老档里没有逐节点记录，猜出来的值可能给出玩家其实没打过的关的扫荡权限。
 * 补空的代价只是老玩家要再打一次才拿到扫荡，而猜错的代价是他能跳过没学会的内容。
 *
 * `sweepUsageByDungeonId` 补空则是白送老玩家今天的配额——反正它每天都要归零，
 * 没有值得防的东西。
 */
function normalizeMeta(meta: MetaState): MetaState {
  return {
    ...meta,
    roster: remapLegacyRoster(meta.roster),
    clearedNodesByDungeonId: meta.clearedNodesByDungeonId ?? {},
    sweepUsageByDungeonId: meta.sweepUsageByDungeonId ?? {},
  };
}

/** 进入副本后断点续局时，从节点类型推断稳妥的恢复阶段（不恢复战斗中/结算中） */
function resumePhase(run: RunState): MvpGameState['phase'] {
  const d = getDungeonDef(run.dungeonId);
  const node = d?.nodes[run.nodeIndex];
  return node?.kind === 'shop' ? 'shop' : 'deploy';
}

/**
 * v2 → v3 迁移：
 * - meta：名册结构不变，直接升 version（角色/魂晶/解锁全保留）。
 * - run：v3 改了地形券/药剂/战利品结构，旧局内进度直接丢弃（只损失一局）。
 * - v1 整包档：结构不兼容，清除。
 */
function migrateLegacyIfAny(): void {
  const legacyV1 = safeStorageGet(LEGACY_KEY_V1);
  if (legacyV1) safeStorageSet(LEGACY_KEY_V1, '');
  const legacyRunV3 = safeStorageGet(LEGACY_RUN_KEY_V3);
  if (legacyRunV3) safeStorageSet(LEGACY_RUN_KEY_V3, '');

  if (safeStorageGet(META_KEY)) return;
  const rawV2 = safeStorageGet(LEGACY_META_KEY_V2);
  if (!rawV2) return;
  try {
    const payload = JSON.parse(rawV2) as { version?: number; meta?: MetaState };
    if (payload.version === 2 && payload.meta && Array.isArray(payload.meta.roster)) {
      const meta: MetaState = { ...payload.meta, version: META_VERSION };
      SaveManager.saveMeta(meta);
    }
  } catch (e) {
    console.warn('[SaveManager] v2 meta migrate failed:', e);
  }
  safeStorageSet(LEGACY_META_KEY_V2, '');
  safeStorageSet(LEGACY_RUN_KEY_V2, '');
}

export const SaveManager = {
  saveMeta(meta: MetaState): boolean {
    try {
      const payload: MetaPayload = { version: META_VERSION, meta, savedAt: Date.now() };
      persistSet(META_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[SaveManager] saveMeta failed:', e);
      return false;
    }
  },

  saveRun(run: RunState | null): boolean {
    try {
      if (!run) {
        persistSet(RUN_KEY, '');
        return true;
      }
      const payload: RunPayload = { version: META_VERSION, run, savedAt: Date.now() };
      persistSet(RUN_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[SaveManager] saveRun failed:', e);
      return false;
    }
  },

  /** 同时持久化 meta 与 run（run 为空则清除续局档） */
  save(state: MvpGameState): boolean {
    const a = SaveManager.saveMeta(state.meta);
    const b = SaveManager.saveRun(state.run);
    return a && b;
  },

  loadMeta(): MetaState | null {
    try {
      const raw = persistGet(META_KEY);
      if (!raw) return null;
      const payload: MetaPayload = JSON.parse(raw);
      if (payload.version !== META_VERSION || !payload.meta) return null;
      if (!Array.isArray(payload.meta.roster)) return null;
      return normalizeMeta(payload.meta);
    } catch (e) {
      console.warn('[SaveManager] loadMeta failed:', e);
      return null;
    }
  },

  loadRun(): RunState | null {
    try {
      const raw = persistGet(RUN_KEY);
      if (!raw) return null;
      const payload: RunPayload = JSON.parse(raw);
      if (payload.version !== META_VERSION || !payload.run) return null;
      if (!getDungeonDef(payload.run.dungeonId)) return null;
      return normalizeRun(payload.run);
    } catch (e) {
      console.warn('[SaveManager] loadRun failed:', e);
      return null;
    }
  },

  load(): MvpGameState | null {
    migrateLegacyIfAny();
    const meta = SaveManager.loadMeta();
    if (!meta) return null;
    const run = SaveManager.loadRun();
    return {
      meta,
      run,
      phase: run ? resumePhase(run) : 'hub',
      lastEventsLen: 0,
    };
  },

  clearRun(): void {
    persistSet(RUN_KEY, '');
  },

  /** 整体重置：清除 meta 与 run */
  clear(): void {
    persistSet(META_KEY, '');
    persistSet(RUN_KEY, '');
  },

  loadOrCreate(): MvpGameState {
    const loaded = SaveManager.load();
    if (loaded) return loaded;
    const fresh = createInitialState();
    // 确保新档落地（含初始 meta）
    SaveManager.saveMeta(fresh.meta ?? createInitialMeta());
    return fresh;
  },
};
