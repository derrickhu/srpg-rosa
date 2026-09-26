import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { CHARACTER_DEFS, characterArtKey, type CharacterDef } from '@/data/characterCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { describeSkillRole } from '@/data/skillText';
import { UNIT_DEFS } from '@/data/unitDefs';
import { unlockCharacterWithMeta, type MvpGameState } from '@/game/MvpState';
import { createHubHeader } from '@/view/hubHeader';
import { C } from '@/view/mvpTheme';
import { isDisplayLive } from '@/view/pixiLive';
import { createBackground, createUnitToken } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';
import { createScrollList } from '@/ui/ScrollList';
import { showToast } from '@/ui/Toast';
import { AudioManager } from '@/core/AudioManager';
import { createCharacterRevealOverlay } from '@/view/characterReveal';
import { staggerPop } from '@/view/fx/celebration';

export interface RecruitCallbacks {
  onChanged: () => void;
}

const PAD = 14;
const GAP = 12;
const COLS = 2;
/** 立绘源图大约 128px 高。再拉大，三倍屏上就会糊。 */
const TOKEN = 78;
const CARD_H = 188;

/** 招募页货架：还没拥有、并且只能花魂晶买的人。关卡解锁的不在这页。 */
export function recruitShelfDefs(roster: { rosterId: string }[]): CharacterDef[] {
  const have = new Set(roster.map((m) => m.rosterId));
  return CHARACTER_DEFS.filter((d) => !have.has(d.id) && d.unlock.kind === 'meta');
}

function attachIdleBob(node: PIXI.Container, amp = 2): void {
  const base = node.y;
  let acc = 0;
  const step = (): void => {
    if (!isDisplayLive(node)) {
      PIXI.Ticker.shared.remove(step);
      return;
    }
    acc += PIXI.Ticker.shared.deltaMS;
    node.y = base + Math.sin(acc / 520) * amp;
  };
  PIXI.Ticker.shared.add(step);
}

export function createRecruitView(
  state: MvpGameState,
  cb: RecruitCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H, 'recruit_bg'));

  const header = createHubHeader({
    screenWidth: W,
    title: '招募',
    page: 'recruit',
    soul: state.meta.metaCurrency,
    emblemTokens: state.meta.universalEmblemTokens ?? 0,
  });
  root.addChild(header.root);

  const scroll = createScrollList({
    y: header.height,
    width: W,
    height: Math.max(80, H - header.height),
    showBar: true,
  });
  root.addChild(scroll.root);

  const buyable = recruitShelfDefs(state.meta.roster);
  const innerW = W - PAD * 2;
  const cardW = Math.floor((innerW - GAP * (COLS - 1)) / COLS);
  const pops: PIXI.Container[] = [];

  function tryRecruit(def: CharacterDef): void {
    if (def.unlock.kind !== 'meta') return;
    if (scroll.wasDragging()) return;
    const cost = def.unlock.cost;
    if (unlockCharacterWithMeta(state, def.id)) {
      AudioManager.playSfx('sfx_soul_spend');
      const reveal = createCharacterRevealOverlay({
        screenW: W,
        screenH: H,
        rosterId: def.id,
        onConfirm: () => {
          if (reveal.parent) reveal.parent.removeChild(reveal);
          reveal.destroy({ children: true });
          cb.onChanged();
        },
      });
      root.addChild(reveal);
    } else {
      showToast(root, `魂晶不足（还差 ${cost - state.meta.metaCurrency}）`, {
        screenWidth: W,
        color: C.soulText,
        deny: true,
      });
    }
  }

  function recruitCard(def: CharacterDef): PIXI.Container {
    const cost = def.unlock.kind === 'meta' ? def.unlock.cost : 0;
    const card = new PIXI.Container();
    const radius = 18;
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.22);
    shadow.drawRoundedRect(2, 5, cardW, CARD_H, radius);
    shadow.endFill();
    card.addChild(shadow);

    const plate = new PIXI.Graphics();
    plate.lineStyle(2.5, C.ink, 1, 0);
    plate.beginFill(0x31445f, 1);
    plate.drawRoundedRect(0, 0, cardW, CARD_H, radius);
    plate.endFill();
    plate.lineStyle(1.5, 0x8eabcf, 0.85, 0);
    plate.drawRoundedRect(4, 4, cardW - 8, CARD_H - 8, radius - 4);
    card.addChild(plate);

    const winX = 10;
    const winY = 10;
    const winW = cardW - 20;
    const winH = 96;
    const well = new PIXI.Graphics();
    well.lineStyle(2, C.ink, 0.85, 0);
    well.beginFill(0xf4efe4, 1);
    well.drawRoundedRect(winX, winY, winW, winH, 14);
    well.endFill();
    card.addChild(well);

    const ground = new PIXI.Graphics();
    ground.beginFill(0x1a1410, 0.12);
    ground.drawEllipse(cardW / 2, winY + winH - 16, 22, 6);
    ground.endFill();
    card.addChild(ground);

    const token = createUnitToken(
      characterArtKey({ rosterId: def.id, profession: def.profession }),
      'player',
      Math.min(TOKEN, winW - 8),
    );
    token.x = cardW / 2;
    token.y = winY + winH * 0.58;
    card.addChild(token);
    attachIdleBob(token, 1.5);

    const nameTx = makeText(def.name, 'uiStrong', {
      fill: 0xfff6e8,
      fontSize: 15,
    });
    nameTx.anchor.set(0.5, 0);
    nameTx.x = cardW / 2;
    nameTx.y = winY + winH + 6;
    card.addChild(nameTx);

    const spec = getSkillSpec(def.defaultSkillId);
    const job = UNIT_DEFS[def.profession].name;
    const line = spec ? `${job} · ${spec.name}` : `${job} · ${describeSkillRole(def.skillRoute)}`;
    const metaTx = makeText(line, 'caption', {
      fill: 0xd5deea,
      fontSize: 11,
    });
    metaTx.anchor.set(0.5, 0);
    metaTx.x = cardW / 2;
    metaTx.y = nameTx.y + nameTx.height + 1;
    card.addChild(metaTx);

    const btnW = cardW - 20;
    const btn = makeButton(`招募 ${cost}`, () => {
      tryRecruit(def);
    }, {
      variant: 'primary',
      width: btnW,
      height: 28,
      fontSize: 13,
      radius: 10,
      iconKey: 'icon_soul',
      iconSize: 14,
    });
    btn.x = 10;
    btn.y = CARD_H - 36;
    card.addChild(btn);

    pops.push(card);
    return card;
  }

  let bottom = 12;
  if (buyable.length > 0) {
    buyable.forEach((def, i) => {
      const card = recruitCard(def);
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      card.x = PAD + col * (cardW + GAP);
      card.y = 10 + row * (CARD_H + GAP);
      scroll.content.addChild(card);
    });
    const rows = Math.ceil(buyable.length / COLS);
    bottom = 10 + rows * (CARD_H + GAP);
  } else {
    const done = makeText('魂晶角色已全部招募', 'body', {
      fill: C.paper,
      stroke: C.ink,
      strokeThickness: 3,
    });
    done.anchor.set(0.5, 0);
    done.x = W / 2;
    done.y = 24;
    scroll.content.addChild(done);
    bottom = 72;
  }

  scroll.refresh(bottom + 16);
  staggerPop(pops.slice(0, 4), 40);
  return root;
}
