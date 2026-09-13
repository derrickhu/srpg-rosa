import {
  previewPersonalEmblemsForDungeon,
  type PersonalEmblemSave,
} from '@/data/personalEmblemCatalog';

/** 战场上掉出来的那枚：只带展示和拾取动画需要的字段 */
export interface BossFirstKillDrop {
  emblemId: string;
  iconKey: string;
  name: string;
  level: number;
  rosterId: string;
}

/**
 * 这一战的 Boss 死后要不要掉永久纹章。
 *
 * 只看「这是 Boss 节点」+「通关会新铭刻 / 升到 2 级」。
 * 已经领过的再打，预览是空的，棋盘上不掉、结算也不出专页。
 */
export function previewBossFirstKillDrops(
  meta: PersonalEmblemSave,
  dungeonId: string,
  nodeKind: string,
): BossFirstKillDrop[] {
  if (nodeKind !== 'boss') return [];
  return previewPersonalEmblemsForDungeon(meta, dungeonId).map((g) => ({
    emblemId: g.def.id,
    iconKey: g.def.icon,
    name: g.def.name,
    level: g.level,
    rosterId: g.def.rosterId,
  }));
}

/** 通关胜利页之前要不要先出 Boss 首杀专页 */
export function shouldPresentBossFirstKill(
  isRunFinal: boolean,
  grantCount: number,
): boolean {
  return isRunFinal && grantCount > 0;
}

export function bossFirstKillDropLabel(drop: Pick<BossFirstKillDrop, 'name' | 'level'>): string {
  return drop.level >= 2 ? `${drop.name} · 2级` : drop.name;
}
