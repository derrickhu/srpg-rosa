import type { DungeonDef } from '@/data/dungeonCatalog';
import type {
  SkillCastAllyEffect,
  SkillCastFoeEffect,
  SkillCastSelfEffect,
  SkillDamageSpec,
  SkillSpec,
} from '@/data/skillCatalog';

/**
 * 精英难度：通关对应主线章后，用**同一张图、同一串节点**再打一遍，只把敌人打厚。
 *
 * 不进 `DUNGEON_DEFS`，避免冒险页多滑出六张卡。关卡蓝图也不另开——
 * 上一版每章一场再战图里的 Boss 全是主线已有角色（卡格 / 图伦 / 城卫长 /
 * 塔玛 / 卡尔萨 / 酋长），没有需要留给后面章节的新单位。
 */

/** 叠在主线节点 `enemyScale` 上，Boss 节点原有的 1.1 相对优势还在 */
export const ELITE_ENEMY_SCALE = 1.3;

/** 整章扫荡仍比主线 3 高一截，节点首通跟主线走 +2 / +5 */
export const ELITE_REPEAT_SOUL = 5;

export interface EliteChapterMeta {
  id: string;
  officialId: string;
  desc: string;
}

export const ELITE_CHAPTERS: readonly EliteChapterMeta[] = [
  {
    id: 'elite_grassland',
    officialId: 'dungeon_grassland',
    desc: '同一条草原战线，敌人更厚。角色提升后再来拿成就感。',
  },
  {
    id: 'elite_forest',
    officialId: 'dungeon_forest',
    desc: '同一片密林，火与箭都更疼。通关密林后可挑战。',
  },
  {
    id: 'elite_fortress',
    officialId: 'dungeon_fortress',
    desc: '同一座要塞，墙后的弩更狠。通关要塞后可挑战。',
  },
  {
    id: 'elite_swamp',
    officialId: 'dungeon_swamp',
    desc: '同一片毒沼，泥和毒叠得更紧。通关毒沼后可挑战。',
  },
  {
    id: 'elite_dragon',
    officialId: 'dungeon_dragon',
    desc: '同一条裂谷，龙裔的兵更硬。通关龙岭后可挑战。',
  },
  {
    id: 'elite_bloodfang',
    officialId: 'dungeon_bloodfang',
    desc: '同一座祭坛，祭仪更狠。通关祭坛后可挑战。',
  },
];

const ELITE_BY_ID = new Map(ELITE_CHAPTERS.map((e) => [e.id, e]));
const ELITE_BY_OFFICIAL = new Map(ELITE_CHAPTERS.map((e) => [e.officialId, e]));

export function isEliteDungeon(id: string | undefined | null): boolean {
  return !!id && ELITE_BY_ID.has(id);
}

export function eliteIdOf(officialId: string): string | undefined {
  return ELITE_BY_OFFICIAL.get(officialId)?.id;
}

/** 主线章 → 对应精英本（同图加压后的完整 def） */
export function eliteDungeonOf(official: DungeonDef): DungeonDef | undefined {
  return ELITE_BY_OFFICIAL.has(official.id) ? assembleEliteDungeon(official) : undefined;
}

/** 精英本 id → 对应主线章 id（冒险页仍滑主线卡） */
export function officialDungeonIdOfElite(eliteId: string): string | undefined {
  return ELITE_BY_ID.get(eliteId)?.officialId;
}

export function assembleEliteDungeon(official: DungeonDef): DungeonDef {
  const meta = ELITE_BY_OFFICIAL.get(official.id);
  if (!meta) {
    throw new Error(`assembleEliteDungeon: ${official.id} 没有对应精英本`);
  }
  return {
    ...official,
    id: meta.id,
    name: `${official.name} · 精英`,
    desc: meta.desc,
    nodes: official.nodes.map((n) =>
      n.kind === 'shop'
        ? { ...n }
        : { ...n, enemyScale: (n.enemyScale ?? 1) * ELITE_ENEMY_SCALE },
    ),
    unlock: { kind: 'clearDungeon', dungeonId: official.id },
  };
}

export function listEliteDungeons(officials: readonly DungeonDef[]): DungeonDef[] {
  return officials.filter((d) => ELITE_BY_OFFICIAL.has(d.id)).map(assembleEliteDungeon);
}

const FLAT_DMG_MUL = 1.35;
const SCALED_ATK_MUL = 1.25;
const HEAL_MUL = 1.3;
const GUARD_CAP = 0.5;

function boostDamage(d: SkillDamageSpec): SkillDamageSpec {
  if (d.kind === 'flat') return { ...d, amount: Math.round(d.amount * FLAT_DMG_MUL) };
  if (d.kind === 'scaledAtk') {
    return { ...d, atkMul: Math.round(d.atkMul * SCALED_ATK_MUL * 100) / 100 };
  }
  return d;
}

function clampGuard(ratio: number): number {
  return Math.min(GUARD_CAP, Math.round(ratio * 100) / 100);
}

function boostSelf(e: SkillCastSelfEffect): SkillCastSelfEffect {
  switch (e.kind) {
    case 'taunt':
      return { ...e, rounds: e.rounds + 1 };
    case 'atkBonus':
      return { ...e, addAtk: e.addAtk + 2, rounds: e.rounds + 1 };
    case 'spdBonus':
      return { ...e, addSpd: e.addSpd + 2, rounds: e.rounds + 1 };
    case 'guard':
      return { ...e, reduceRatio: clampGuard(e.reduceRatio + 0.1), rounds: e.rounds + 1 };
  }
}

function boostFoe(e: SkillCastFoeEffect): SkillCastFoeEffect {
  switch (e.kind) {
    case 'atkDown':
      return { ...e, subAtk: e.subAtk + 2, rounds: e.rounds + 1 };
    case 'spdDown':
      return { ...e, subSpd: e.subSpd + 2, rounds: e.rounds + 1 };
    case 'poison':
      return { ...e, dmgPerRound: e.dmgPerRound + 1, rounds: e.rounds + 1 };
  }
}

function boostAlly(e: SkillCastAllyEffect): SkillCastAllyEffect {
  switch (e.kind) {
    case 'heal':
      return { ...e, amount: Math.round(e.amount * HEAL_MUL) };
    case 'atkBonus':
      return { ...e, addAtk: e.addAtk + 2, rounds: e.rounds + 1 };
    case 'spdBonus':
      return { ...e, addSpd: e.addSpd + 1, rounds: e.rounds + 1 };
    case 'guard':
      return { ...e, reduceRatio: clampGuard(e.reduceRatio + 0.1), rounds: e.rounds + 1 };
  }
}

/**
 * 精英局里的第二技能：同一招，数值抬一档，限时效果多持续 1 回合。
 *
 * 不另开 `temp_*_elite` 技能表——商店仍卖同一个 id，结算和说明共用这一层。
 * 多出来的是「更厚的控制 / 更久的盾 / 更高的治疗」，不是再加 20% 伤害。
 */
export function applyEliteTempSkillBoost(spec: SkillSpec): SkillSpec {
  return {
    ...spec,
    damage: boostDamage(spec.damage),
    onCastSelfEffects: spec.onCastSelfEffects?.map(boostSelf),
    onCastFoeEffects: spec.onCastFoeEffects?.map(boostFoe),
    onCastAllyEffects: spec.onCastAllyEffects?.map(boostAlly),
  };
}
