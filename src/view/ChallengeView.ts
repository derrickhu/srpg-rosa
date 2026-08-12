import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { DUNGEON_DEFS, type DungeonDef } from '@/data/dungeonCatalog';
import type { MvpGameState } from '@/game/MvpState';
import { createBackground, createUiIcon } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';

export interface ChallengeCallbacks {
  /** 重打已通关章节（走冒险页同一入口） */
  onChallenge: (dungeon: DungeonDef) => void;
}

const CARD_BG = 0xfefef6;
const TEXT = 0x3a3a2a;
const MUTED = 0x888877;

/** 副本挑战页：已通关章节重打 + 未来玩法占位（无尽试炼/困难模式） */
export function createChallengeView(
  state: MvpGameState,
  cb: ChallengeCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H));

  const titleTx = makeText('副本挑战', 'title', { fill: 0xffffff });
  titleTx.anchor.set(0.5, 0);
  titleTx.x = W / 2; titleTx.y = 12;
  root.addChild(titleTx);

  let y = 46;

  const secTitle = makeText('章节重挑战（可重复获得魂晶）', 'uiStrong', {
    fill: 0xfff3d8, fontSize: 13,
  });
  secTitle.x = 12; secTitle.y = y;
  root.addChild(secTitle);
  y += 24;

  const cleared = DUNGEON_DEFS.filter((d) => state.meta.clearedDungeonIds.includes(d.id));
  if (cleared.length === 0) {
    const empty = makeText('通关任意章节后可在此重复挑战', 'body', { fill: 0xd8d0c8 });
    empty.x = 12; empty.y = y;
    root.addChild(empty);
    y += 30;
  }
  for (const d of cleared) {
    const cardH = 56;
    const card = new PIXI.Container();
    card.x = 12; card.y = y;
    const g = new PIXI.Graphics();
    g.beginFill(CARD_BG, 0.95);
    g.drawRoundedRect(0, 0, W - 24, cardH, 10);
    g.endFill();
    card.addChild(g);
    const name = makeText(`${d.name} ✓`, 'uiStrong', { fill: TEXT });
    name.x = 14; name.y = 10;
    card.addChild(name);
    const desc = makeText(d.desc, 'caption', { fill: MUTED, fontSize: 10 });
    desc.x = 14; desc.y = 32;
    card.addChild(desc);
    const btn = makeButton('挑战', () => cb.onChallenge(d), {
      variant: 'primary', width: 72, height: 34, fontSize: 13, radius: 8,
    });
    btn.x = W - 24 - 84; btn.y = (cardH - 34) / 2;
    card.addChild(btn);
    root.addChild(card);
    y += cardH + 8;
  }

  y += 12;
  const futureTitle = makeText('更多玩法', 'uiStrong', { fill: 0xfff3d8, fontSize: 13 });
  futureTitle.x = 12; futureTitle.y = y;
  root.addChild(futureTitle);
  y += 24;

  const placeholders = [
    { icon: '♾', name: '无尽试炼', desc: '波次无尽，冲击最高纪录（开发中）' },
    { icon: '💀', name: '困难模式', desc: '全章节强化敌人，掉落翻倍（开发中）' },
  ];
  for (const p of placeholders) {
    const cardH = 56;
    const card = new PIXI.Container();
    card.x = 12; card.y = y;
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.35);
    g.drawRoundedRect(0, 0, W - 24, cardH, 10);
    g.endFill();
    card.addChild(g);
    const icon = makeText(p.icon, 'ui', { fontSize: 22 });
    icon.x = 14; icon.y = cardH / 2 - 13;
    card.addChild(icon);
    const name = makeText(p.name, 'uiStrong', { fill: 0xcccccc });
    name.x = 50; name.y = 10;
    card.addChild(name);
    const desc = makeText(p.desc, 'caption', { fill: 0x999999, fontSize: 10 });
    desc.x = 50; desc.y = 32;
    card.addChild(desc);
    const lock = createUiIcon('icon_lock', 20);
    if (lock) {
      lock.x = W - 60; lock.y = cardH / 2 - 10;
      card.addChild(lock);
    }
    root.addChild(card);
    y += cardH + 8;
  }

  return root;
}
