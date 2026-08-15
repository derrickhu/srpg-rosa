import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import {
  CHALLENGE_ENTRIES,
  challengeDungeon,
  challengeStatus,
  chapterRepeatEntries,
  endlessBestFloor,
  type ChallengeEntry,
} from '@/data/challengeCatalog';
import type { DungeonDef } from '@/data/dungeonCatalog';
import { sweepLeftToday, sweepQuota, type MvpGameState } from '@/game/MvpState';
import { createHubHeader } from '@/view/hubHeader';
import { C } from '@/view/mvpTheme';
import { createBackground, createUiIcon } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';
import { makeCard } from '@/ui/Card';
import { createScrollList } from '@/ui/ScrollList';
import { makeSection } from '@/ui/Section';
import { showToast } from '@/ui/Toast';

export interface ChallengeCallbacks {
  /** 重打已通关章节（走冒险页同一入口） */
  onChallenge: (dungeon: DungeonDef) => void;
}

const PAD = 12;
const CARD_H = 76;
const ICON = 34;
const ACTION_W = 82;

/**
 * 副本页：可重复刷的内容。
 *
 * 三个分区分别对应「重打已通关章节 / 限时活动 / 无尽试炼」。
 * 活动还没开；无尽已经能从这里进，布阵一次后同图连打。
 */
export function createChallengeView(
  state: MvpGameState,
  cb: ChallengeCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H));

  const header = createHubHeader({
    screenWidth: W,
    title: '副本',
    soul: state.meta.metaCurrency,
  });
  root.addChild(header.root);

  const scroll = createScrollList({
    y: header.height,
    width: W,
    height: Math.max(80, H - header.height),
    showBar: true,
  });
  root.addChild(scroll.root);

  const sectionW = W - PAD * 2;
  const cardW = sectionW - PAD * 2;
  let y = 4;

  function entryCard(entry: ChallengeEntry): PIXI.Container {
    const status = challengeStatus(entry, state.meta);
    const open = status.kind === 'open';
    const card = makeCard({ width: cardW, height: CARD_H, tone: open ? 'normal' : 'locked' });
    const nameColor = open ? C.text : C.textOnDark;
    const subColor = open ? C.muted : 0xc8d0e0;

    const icon = createUiIcon(entry.icon, ICON);
    if (icon) {
      icon.x = 10;
      icon.y = (CARD_H - ICON) / 2;
      icon.alpha = open ? 1 : 0.6;
      card.addChild(icon);
    }
    const textX = 10 + ICON + 10;
    const textW = cardW - textX - ACTION_W;

    const name = makeText(entry.name, 'uiStrong', { fill: nameColor, fontSize: 14 });
    name.x = textX;
    name.y = 9;
    card.addChild(name);

    const win = makeText(entry.window, 'micro', { fill: subColor, fontSize: 9 });
    win.x = textX + name.width + 8;
    win.y = 13;
    card.addChild(win);

    const desc = makeText(entry.desc, 'micro', {
      fill: subColor,
      fontSize: 9,
      lineHeight: 12,
      wordWrap: true,
      wordWrapWidth: textW,
    });
    desc.x = textX;
    desc.y = 28;
    card.addChild(desc);

    // 奖励单独一行、用魂晶色：这是玩家扫这一页时唯一真正在找的东西
    const reward = makeText(entry.reward, 'micro', {
      fill: open ? 0x8a4ec8 : C.soulText,
      fontSize: 9,
    });
    reward.x = textX;
    reward.y = CARD_H - 18;
    card.addChild(reward);

    if (status.kind === 'open') {
      const d = challengeDungeon(entry);
      const btn = makeButton(
        '挑战',
        () => {
          // 滚动结束时手指常常正落在按钮上，Pixi 照样会派发 tap
          if (scroll.wasDragging()) return;
          if (d) cb.onChallenge(d);
        },
        { variant: 'primary', width: ACTION_W - 12, height: 32, fontSize: 13, radius: 8 },
      );
      btn.x = cardW - ACTION_W + 6;
      btn.y = (CARD_H - 32) / 2 - 6;
      card.addChild(btn);

      if (d && entry.kind !== 'endless') {
        const left = sweepLeftToday(state.meta, d.id);
        const quota = sweepQuota(d.id);
        const sw = makeText(`今日扫荡 ${left}/${quota}`, 'micro', { fill: C.muted, fontSize: 8 });
        sw.anchor.set(0.5, 0);
        sw.x = cardW - ACTION_W / 2;
        sw.y = CARD_H / 2 + 16;
        card.addChild(sw);
      }
    } else {
      const label = status.kind === 'soon' ? '即将开放' : status.reason;
      const btn = makeButton(
        label,
        () => {
          if (scroll.wasDragging()) return;
          showToast(
            root,
            status.kind === 'soon' ? '这个玩法还在做，先去推主线吧' : status.reason,
            { x: PAD, y: H - 40 },
          );
        },
        { variant: 'secondary', width: ACTION_W - 12, height: 32, fontSize: 11, radius: 8 },
      );
      btn.x = cardW - ACTION_W + 6;
      btn.y = (CARD_H - 32) / 2;
      card.addChild(btn);
    }

    return card;
  }

  function addSection(title: string, note: string | undefined, rows: PIXI.Container[]): void {
    const contentH = rows.length === 0 ? 0 : rows.reduce((h, r) => h + r.height + 8, 0) - 8;
    const sec = makeSection({ title, note, width: sectionW, contentHeight: contentH, x: PAD, y });
    let ry = 0;
    for (const r of rows) {
      r.y = ry;
      sec.body.addChild(r);
      ry += r.height + 8;
    }
    scroll.content.addChild(sec.root);
    y += sec.height + 10;
  }

  function tipRow(msg: string): PIXI.Container {
    const c = new PIXI.Container();
    c.addChild(
      makeText(msg, 'caption', {
        fill: C.muted,
        lineHeight: 17,
        wordWrap: true,
        wordWrapWidth: cardW,
      }),
    );
    return c;
  }

  const repeats = chapterRepeatEntries(state.meta);
  addSection(
    '章节重挑战',
    repeats.length > 0 ? `${repeats.length} 章可刷` : undefined,
    repeats.length > 0
      ? repeats.map(entryCard)
      : [tipRow('通关任意章节后，可以在这里重复挑战它，或者在布阵页直接扫荡。')],
  );

  // 分区注记只写玩家用得上的信息。这里曾经写「测试数据」——那是开发者视角的话，
  // 卡片上的「即将开放」已经说清了状态，再标一句只会让玩家怀疑自己看到的是半成品
  const events = CHALLENGE_ENTRIES.filter((e) => e.kind === 'event');
  addSection('限时活动', `${events.length} 个筹备中`, events.map(entryCard));

  const endless = CHALLENGE_ENTRIES.filter((e) => e.kind === 'endless');
  const best = endlessBestFloor(state.meta);
  addSection(
    '无尽试炼',
    best > 0 ? `最高 ${best} 层` : '尚无记录',
    endless.map(entryCard),
  );

  scroll.refresh();
  return root;
}
