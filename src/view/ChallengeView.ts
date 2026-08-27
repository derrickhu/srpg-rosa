import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import {
  CHALLENGE_ENTRIES,
  challengeArt,
  challengeDungeon,
  challengeStatus,
  endlessBestFloor,
  type ChallengeEntry,
} from '@/data/challengeCatalog';
import type { DungeonDef } from '@/data/dungeonCatalog';
import { sweepLeftToday, sweepQuota, type MvpGameState } from '@/game/MvpState';
import { createHubHeader } from '@/view/hubHeader';
import { C } from '@/view/mvpTheme';
import { bgTexture, makeArtPlate, uiTexture } from '@/ui/chrome';
import { createBackground, createUiIcon } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';
import { createScrollList } from '@/ui/ScrollList';
import { showToast } from '@/ui/Toast';
import { staggerPop } from '@/view/fx/celebration';

export interface ChallengeCallbacks {
  /** 重打已通关章节（走冒险页同一入口） */
  onChallenge: (dungeon: DungeonDef) => void;
}

const PAD = 12;
const CARD_H = 132;
const ACTION_W = 88;
const HEAD_H = 34;
const CARD_STEP = CARD_H + 10;
const HEAD_STEP = HEAD_H + 8;
/** 列表最底下多留一截，最后一张卡不要贴着底栏 */
const LIST_TAIL = 120;

/**
 * 副本页内容堆叠高度（不含顶栏）。
 *
 * 抽出来给单测：典型手机视口必须溢出，否则玩家会看见底下被裁掉、却拖不动。
 */
export function challengeStackHeight(opts: {
  events: number;
  endless: number;
}): number {
  let y = 6;
  y += HEAD_STEP + opts.events * CARD_STEP;
  y += HEAD_STEP + opts.endless * CARD_STEP;
  return y + LIST_TAIL;
}

/**
 * 副本页：活动和无尽。章节重打只在冒险页（扫荡 / 再开一局），这里不再列一份。
 *
 * 对齐参考「历练大厅」：卡直接压在厅堂上，左侧铺满插图，右侧说明 + 挑战。
 */
export function createChallengeView(
  state: MvpGameState,
  cb: ChallengeCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H, 'challenge_bg'));

  const header = createHubHeader({
    screenWidth: W,
    title: '副本',
    page: 'challenge',
    soul: state.meta.metaCurrency,
  });
  root.addChild(header.root);

  // 魂晶和页名钉在顶上，只滚标题下面的活动 / 无尽。
  const scroll = createScrollList({
    y: header.height,
    width: W,
    height: Math.max(80, H - header.height),
    showBar: true,
  });
  root.addChild(scroll.root);

  const cardW = W - PAD * 2;
  const artW = Math.round(cardW * 0.42);
  let y = 6;
  const pops: PIXI.Container[] = [];

  function addHeading(title: string, note?: string): void {
    const band = new PIXI.Graphics();
    band.beginFill(C.panel, 0.88);
    band.lineStyle(1, C.ink, 0.35, 0);
    band.drawRoundedRect(0, 0, cardW, HEAD_H, 10);
    band.endFill();
    band.x = PAD;
    band.y = y;
    scroll.content.addChild(band);

    const t = makeText(title, 'title', {
      fill: C.paper,
      fontSize: 16,
      stroke: C.ink,
      strokeThickness: 3,
    });
    t.x = PAD + 12;
    t.y = y + Math.round((HEAD_H - t.height) / 2);
    scroll.content.addChild(t);
    if (note) {
      const n = makeText(note, 'caption', {
        fill: C.paper,
        stroke: C.ink,
        strokeThickness: 3,
      });
      n.anchor.set(1, 0.5);
      n.x = PAD + cardW - 12;
      n.y = y + HEAD_H / 2;
      scroll.content.addChild(n);
    }
    y += HEAD_H + 8;
  }

  function entryCard(entry: ChallengeEntry): PIXI.Container {
    const status = challengeStatus(entry, state.meta);
    const open = status.kind === 'open';
    const radius = 16;
    const card = new PIXI.Container();
    card.hitArea = new PIXI.Rectangle(0, 0, cardW, CARD_H);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.28);
    shadow.drawRoundedRect(3, 5, cardW, CARD_H, radius);
    shadow.endFill();
    card.addChild(shadow);

    const body = new PIXI.Graphics();
    body.beginFill(open ? 0xfff8ee : 0x3a4458, 1);
    body.drawRoundedRect(0, 0, cardW, CARD_H, radius);
    body.endFill();
    card.addChild(body);

    const artSpec = challengeArt(entry);
    const tex = artSpec
      ? artSpec.bundle === 'bg'
        ? bgTexture(artSpec.key)
        : uiTexture(artSpec.key)
      : null;
    const plate = makeArtPlate({
      width: artW,
      height: CARD_H,
      texture: tex,
      fill: 0x2a2438,
      radius,
      round: 'left',
      mode: 'cover',
    });
    plate.alpha = open ? 1 : 0.5;
    card.addChild(plate);

    if (!tex) {
      const icon = createUiIcon(entry.icon, 48);
      if (icon) {
        icon.x = (artW - 48) / 2;
        icon.y = (CARD_H - 48) / 2;
        card.addChild(icon);
      }
    }

    const name = makeText(entry.name, 'uiStrong', {
      fill: 0xffffff,
      fontSize: 16,
      stroke: 0x1a1410,
      strokeThickness: 4,
    });
    name.x = 10;
    name.y = CARD_H - name.height - 10;
    card.addChild(name);

    const win = makeText(entry.window, 'micro', {
      fill: 0xfff0c8,
      fontSize: 10,
      stroke: 0x1a1410,
      strokeThickness: 3,
    });
    win.x = 10;
    win.y = name.y - win.height - 1;
    card.addChild(win);

    const infoX = artW + 12;
    const infoW = cardW - infoX - ACTION_W;

    const desc = makeText(entry.desc, 'micro', {
      fill: open ? C.muted : 0xc8d0e0,
      fontSize: 10,
      lineHeight: 14,
      wordWrap: true,
      wordWrapWidth: infoW,
    });
    desc.x = infoX;
    desc.y = 12;
    card.addChild(desc);

    const reward = makeText(entry.reward, 'caption', {
      fill: open ? C.soul : C.soulText,
      fontSize: 11,
    });
    reward.x = infoX;
    reward.y = CARD_H - 26;
    card.addChild(reward);

    if (status.kind === 'open') {
      const d = challengeDungeon(entry);
      const btn = makeButton(
        '挑战',
        () => {
          if (scroll.wasDragging()) return;
          if (d) cb.onChallenge(d);
        },
        { variant: 'primary', width: ACTION_W - 10, height: 36, fontSize: 14, radius: 12 },
      );
      btn.x = cardW - ACTION_W + 2;
      btn.y = (CARD_H - 36) / 2 - 8;
      card.addChild(btn);

      if (d && entry.kind !== 'endless') {
        const left = sweepLeftToday(state.meta, d.id);
        const quota = sweepQuota(d.id);
        const sw = makeText(`剩余 ${left}/${quota}`, 'micro', { fill: C.muted, fontSize: 9 });
        sw.anchor.set(0.5, 0);
        sw.x = cardW - ACTION_W / 2;
        sw.y = CARD_H / 2 + 18;
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
            { screenWidth: W },
          );
        },
        { variant: 'secondary', width: ACTION_W - 10, height: 36, fontSize: 11, radius: 12 },
      );
      btn.x = cardW - ACTION_W + 2;
      btn.y = (CARD_H - 36) / 2;
      card.addChild(btn);
    }

    pops.push(card);
    return card;
  }

  function addBlock(title: string, note: string | undefined, rows: PIXI.Container[]): void {
    addHeading(title, note);
    for (const r of rows) {
      r.x = PAD;
      r.y = y;
      scroll.content.addChild(r);
      y += CARD_H + 10;
    }
  }

  const events = CHALLENGE_ENTRIES.filter((e) => e.kind === 'event');
  addBlock('限时活动', `${events.length} 个筹备中`, events.map(entryCard));

  const endless = CHALLENGE_ENTRIES.filter((e) => e.kind === 'endless');
  const best = endlessBestFloor(state.meta);
  addBlock(
    '无尽试炼',
    best > 0 ? `最高 ${best} 层` : '尚无记录',
    endless.map(entryCard),
  );

  scroll.refresh(y + LIST_TAIL);
  staggerPop(pops.slice(0, 6), 45);
  return root;
}
