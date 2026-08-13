import type { SkillDamageSpec, SkillSpec } from '@/data/skillCatalog';
import { computeDamage, counterMultiplier, terrainAttackMul, terrainDefenseMul } from '../damage';
import type { UnitDef } from '../types';
import type { SkillDamageContext } from './context';

function atkDefScaled(base: UnitDef, atk: number): UnitDef {
  return { ...base, atk };
}

function clampDamage(n: number): number {
  return Math.max(1, Math.floor(n));
}

/** `custom` 用：`registerSkillDamageCalculator(id, fn)` */
const customCalculators = new Map<
  string,
  (ctx: SkillDamageContext, params: Record<string, number> | undefined) => number
>();

/**
 * 注册自定义伤害公式（`damage: { kind: 'custom', id, params }`）。
 * `fn` 返回整数伤害，最终统一钳到 ≥1。
 */
export function registerSkillDamageCalculator(
  id: string,
  fn: (ctx: SkillDamageContext, params: Record<string, number> | undefined) => number,
): void {
  customCalculators.set(id, fn);
}

export function unregisterSkillDamageCalculator(id: string): void {
  customCalculators.delete(id);
}

function scaledStandard(ctx: SkillDamageContext, atkMul: number): number {
  if (atkMul <= 0) return 0;
  const atk = Math.max(1, Math.floor(ctx.casterDef.atk * atkMul));
  const sad = atkDefScaled(ctx.casterDef, atk);
  return clampDamage(computeDamage(sad, ctx.targetDef, ctx.terrain, ctx.self.pos, ctx.target.pos));
}

/**
 * `applyTerrain` 同时管**两头**的地形：施法者站的格（攻击加成）和目标站的格（减伤）。
 * 只吃一头会让「站进森林」对普攻有效、对技能无效，玩家学不会这条规则。
 */
function terrainMul(ctx: SkillDamageContext): number {
  return terrainAttackMul(ctx.terrain, ctx.self.pos) * terrainDefenseMul(ctx.terrain, ctx.target.pos);
}

function flatDamage(
  ctx: SkillDamageContext,
  amount: number,
  applyCounter: boolean,
  applyTerrain: boolean,
): number {
  let n = amount;
  if (applyCounter) n *= counterMultiplier(ctx.casterDef.id, ctx.targetDef.id);
  if (applyTerrain) n *= terrainMul(ctx);
  return clampDamage(n);
}

function percentTargetMaxHp(
  ctx: SkillDamageContext,
  ratio: number,
  applyCounter: boolean,
  applyTerrain: boolean,
): number {
  let n = ctx.targetDef.maxHp * ratio;
  if (applyCounter) n *= counterMultiplier(ctx.casterDef.id, ctx.targetDef.id);
  if (applyTerrain) n *= terrainMul(ctx);
  return clampDamage(n);
}

/**
 * 「处决」类词条的倍率：目标残血时才生效。
 *
 * 读 `target.hp` 而不是词条侧预判，因为同一次 AoE 里前面的目标已经掉过血了——
 * 谁进了处决线只有结算这一刻知道。
 */
function executeMul(ctx: SkillDamageContext): number {
  const ex = ctx.spec.executeBonus;
  if (!ex) return 1;
  return isExecuting(ctx.spec, ctx.target.hp, ctx.targetDef.maxHp) ? ex.mul : 1;
}

/**
 * 这一击有没有踩到处决线。结算和飘字问的是同一个函数，两边算法分家的话
 * 会出现「飘了处决但伤害没涨」这种查不出来的对不上。
 *
 * 必须在扣血**之前**问：处决读的是命中那一刻的血量。
 */
export function isExecuting(spec: SkillSpec, targetHp: number, targetMaxHp: number): boolean {
  const ex = spec.executeBonus;
  if (!ex || targetMaxHp <= 0) return false;
  return targetHp / targetMaxHp < ex.belowHpRatio;
}

/**
 * 对单个目标结算技能伤害（不含治疗等；`none` 为 0）。
 * 内置种类在 `SkillDamageSpec`；扩展用 `custom` + `registerSkillDamageCalculator`。
 */
export function computeSkillHitDamage(ctx: SkillDamageContext): number {
  const base = dispatchDamage(ctx.spec.damage, ctx);
  if (base <= 0) return base;
  const mul = executeMul(ctx);
  return mul === 1 ? base : clampDamage(base * mul);
}

function dispatchDamage(d: SkillDamageSpec, ctx: SkillDamageContext): number {
  switch (d.kind) {
    case 'none':
      return 0;
    case 'scaledAtk':
      return scaledStandard(ctx, d.atkMul);
    case 'flat':
      return flatDamage(ctx, d.amount, d.applyCounter !== false, d.applyTerrain !== false);
    case 'percentTargetMaxHp':
      return percentTargetMaxHp(ctx, d.ratio, d.applyCounter !== false, d.applyTerrain !== false);
    case 'custom': {
      const fn = customCalculators.get(d.id);
      if (!fn) {
        throw new Error(`[skillDamage] unknown custom calculator id: "${d.id}" (skill ${ctx.spec.id})`);
      }
      return clampDamage(fn(ctx, d.params));
    }
  }
}

/** 供测试或工具：对上下文用另一套 `damage` 试算 */
export function computeSkillHitDamageWithSpec(
  ctx: SkillDamageContext,
  damage: SkillDamageSpec,
): number {
  return dispatchDamage(damage, ctx);
}
