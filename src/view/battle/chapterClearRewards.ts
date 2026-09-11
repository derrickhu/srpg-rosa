import { getCharacterDef } from '@/data/characterCatalog';
import {
  describePersonalEmblem,
  getPersonalEmblem,
  personalEmblemSourceLabel,
} from '@/data/personalEmblemCatalog';
import type { ChapterClearPreview } from '@/game/state/ProgressManager';
import { C } from '@/view/mvpTheme';
import type { RewardEntry } from '@/view/battle/resultOverlay';

/**
 * 通关结算格只留当场能点开看的东西：魂晶、跟人永久纹章。
 * 三星跟在「通关」横幅后面演；入队和开下一章回大厅再亮相。
 */
export function chapterClearRewardEntries(
  preview: ChapterClearPreview,
  dungeonName: string,
): RewardEntry[] {
  const entries: RewardEntry[] = [];
  if (preview.soul > 0) {
    entries.push({
      iconKey: 'icon_soul',
      name: '魂晶',
      amount: preview.soul,
      quality: '永久',
      desc: preview.firstClear
        ? `通关「${dungeonName}」。每颗星的魂晶只领一次。`
        : `再通「${dungeonName}」。本关奖励每次通关都能领。`,
      sources: ['章节星级', '本关奖励'],
      tint: C.soul,
    });
  }
  for (const emblemId of preview.grantedEmblemIds) {
    const emblem = getPersonalEmblem(emblemId);
    if (!emblem) continue;
    const who = getCharacterDef(emblem.rosterId);
    const level = preview.grantedEmblemLevelById[emblemId] ?? 1;
    const upgraded = level >= 2;
    entries.push({
      iconKey: emblem.icon,
      name: upgraded ? `${emblem.name} · 2级` : emblem.name,
      amount: 1,
      quality: upgraded ? `2级 · ${who?.name ?? '专属'}` : (who?.name ?? '专属'),
      badge: '永久纹章',
      whoRosterId: emblem.rosterId,
      desc: upgraded
        ? `${emblem.blurb}升到 2 级：${describePersonalEmblem(emblem, level)}`
        : `${emblem.blurb}${describePersonalEmblem(emblem, level)}铭刻在${who?.name ?? '这个人'}身上。`,
      sources: [personalEmblemSourceLabel(emblem, level)],
      tint: C.primary,
    });
  }
  return entries;
}
