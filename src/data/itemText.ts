import type { TerrainId } from '@/battle/types';
import { getTerrainSpec } from '@/data/terrainSpec';
import { POTION_DEFS } from '@/data/potionCatalog';
import { getSkillSpec, type SkillSpec } from '@/data/skillCatalog';
import { describeReach, describeSkillSpec } from '@/data/skillText';

/**
 * 局内消耗品 / 临时技能的说明——商店、背包、战利品共用。
 * 返回**分行短句**；UI 负责数字高亮。单行场景用 `describeShopOffer`（`\\n` 拼接）。
 */

export type DescribableOffer =
  | { type: 'potion'; potionId: string }
  | { type: 'terrain'; terrainId: TerrainId }
  | { type: 'tempSkill'; skillId: string };

/** 范围：商店详情要一眼能扫，别写成整句散文 */
function briefShape(spec: SkillSpec): string {
  const shape = spec.shape;
  switch (shape.type) {
    case 'neighborAoE':
      return shape.manhattan === 1 ? '邻格全体敌人' : `周围 ${shape.manhattan} 格全体敌人`;
    case 'discAoE':
      return shape.radius === 1 ? '邻格全体敌人' : `周围 ${shape.radius} 格全体敌人`;
    case 'neighborPickFoe':
      return `${describeReach(shape.manhattan, shape.reach)}·点一个敌人`;
    case 'neighborPickAlly':
      return `${describeReach(shape.manhattan, shape.reach)}·点一个友军`;
    case 'lineBestRayAllFoes':
      return '直线穿透';
    case 'selfCast':
      return '对自己释放';
  }
}

/** 效果行压短：去掉「自身/敌方」重复主语，数字留给高亮 */
function briefEffectLines(spec: SkillSpec): string[] {
  return describeSkillSpec(spec).map((line) => {
    let s = line
      .replace(/^自身/, '')
      .replace(/^敌方/, '')
      .replace(/^友方/, '友军')
      .replace(/^被动技能$/, '被动')
      .replace(/，(\d+) 回合$/, '（$1 回合）')
      .replace(/: /g, ' ');
    // 「攻击 -5（3 回合）」这类保持；「伤害: …」已在上面处理
    return s.trim();
  }).filter(Boolean);
}

export function describePotionLines(potionId: string): string[] {
  const d = POTION_DEFS[potionId];
  if (!d) return [];
  return ['战斗中点击使用 · 本局消耗', d.desc];
}

export function describeTerrainTicketLines(terrainId: TerrainId): string[] {
  const t = getTerrainSpec(terrainId);
  const lines: string[] = [`布阵时放置一格${t.name}`];
  if (t.moveCost === Infinity) lines.push('不可通行');
  else if (t.moveCost !== 1) lines.push(`移动消耗 ${t.moveCost}`);
  if (t.atkMul !== 1) {
    const pct = Math.round((t.atkMul - 1) * 100);
    lines.push(pct > 0 ? `站上攻击 +${pct}%` : `站上攻击 ${pct}%`);
  }
  if (t.defMul !== 1) {
    const pct = Math.round((1 - t.defMul) * 100);
    lines.push(pct > 0 ? `站上承伤 -${pct}%` : `站上承伤 +${-pct}%`);
  }
  if (t.dotPerRound > 0) lines.push(`站上每回合 -${t.dotPerRound} HP`);
  return lines;
}

export function describeTempSkillLines(skillId: string): string[] {
  const spec = getSkillSpec(skillId);
  if (!spec) return [];
  const head = `本局·第二技能位 · 冷却 ${spec.cooldown}`;
  const mid = briefShape(spec);
  const effects = briefEffectLines(spec);
  // 用法一行 + 范围一行 + 效果（可多行）；效果少时并进范围行会显得挤，分开更清晰
  return [head, mid, ...effects];
}

export function describePotion(potionId: string): string {
  return describePotionLines(potionId).join('\n');
}

export function describeTerrainTicket(terrainId: TerrainId): string {
  return describeTerrainTicketLines(terrainId).join('\n');
}

export function describeTempSkill(skillId: string): string {
  return describeTempSkillLines(skillId).join('\n');
}

export function describeShopOfferLines(o: DescribableOffer): string[] {
  switch (o.type) {
    case 'potion':
      return describePotionLines(o.potionId);
    case 'terrain':
      return describeTerrainTicketLines(o.terrainId);
    case 'tempSkill':
      return describeTempSkillLines(o.skillId);
  }
}

export function describeShopOffer(o: DescribableOffer): string {
  return describeShopOfferLines(o).join('\n');
}
