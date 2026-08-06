import * as PIXI from 'pixi.js';
import { UNIT_DEFS } from '@/data/unitDefs';
import { getSkillSpec } from '@/data/skillCatalog';
import {
  nodesUntilBoss,
  rosterEligibleForTempSkill,
  type BuyShopContext,
  type MvpGameState,
  type ShopOffer,
} from '@/game/MvpState';
import { createBackground, createUiIcon } from '@/view/renderHelpers';
import { AssetManager } from '@/core/AssetManager';

const CARD_RADIUS = 10;
const PAD = 16;

const COLORS = {
  cardBg: 0xfefef6,
  cardBorder: 0xd0c8a8,
  headerBg: 0x5a7a40,
  goldBadge: 0xe8a030,
  priceFg: 0x886622,
  btnBuy: 0x5a9e3a,
  btnBuyHover: 0x4a8e2a,
  btnSkip: 0x888888,
  title: 0xffffff,
  bodyText: 0x3a3a2a,
  mutedText: 0x888877,
  typeBadge: {
    tempSkill: 0xaa66cc,
    terrain: 0x66aa55,
    potion: 0xdd7744,
  } as Record<string, number>,
};

function typeLabel(type: string): string {
  switch (type) {
    case 'tempSkill': return '技能';
    case 'terrain': return '地形';
    case 'potion': return '药剂';
    default: return '?';
  }
}

function offerName(o: ShopOffer): string {
  switch (o.type) {
    case 'tempSkill': return o.name;
    case 'terrain': return o.name;
    case 'potion': return o.name;
    default: return '?';
  }
}

function offerDesc(o: ShopOffer): string {
  switch (o.type) {
    case 'tempSkill': return '本局多带一招，任何职业都能装';
    case 'terrain': return '本局可在部署时放置';
    case 'potion': return '战斗中使用（本局）';
    default: return '';
  }
}

function makePillBadge(text: string, color: number, w: number, h: number): PIXI.Container {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(color, 0.9);
  g.drawRoundedRect(0, 0, w, h, h / 2);
  g.endFill();
  c.addChild(g);
  const t = new PIXI.Text(text, { fill: 0xffffff, fontSize: 11, fontWeight: 'bold' });
  t.anchor.set(0.5);
  t.x = w / 2;
  t.y = h / 2;
  c.addChild(t);
  return c;
}

export function createShopView(
  state: MvpGameState,
  offers: ShopOffer[],
  callbacks: { onBuy: (offer: ShopOffer, ctx?: BuyShopContext) => void; onSkip: () => void },
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const root = new PIXI.Container();
  const W = screen.screenWidth;
  const H = screen.screenHeight;

  const bg = createBackground(W, H);
  root.addChild(bg);

  // --- 金币（左上角，带遮罩底板和图标，与部署/战斗页面一致） ---
  const goldIconSize = 22;
  const goldValueTx = new PIXI.Text(`${state.run!.gold}`, { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' });
  const goldPadX = 6;
  const goldPadY = 4;
  const goldBgW = goldIconSize + 4 + goldValueTx.width + goldPadX * 2;
  const goldBgH = Math.max(goldIconSize, goldValueTx.height) + goldPadY * 2;

  const goldContainer = new PIXI.Container();
  goldContainer.x = 8;
  goldContainer.y = 46;

  const goldBg = new PIXI.Graphics();
  goldBg.beginFill(0x000000, 0.4);
  goldBg.drawRoundedRect(0, 0, goldBgW, goldBgH, 8);
  goldBg.endFill();
  goldContainer.addChild(goldBg);

  const goldIcon = createUiIcon('icon_gold', goldIconSize);
  if (goldIcon) {
    goldIcon.x = goldPadX;
    goldIcon.y = (goldBgH - goldIconSize) / 2;
    goldContainer.addChild(goldIcon);
  }
  goldValueTx.x = goldPadX + goldIconSize + 4;
  goldValueTx.y = (goldBgH - goldValueTx.height) / 2;
  goldContainer.addChild(goldValueTx);
  root.addChild(goldContainer);

  // --- 商店标题（居中，金币下方） ---
  const titleText = new PIXI.Text('商  店', {
    fill: 0xffffff, fontSize: 16, fontWeight: 'bold',
  });
  titleText.anchor.set(0.5, 0.5);
  const titlePadX = 16;
  const titlePadY = 6;
  const titleLabelW = titleText.width + titlePadX * 2;
  const titleLabelH = titleText.height + titlePadY * 2;
  const titleBg = new PIXI.Graphics();
  titleBg.beginFill(0x000000, 0.4);
  titleBg.drawRoundedRect(0, 0, titleLabelW, titleLabelH, 8);
  titleBg.endFill();
  titleBg.x = Math.floor((W - titleLabelW) / 2);
  titleBg.y = goldContainer.y + goldBgH + 6;
  root.addChild(titleBg);
  titleText.x = titleBg.x + titleLabelW / 2;
  titleText.y = titleBg.y + titleLabelH / 2;
  root.addChild(titleText);

  let headerH = titleBg.y + titleLabelH;

  /**
   * Boss 备药提醒。
   *
   * 第一章 Boss 裸打胜率 2.4%（`chapter1Sim`），带 2 治疗药 61%——这不是「惩罚」，是一道墙。
   * 改成纯人工模式后一局要打几分钟，撞墙的代价从一分钟涨到几分钟，所以必须在**买得到药的时候**
   * 说这句话：补给点就在 Boss 前一个节点，此刻钱还在、货还在。
   * Boss 布阵页那句提醒只能拦住误触，拦不住"我不知道要买药"。
   */
  const untilBoss = nodesUntilBoss(state);
  const potionsOwned = Object.values(state.run!.potions).reduce((a, b) => a + b, 0);
  if (untilBoss !== null && untilBoss <= 1 && potionsOwned === 0) {
    const warnW = W - PAD * 2;
    const warnTx = new PIXI.Text('下一战是 Boss。没有药剂几乎打不过，建议至少备一瓶治疗药。', {
      fill: 0xffe0b0, fontSize: 12, fontWeight: 'bold',
      wordWrap: true, wordWrapWidth: warnW - 20,
    });
    const warnH = warnTx.height + 16;
    const warnBg = new PIXI.Graphics();
    warnBg.lineStyle(1, 0xdd7744, 0.9);
    warnBg.beginFill(0x6a2a10, 0.75);
    warnBg.drawRoundedRect(0, 0, warnW, warnH, 8);
    warnBg.endFill();

    const warn = new PIXI.Container();
    warn.x = PAD;
    warn.y = headerH + 10;
    warn.addChild(warnBg);
    warnTx.x = 10;
    warnTx.y = 8;
    warn.addChild(warnTx);
    root.addChild(warn);
    headerH = warn.y + warnH;
  }

  const overlay = new PIXI.Container();
  overlay.visible = false;
  overlay.eventMode = 'static';

  function closePicker(): void {
    overlay.visible = false;
    overlay.removeChildren();
  }

  function openTempSkillPicker(offer: Extract<ShopOffer, { type: 'tempSkill' }>): void {
    overlay.removeChildren();
    overlay.visible = true;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.55);
    dim.drawRect(0, 0, W, H);
    dim.endFill();
    dim.eventMode = 'static';
    dim.on('pointertap', (e) => { if (e.target === dim) closePicker(); });
    overlay.addChild(dim);

    const mercs = rosterEligibleForTempSkill(state, offer.skillId);
    const panelH = 80 + mercs.length * 50 + 50;
    const panelW = W - 40;
    const panel = new PIXI.Container();
    panel.x = 20;
    panel.y = Math.max(60, (H - panelH) / 2);

    const pbg = new PIXI.Graphics();
    pbg.beginFill(COLORS.cardBg, 0.98);
    pbg.drawRoundedRect(0, 0, panelW, panelH, 12);
    pbg.endFill();
    panel.addChild(pbg);

    const ptitle = new PIXI.Text(`将「${offer.name}」交给谁？`, {
      fill: COLORS.bodyText, fontSize: 15, fontWeight: 'bold',
    });
    ptitle.x = PAD;
    ptitle.y = PAD;
    panel.addChild(ptitle);

    const pprice = new PIXI.Text(`消耗 ${offer.price} 金币`, {
      fill: COLORS.priceFg, fontSize: 12,
    });
    pprice.x = PAD;
    pprice.y = 40;
    panel.addChild(pprice);

    let py = 66;
    for (const m of mercs) {
      const row = new PIXI.Container();
      row.x = PAD;
      row.y = py;
      const rowW = panelW - PAD * 2;
      const rowH = 40;

      const rg = new PIXI.Graphics();
      rg.beginFill(COLORS.btnBuy, 0.12);
      rg.drawRoundedRect(0, 0, rowW, rowH, 8);
      rg.endFill();
      row.addChild(rg);

      // 已经带着别的临时技能时要写清楚会顶掉哪一招——买完才发现旧的没了是最糟的
      const cur = state.run?.runTempSkill[m.rosterId];
      const curName = cur ? getSkillSpec(cur)?.name : undefined;
      const rlab = new PIXI.Text(
        curName ? `${m.name} · 顶替「${curName}」` : `${m.name} · ${UNIT_DEFS[m.profession].name}`,
        { fill: COLORS.bodyText, fontSize: 13 },
      );
      rlab.x = 12;
      rlab.y = (rowH - rlab.height) / 2 + 2;
      row.addChild(rlab);

      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.hitArea = new PIXI.Rectangle(0, 0, rowW, rowH);
      row.on('pointertap', () => {
        callbacks.onBuy(offer, { tempSkillTargetRosterId: m.rosterId });
        closePicker();
      });
      panel.addChild(row);
      py += 50;
    }

    const cancel = new PIXI.Text('取消', {
      fill: COLORS.mutedText, fontSize: 13,
    });
    cancel.x = PAD;
    cancel.y = py + 6;
    cancel.eventMode = 'static';
    cancel.cursor = 'pointer';
    cancel.on('pointertap', () => closePicker());
    panel.addChild(cancel);

    overlay.addChild(panel);
  }

  const cardW = W - PAD * 2;
  const cardH = 80;
  let y = headerH + 28;

  for (const o of offers) {
    const card = new PIXI.Container();
    card.x = PAD;
    card.y = y;

    const cbg = new PIXI.Graphics();
    cbg.lineStyle(1, COLORS.cardBorder, 0.6);
    cbg.beginFill(COLORS.cardBg, 0.95);
    cbg.drawRoundedRect(0, 0, cardW, cardH, CARD_RADIUS);
    cbg.endFill();
    card.addChild(cbg);

    const badgeColor = COLORS.typeBadge[o.type] ?? 0x888888;
    const badge = makePillBadge(typeLabel(o.type), badgeColor, 42, 20);
    badge.x = 12;
    badge.y = 12;
    card.addChild(badge);

    const name = new PIXI.Text(offerName(o), {
      fill: COLORS.bodyText, fontSize: 14, fontWeight: 'bold',
      wordWrap: true, wordWrapWidth: cardW - 110,
    });
    name.x = 62;
    name.y = 10;
    card.addChild(name);

    const desc = new PIXI.Text(offerDesc(o), {
      fill: COLORS.mutedText, fontSize: 11,
    });
    desc.x = 62;
    desc.y = 32;
    card.addChild(desc);

    const priceText = new PIXI.Text(`${o.price} 金`, {
      fill: COLORS.priceFg, fontSize: 13, fontWeight: 'bold',
    });
    priceText.x = 62;
    priceText.y = 52;
    card.addChild(priceText);

    const btnW = 64;
    const btnH = 32;
    const btnX = cardW - btnW - 12;
    const btnY = (cardH - btnH) / 2;
    const btnBg = new PIXI.Graphics();
    btnBg.beginFill(COLORS.btnBuy, 0.9);
    btnBg.drawRoundedRect(0, 0, btnW, btnH, btnH / 2);
    btnBg.endFill();
    btnBg.x = btnX;
    btnBg.y = btnY;
    card.addChild(btnBg);

    const btnText = new PIXI.Text('购买', {
      fill: 0xffffff, fontSize: 13, fontWeight: 'bold',
    });
    btnText.anchor.set(0.5);
    btnText.x = btnX + btnW / 2;
    btnText.y = btnY + btnH / 2;
    card.addChild(btnText);

    const hit = new PIXI.Container();
    hit.hitArea = new PIXI.Rectangle(btnX, btnY, btnW, btnH);
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.on('pointertap', () => {
      if (o.type === 'tempSkill') {
        openTempSkillPicker(o);
        return;
      }
      callbacks.onBuy(o);
    });
    card.addChild(hit);

    root.addChild(card);
    y += cardH + 10;
  }

  const skipW = W - PAD * 2;
  const skipH = 44;
  const skipY = y + 16;
  const skipBg = new PIXI.Graphics();
  skipBg.beginFill(COLORS.btnSkip, 0.15);
  skipBg.drawRoundedRect(0, 0, skipW, skipH, skipH / 2);
  skipBg.endFill();

  const skipText = new PIXI.Text('离开补给点，继续前进', {
    fill: COLORS.mutedText, fontSize: 14,
  });
  skipText.anchor.set(0.5);
  skipText.x = skipW / 2;
  skipText.y = skipH / 2;

  const skipBtn = new PIXI.Container();
  skipBtn.x = PAD;
  skipBtn.y = skipY;
  skipBtn.addChild(skipBg);
  skipBtn.addChild(skipText);
  skipBtn.eventMode = 'static';
  skipBtn.cursor = 'pointer';
  skipBtn.hitArea = new PIXI.Rectangle(0, 0, skipW, skipH);
  skipBtn.on('pointertap', () => callbacks.onSkip());
  root.addChild(skipBtn);

  root.addChild(overlay);

  return root;
}
