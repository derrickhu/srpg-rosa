import * as PIXI from 'pixi.js';
import { C } from '@/view/mvpTheme';
import {
  createRewardOverlay,
  type RewardEntry,
} from '@/view/battle/resultOverlay';
import { hubSoulIconCenter } from '@/view/hubHeader';

export interface SweepRewardOverlayOpts {
  screenW: number;
  screenH: number;
  chapterName: string;
  soul: number;
  onConfirm: () => void;
}

export function sweepRewardCopy(chapterName: string, soul: number): {
  title: string;
  subtitle: string;
  amountLabel: string;
} {
  return {
    title: '扫  荡',
    subtitle: chapterName,
    amountLabel: `+${soul}`,
  };
}

export function sweepRewardEntry(soul: number): RewardEntry {
  return {
    iconKey: 'icon_soul',
    name: '魂晶',
    amount: soul,
    quality: '永久',
    desc: '带得出副本的永久货币，用来升级角色、学技能、招募同伴和解锁新章节。',
    sources: ['章节扫荡'],
    tint: C.soul,
  };
}

/**
 * 大厅扫荡结算。盖在冒险页上，不换页。
 *
 * 和战斗胜利是同一套奖励格：小方格弹出、点开看说明、收下飞进顶栏。
 * 不能再画一张孤立大白卡——那是另一套语言，玩家会对不上「我刚拿到了什么」。
 */
export function createSweepRewardOverlay(opts: SweepRewardOverlayOpts): PIXI.Container {
  const copy = sweepRewardCopy(opts.chapterName, opts.soul);
  return createRewardOverlay({
    screenW: opts.screenW,
    screenH: opts.screenH,
    title: copy.title,
    subtitle: copy.subtitle,
    entries: [sweepRewardEntry(opts.soul)],
    confirmLabel: '收  下',
    fanfare: false,
    soulFlyTo: hubSoulIconCenter(),
    soulFlyBurst: true,
    onConfirm: opts.onConfirm,
  });
}
