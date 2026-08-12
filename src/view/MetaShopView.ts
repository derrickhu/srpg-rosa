import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  unlockCharacterWithMeta,
  type MvpGameState,
} from '@/game/MvpState';
import { createBackground, createCurrencyPill, createUnitToken } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';

export interface MetaShopCallbacks {
  onChanged: () => void;
}

const CARD_BG = 0xfefef6;
const TEXT = 0x3a3a2a;
const MUTED = 0x888877;

/** 局外商店（Tab）：魂晶消费——角色解锁等 */
export function createMetaShopView(
  state: MvpGameState,
  cb: MetaShopCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H));

  const pill = createCurrencyPill('icon_soul', `${state.meta.metaCurrency}`);
  pill.x = 8;
  pill.y = 8;
  root.addChild(pill);

  const titleTx = makeText('商  店', 'title', { fill: 0xffffff });
  titleTx.anchor.set(0.5, 0);
  titleTx.x = W / 2; titleTx.y = 12;
  root.addChild(titleTx);

  let y = pill.y + pill.height + 14;

  const secTitle = makeText('角色招募（魂晶）', 'uiStrong', { fill: 0xfff3d8 });
  secTitle.x = 12; secTitle.y = y;
  root.addChild(secTitle);
  y += 24;

  const ownedIds = new Set(state.meta.roster.map((m) => m.rosterId));
  const metaChars = CHARACTER_DEFS.filter((c) => c.unlock.kind === 'meta');
  let listed = 0;
  for (const def of metaChars) {
    if (def.unlock.kind !== 'meta') continue;
    const owned = ownedIds.has(def.id);
    const cardH = 68;
    const card = new PIXI.Container();
    card.x = 12; card.y = y;
    const g = new PIXI.Graphics();
    g.beginFill(CARD_BG, owned ? 0.6 : 0.95);
    g.drawRoundedRect(0, 0, W - 24, cardH, 12);
    g.endFill();
    card.addChild(g);

    const token = createUnitToken(def.profession, 'player', 44);
    token.x = 34; token.y = cardH / 2;
    card.addChild(token);

    const name = makeText(`${def.name} · ${UNIT_DEFS[def.profession].name}`, 'uiStrong', {
      fill: TEXT,
    });
    name.x = 64; name.y = 12;
    card.addChild(name);
    const desc = makeText(
      `生命 ${def.base.maxHp}  攻击 ${def.base.atk}  速度 ${def.base.spd}  移动 ${def.base.move}`,
      'caption',
      { fill: MUTED },
    );
    desc.x = 64; desc.y = 36;
    card.addChild(desc);

    if (owned) {
      const done = makeText('已招募', 'uiStrong', { fill: 0x5a9e3a, fontSize: 13 });
      done.anchor.set(1, 0.5);
      done.x = W - 40; done.y = cardH / 2;
      card.addChild(done);
    } else {
      const cost = def.unlock.cost;
      const buy = makeButton(`魂晶 ${cost}`, () => {
        if (unlockCharacterWithMeta(state, def.id)) cb.onChanged();
      }, {
        width: 88, height: 36, fillColor: 0xcc8833, fillAlpha: 0.95,
        borderColor: 0xbb7722, textColor: 0xffffff, fontSize: 13, radius: 10,
      });
      buy.x = W - 24 - 100; buy.y = (cardH - 36) / 2;
      card.addChild(buy);
    }
    root.addChild(card);
    y += cardH + 10;
    listed += 1;
  }
  if (listed === 0) {
    const empty = makeText('暂无可招募角色', 'body', { fill: 0xd8d0c8 });
    empty.x = 12; empty.y = y;
    root.addChild(empty);
    y += 26;
  }

  y += 8;
  const noteTitle = makeText('魂晶获取', 'uiStrong', { fill: 0xfff3d8 });
  noteTitle.x = 12; noteTitle.y = y;
  root.addChild(noteTitle);
  y += 24;
  const note = makeText(
    '· 每场战斗胜利掉落少量魂晶\n· Boss 战与章节通关掉落大额魂晶\n· 魂晶用于：角色升级 / 学习技能 / 招募角色（角色页操作升级与学技能）',
    'body',
    { fill: 0xd8d0c8, lineHeight: 20, wordWrap: true, wordWrapWidth: W - 24 },
  );
  note.x = 12; note.y = y;
  root.addChild(note);

  return root;
}
