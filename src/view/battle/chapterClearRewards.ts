import { getCharacterDef } from '@/data/characterCatalog';
import { UNIVERSAL_EMBLEM_ICON, UNIVERSAL_EMBLEM_NAME } from '@/data/personalEmblemCatalog';
import {
  describePersonalEmblem,
  getPersonalEmblem,
  personalEmblemEffectLines,
  personalEmblemSourceLabel,
} from '@/data/personalEmblemCatalog';
import type { ChapterClearPreview } from '@/game/state/ProgressManager';
import { C } from '@/view/mvpTheme';
import type { RewardEntry } from '@/view/battle/resultOverlay';

/** 通关 / 首杀专页共用的一枚跟人纹章格 */
export function personalEmblemRewardEntry(emblemId: string, level: number): RewardEntry | null {
  const emblem = getPersonalEmblem(emblemId);
  if (!emblem) return null;
  const who = getCharacterDef(emblem.rosterId);
  const upgraded = level >= 2;
  return {
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
    effectLines: personalEmblemEffectLines(emblem, level),
    flavor: emblem.blurb,
  };
}

/**
 * 通关结算格只留魂晶。跟人纹章在首杀专页演过，这里不再复写一格。
 * 三星跟在「通关」横幅后面演；入队和开下一章回大厅再亮相。
 */
export function chapterClearRewardEntries(
  preview: ChapterClearPreview,
  dungeonName: string,
): RewardEntry[] {
  const entries: RewardEntry[] = [];
  if (preview.grantedUniversalEmblems > 0) {
    entries.push({
      iconKey: UNIVERSAL_EMBLEM_ICON,
      name: UNIVERSAL_EMBLEM_NAME,
      amount: preview.grantedUniversalEmblems,
      quality: '永久',
      desc: `通关「${dungeonName}」。用来激活或升级已拥有角色的永久纹章。`,
      sources: ['章节首通'],
      tint: C.primary,
    });
  }
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
  return entries;
}
