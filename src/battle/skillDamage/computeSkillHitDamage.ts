import type { SkillDamageSpec } from '@/data/skillCatalog';
import { computeDamage, counterMultiplier, terrainAttackMul } from '../damage';
import type { UnitDef } from '../types';
import type { SkillDamageContext } from './context';

function atkDefScaled(base: UnitDef, atk: number): UnitDef {
  return { ...base, atk };
}

function applyTempAtkMul(self: SkillDamageContext['self'], n: number): number {
  const m = self.tempAtkMul ?? 1;
  return Math.max(1, Math.floor(n * m));
}

/** `custom` 用：`registerSkillDamageCalculator(id, fn)` */
const customCalculators = new Map<
  string,
  (ctx: SkillDamageContext, params: Record<string, number> | undefined) => number
>();

/**
 * 注册自定义伤害公式（`damage: { kind: 'custom', id, params }`）。
 * `fn` 应返回 **尚未乘** `tempAtkMul` 的整数伤害（与内置 `scaledAtk` 一致，最后统一乘药剂倍率）。
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
  return applyTempAtkMul(ctx.self, computeDamage(sad, ctx.targetDef, ctx.terrain, ctx.self.pos));
}

function flatDamage(
  ctx: SkillDamageContext,
  amount: number,
  applyCounter: boolean,
  applyTerrain: boolean,
): number {
  let n = amount;
  if (applyCounter) n *= counterMultiplier(ctx.casterDef.id, ctx.targetDef.id);
  if (applyTerrain) n *= terrainAttackMul(ctx.terrain, ctx.self.pos);
  return applyTempAtkMul(ctx.self, Math.max(1, Math.floor(n)));
}

function percentTargetMaxHp(
  ctx: SkillDamageContext,
  ratio: number,
  applyCounter: boolean,
  applyTerrain: boolean,
): number {
  let n = ctx.targetDef.maxHp * ratio;
  if (applyCounter) n *= counterMultiplier(ctx.casterDef.id, ctx.targetDef.id);
  if (applyTerrain) n *= terrainAttackMul(ctx.terrain, ctx.self.pos);
  return applyTempAtkMul(ctx.self, Math.max(1, Math.floor(n)));
}

/**
 * 对单个目标结算技能伤害（不含治疗等；`none` 为 0）。
 * 内置种类在 `SkillDamageSpec`；扩展用 `custom` + `registerSkillDamageCalculator`。
 */
export function computeSkillHitDamage(ctx: SkillDamageContext): number {
  const d = ctx.spec.damage;
  return dispatchDamage(d, ctx);
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
      return applyTempAtkMul(ctx.self, fn(ctx, d.params));
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
