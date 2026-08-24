import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { UNIT_DEFS } from '@/data/unitDefs';
import { getSkillSpec } from '@/data/skillCatalog';
import { describeShopOfferLines } from '@/data/itemText';
import {
  nodesUntilBoss,
  rosterEligibleForTempSkill,
  type BuyShopContext,
  type MvpGameState,
  type ShopOffer,
} from '@/game/MvpState';
import {
  createBackground,
  createCurrencyPill,
  createUiIcon,
  RUN_GOLD_X,
  RUN_GOLD_Y_STANDALONE,
} from '@/view/renderHelpers';
import { AssetManager } from '@/core/AssetManager';
import { makeButton } from '@/ui/Button';
import { makeCard } from '@/ui/Card';
import { createModal, type ModalHandle } from '@/ui/Modal';
import { attachPress } from '@/ui/press';
import { makeSpeechBubble } from '@/ui/SpeechBubble';
import { makeStatDescBlock } from '@/ui/statDescText';
import { C } from '@/view/mvpTheme';

const PAD = 16;

/** 类型小标签色：只承载「这是哪类货」的信息，不用来做装饰 */
const TYPE_TAG: Record<ShopOffer['type'], { label: string; fill: number }> = {
  potion: { label: '药剂', fill: C.hp },
  terrain: { label: '地形', fill: 0x3c8424 },
  tempSkill: { label: '技能', fill: C.soul },
};

function makeTypeTag(type: ShopOffer['type']): PIXI.Container {
  const spec = TYPE_TAG[type];
  const c = new PIXI.Container();
  const t = makeText(spec.label, 'caption', { fill: C.textOnDark, fontSize: 11, fontWeight: 'bold' });
  const w = Math.ceil(t.width) + 10;
  const h = Math.max(18, Math.ceil(t.height) + 4);
  const g = new PIXI.Graphics();
  g.beginFill(spec.fill, 0.92);
  g.lineStyle(1.5, C.ink, 0.75);
  g.drawRoundedRect(0, 0, w, h, h / 2);
  g.endFill();
  c.addChild(g);
  t.anchor.set(0.5);
  t.x = w / 2;
  t.y = h / 2;
  c.addChild(t);
  return c;
}

function merchantLine(state: MvpGameState): string {
  const untilBoss = nodesUntilBoss(state);
  const potionsOwned = Object.values(state.run!.potions).reduce((a, b) => a + b, 0);
  if (untilBoss !== null && untilBoss <= 1 && potionsOwned === 0) {
    return '前面就是硬仗了……治疗药还是带一瓶吧。';
  }
  if (untilBoss !== null && untilBoss <= 1) {
    return 'Boss 近了。货就这些，看着眼缘拿。';
  }
  const lines = [
    '路过补给？摊上这几样，够用就行。',
    '金币还在就好说——下一站可不一定碰得到我。',
    '挑吧。买完就走，别耽误赶路。',
  ];
  const seed = (state.run?.gold ?? 0) + (state.run?.nodeIndex ?? 0);
  return lines[seed % lines.length]!;
}

/**
 * 场景大图按长边等比缩放。`createUiIcon` 会塞进正方形框并居中，
 * 摊位这种扁图上下会多出一截空，商人/摊的叠放会错位。
 */
function createSceneSprite(key: string, maxLongEdge: number): PIXI.Sprite | null {
  if (!AssetManager.isBundleLoaded('ui')) return null;
  const tex = AssetManager.texture('ui', key);
  if (!tex || tex === PIXI.Texture.WHITE) return null;
  const sp = new PIXI.Sprite(tex);
  const s = maxLongEdge / Math.max(tex.width, tex.height);
  sp.width = tex.width * s;
  sp.height = tex.height * s;
  return sp;
}

function offerName(o: ShopOffer): string {
  return o.name;
}

/** 商品图标键：和三选一 / 背包同一套，认图比认类型 pill 快 */
function offerIconKey(o: ShopOffer): string {
  switch (o.type) {
    case 'potion': return `icon_potion_${o.potionId}`;
    case 'terrain': return 'icon_terrain';
    case 'tempSkill': return `skill_${o.skillId}`;
    default: return 'icon_gold';
  }
}

/**
 * 局内补给点：神秘商人 + 木摊摆货（参考杀戮尖塔的场景感，不是 App 列表）。
 * 数据仍是 `rollShop` 抽的最多 3 件；买完由 GameFlow 重绘。
 */
export function createShopView(
  state: MvpGameState,
  offers: ShopOffer[],
  callbacks: { onBuy: (offer: ShopOffer, ctx?: BuyShopContext) => void; onSkip: () => void },
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const root = new PIXI.Container();
  const W = screen.screenWidth;
  const H = screen.screenHeight;

  // 平视草地空地：商人/摊是正视 chibi，俯视 battle_bg 机会打架
  root.addChild(createBackground(W, H, 'shop_bg'));

  // --- 顶栏：金币 + 轻标题 ---
  const goldPill = createCurrencyPill('icon_gold', `${state.run!.gold}`);
  goldPill.x = RUN_GOLD_X;
  goldPill.y = RUN_GOLD_Y_STANDALONE;
  root.addChild(goldPill);

  const titleText = makeText('补给点', 'title', { fill: C.textOnDark, fontSize: 16 });
  titleText.anchor.set(0.5, 0.5);
  const titlePadX = 14;
  const titlePadY = 5;
  const titleLabelW = titleText.width + titlePadX * 2;
  const titleLabelH = titleText.height + titlePadY * 2;
  const titleBg = new PIXI.Graphics();
  titleBg.beginFill(0x000000, 0.4);
  titleBg.drawRoundedRect(0, 0, titleLabelW, titleLabelH, 8);
  titleBg.endFill();
  titleBg.x = Math.floor((W - titleLabelW) / 2);
  titleBg.y = goldPill.y + 2;
  root.addChild(titleBg);
  titleText.x = titleBg.x + titleLabelW / 2;
  titleText.y = titleBg.y + titleLabelH / 2;
  root.addChild(titleText);

  let contentTop = Math.max(goldPill.y + goldPill.height, titleBg.y + titleLabelH) + 10;

  /**
   * Boss 备药提醒。
   *
   * 第一章 Boss 裸打胜率极低、带治疗药才过关——必须在**买得到药的时候**说清楚。
   */
  const untilBoss = nodesUntilBoss(state);
  const potionsOwned = Object.values(state.run!.potions).reduce((a, b) => a + b, 0);
  if (untilBoss !== null && untilBoss <= 1 && potionsOwned === 0) {
    const warnW = W - PAD * 2;
    const warnTx = makeText('下一战是 Boss。没有药剂几乎打不过，建议至少备一瓶治疗药。', 'body', {
      fill: C.warnText,
      fontWeight: 'bold',
      wordWrap: true,
      wordWrapWidth: warnW - 20,
    });
    const warnH = warnTx.height + 14;
    const warnBg = new PIXI.Graphics();
    warnBg.lineStyle(1.5, C.danger, 0.85);
    warnBg.beginFill(C.ink, 0.72);
    warnBg.drawRoundedRect(0, 0, warnW, warnH, 8);
    warnBg.endFill();
    const warn = new PIXI.Container();
    warn.x = PAD;
    warn.y = contentTop;
    warn.addChild(warnBg);
    warnTx.x = 10;
    warnTx.y = 7;
    warn.addChild(warnTx);
    root.addChild(warn);
    contentTop = warn.y + warnH + 8;
  }

  /**
   * 主块 = 场景 + 详情 + 离开。
   *
   * 商人/摊的竖直位置必须和当前选中货的说明行数脱钩：详情板按固定槽位预留，
   * 2 行药切到 3 行技能时只在槽里长，整块不再重新居中——否则摊会跟着跳。
   * 槽按「标题 + 最多约 5 行说明」估；真溢出才把离开按钮往下挤，场景仍不动。
   */
  const leaveH = 44;
  const DETAIL_SLOT_H = 132;
  /** 当前详情内容高度（可能大于槽）；画板和离开按钮用 max(槽, 这个值) */
  let detailH = DETAIL_SLOT_H;
  const gapSceneDetail = 12;
  const gapDetailLeave = 10;
  const bottomSafe = 18;

  const main = new PIXI.Container();
  root.addChild(main);

  const scene = new PIXI.Container();
  main.addChild(scene);

  const stallIcon = createSceneSprite('shop_stall', Math.min(W - 24, 360));
  const merchantIcon = createSceneSprite('shop_merchant', 148);

  const stallW = stallIcon?.width ?? Math.min(W - 24, 360);
  const stallH = stallIcon?.height ?? 120;
  const stallX = (W - stallW) / 2;
  const merchantH = merchantIcon?.height ?? 140;
  // 给气泡留一点顶空，摊紧贴商人脚下
  const stackTop = 6;
  const stallY = stackTop + merchantH * 0.72;

  if (merchantIcon) {
    merchantIcon.x = stallX + stallW * 0.28 - merchantIcon.width / 2;
    merchantIcon.y = stallY - merchantIcon.height * 0.72;
    scene.addChild(merchantIcon);

    const bubbleMax = Math.max(120, Math.min(176, W - (merchantIcon.x + merchantIcon.width) - 16));
    const bubble = makeSpeechBubble(merchantLine(state), {
      maxWidth: bubbleMax,
      tail: 'left',
      fontSize: 12,
    });
    bubble.x = merchantIcon.x + merchantIcon.width * 0.88;
    bubble.y = merchantIcon.y + merchantIcon.height * 0.06;
    const br = bubble.getLocalBounds();
    if (bubble.x + br.x + br.width > W - 8) {
      bubble.x = W - 8 - (br.x + br.width);
    }
    scene.addChild(bubble);
  }
  if (stallIcon) {
    stallIcon.x = stallX;
    stallIcon.y = stallY;
    scene.addChild(stallIcon);
  } else {
    const fallback = new PIXI.Graphics();
    fallback.beginFill(0xa87840, 0.95);
    fallback.lineStyle(3, C.ink, 1);
    fallback.drawRoundedRect(stallX, stallY + stallH * 0.35, stallW, stallH * 0.55, 8);
    fallback.endFill();
    scene.addChild(fallback);
  }

  // 货价挂牌伸出摊沿，场景高度算到挂牌底
  const iconSize = 44;
  const padSize = 52;
  const priceTagH = 22;
  const sceneH = stallY + stallH * 0.22 + padSize / 2 + priceTagH + 10;

  // --- 货位：摊面上最多 3 件 ---
  const slotsLayer = new PIXI.Container();
  scene.addChild(slotsLayer);

  let selected = offers.length > 0 ? 0 : -1;
  const slotNodes: PIXI.Container[] = [];
  const slotCount = offers.length;
  const slotPitch = stallW / Math.max(slotCount, 1);

  function rebuildSlots(): void {
    slotsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    slotNodes.length = 0;
    for (let i = 0; i < slotCount; i++) {
      const o = offers[i]!;
      const slot = new PIXI.Container();
      const cx = stallX + slotPitch * (i + 0.5);
      // 货放在台布上沿附近
      const cy = stallY + stallH * 0.22;

      const pad = new PIXI.Graphics();
      const selectedNow = i === selected;
      pad.beginFill(0x3a2a18, selectedNow ? 0.55 : 0.35);
      pad.drawCircle(0, 0, padSize / 2);
      pad.endFill();
      if (selectedNow) {
        pad.lineStyle(3, C.primary, 1);
        pad.drawCircle(0, 0, padSize / 2 + 1);
      } else {
        pad.lineStyle(2, C.ink, 0.7);
        pad.drawCircle(0, 0, padSize / 2);
      }
      slot.addChild(pad);

      const icon = createUiIcon(offerIconKey(o), iconSize);
      if (icon) {
        icon.x = -iconSize / 2;
        icon.y = -iconSize / 2 - 2;
        slot.addChild(icon);
      }

      // 挂牌价钱：小木牌 + 金币图标 + 数字
      const priceTag = new PIXI.Container();
      const priceLabel = makeText(`${o.price}`, 'uiStrong', { fill: C.ink, fontSize: 14 });
      const gIcon = createUiIcon('icon_gold', 16);
      const tagPadX = 6;
      const tagInnerW = (gIcon ? 18 : 0) + priceLabel.width + 2;
      const tagW = tagInnerW + tagPadX * 2;
      const tagH = 22;
      const tagBg = new PIXI.Graphics();
      tagBg.beginFill(0xf5e6c8, 0.95);
      tagBg.lineStyle(2, C.ink, 0.9);
      tagBg.drawRoundedRect(-tagW / 2, 0, tagW, tagH, 5);
      tagBg.endFill();
      // 小三角挂绳感（Pixi 7 Graphics 无 closePath，画回起点闭合）
      tagBg.beginFill(0xf5e6c8, 0.95);
      tagBg.moveTo(-5, 0);
      tagBg.lineTo(0, -6);
      tagBg.lineTo(5, 0);
      tagBg.lineTo(-5, 0);
      tagBg.endFill();
      priceTag.addChild(tagBg);
      let tx = -tagInnerW / 2;
      if (gIcon) {
        gIcon.x = tx;
        gIcon.y = (tagH - 16) / 2;
        priceTag.addChild(gIcon);
        tx += 18;
      }
      priceLabel.x = tx;
      priceLabel.y = (tagH - priceLabel.height) / 2;
      priceTag.addChild(priceLabel);
      priceTag.y = padSize / 2 + 4;
      slot.addChild(priceTag);

      slot.x = cx;
      slot.y = cy;
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.hitArea = new PIXI.Rectangle(-padSize / 2 - 4, -padSize / 2 - 4, padSize + 8, padSize + tagH + 14);
      attachPress(slot);
      const idx = i;
      slot.on('pointertap', () => {
        selected = idx;
        rebuildSlots();
        refreshDetail();
      });

      slotsLayer.addChild(slot);
      slotNodes.push(slot);
    }
  }

  // --- 选中详情（紧贴场景下方） ---
  const detail = new PIXI.Container();
  detail.x = PAD;
  detail.y = sceneH + gapSceneDetail;
  main.addChild(detail);

  function layoutMainBlock(): void {
    detail.y = sceneH + gapSceneDetail;
    leaveBtn.y = detail.y + Math.max(DETAIL_SLOT_H, detailH) + gapDetailLeave;
    const reservedMainH = sceneH + gapSceneDetail + DETAIL_SLOT_H + gapDetailLeave + leaveH;
    const availH = H - bottomSafe - contentTop;
    // 偏下：让摊脚落在 shop_bg 的泥地空地上，而不是悬在半空草地
    main.y = contentTop + Math.max(0, (availH - reservedMainH) * 0.72);
  }

  function refreshDetail(): void {
    detail.removeChildren().forEach((c) => c.destroy({ children: true }));
    const panelW = W - PAD * 2;

    if (selected < 0 || !offers[selected]) {
      detailH = DETAIL_SLOT_H;
      const panelBg = new PIXI.Graphics();
      panelBg.beginFill(C.paper, 0.92);
      panelBg.lineStyle(2, C.ink, 0.55);
      panelBg.drawRoundedRect(0, 0, panelW, DETAIL_SLOT_H, 12);
      panelBg.endFill();
      detail.addChild(panelBg);
      const empty = makeText(offers.length === 0 ? '货已售罄，可以继续前进了' : '点摊上的货物看看', 'body', {
        fill: C.muted,
      });
      empty.anchor.set(0.5);
      empty.x = panelW / 2;
      empty.y = DETAIL_SLOT_H / 2;
      detail.addChild(empty);
      layoutMainBlock();
      return;
    }

    const o = offers[selected]!;
    const name = makeText(offerName(o), 'uiStrong', { fill: C.text, fontSize: 16 });
    name.x = 14;
    name.y = 12;
    detail.addChild(name);

    const typeTag = makeTypeTag(o.type);
    typeTag.x = name.x + name.width + 8;
    typeTag.y = name.y + (name.height - typeTag.height) / 2;
    detail.addChild(typeTag);

    // 分行短句 + 数字高亮；文案与背包同源（itemText）
    const desc = makeStatDescBlock(describeShopOfferLines(o), {
      maxWidth: panelW - 110,
      fontSize: 12,
      lineGap: 3,
    });
    desc.x = 14;
    desc.y = 36;
    detail.addChild(desc);

    detailH = Math.max(DETAIL_SLOT_H, Math.ceil(desc.y + desc.height + 14));
    const panelBg = new PIXI.Graphics();
    panelBg.beginFill(C.paper, 0.92);
    panelBg.lineStyle(2, C.ink, 0.55);
    panelBg.drawRoundedRect(0, 0, panelW, detailH, 12);
    panelBg.endFill();
    detail.addChildAt(panelBg, 0);

    const afford = (state.run?.gold ?? 0) >= o.price;
    const buyBtn = makeButton(afford ? '购买' : '金币不足', () => {
      if (o.type === 'tempSkill') {
        openTempSkillPicker(o);
        return;
      }
      callbacks.onBuy(o);
    }, {
      variant: afford ? 'primary' : 'secondary',
      disabled: !afford,
      width: 88,
      height: 36,
      fontSize: 14,
    });
    buyBtn.x = panelW - 88 - 12;
    buyBtn.y = Math.max(12, (detailH - 36) / 2);
    detail.addChild(buyBtn);
    layoutMainBlock();
  }

  let picker: ModalHandle | null = null;

  function closePicker(): void {
    picker?.close();
    picker = null;
  }

  function openTempSkillPicker(offer: Extract<ShopOffer, { type: 'tempSkill' }>): void {
    closePicker();
    const mercs = rosterEligibleForTempSkill(state, offer.skillId);
    const rowH = 44;
    const ph = Math.min(H - 80, 100 + mercs.length * 52);
    picker = createModal({
      screenWidth: W,
      screenHeight: H,
      panelWidth: W - 40,
      panelHeight: Math.max(180, ph),
      light: true,
      title: `将「${offer.name}」交给谁？`,
      showClose: true,
      scrollable: true,
      onClose: () => { picker = null; },
    });
    const note = makeText(`消耗 ${offer.price} 金币`, 'body', { fill: C.gold });
    picker.body.addChild(note);
    let py = note.height + 10;
    for (const m of mercs) {
      const row = makeCard({
        width: picker.bodySize.width,
        height: rowH,
        onTap: () => {
          callbacks.onBuy(offer, { tempSkillTargetRosterId: m.rosterId });
          closePicker();
        },
      });
      row.y = py;
      const cur = state.run?.runTempSkill[m.rosterId];
      const curName = cur ? getSkillSpec(cur)?.name : undefined;
      const rlab = makeText(
        curName ? `${m.name} · 顶替「${curName}」` : `${m.name} · ${UNIT_DEFS[m.profession].name}`,
        'ui',
        { fill: C.text, fontSize: 13 },
      );
      rlab.x = 12;
      rlab.y = (rowH - rlab.height) / 2;
      row.addChild(rlab);
      picker.body.addChild(row);
      py += rowH + 8;
    }
    picker.refresh();
    root.addChild(picker.root);
  }

  // --- 离开（紧贴详情下方） ---
  const leaveBtn = makeButton('离开补给点，继续前进', () => callbacks.onSkip(), {
    variant: 'secondary',
    width: W - PAD * 2,
    height: leaveH,
    fontSize: 15,
  });
  leaveBtn.x = PAD;
  main.addChild(leaveBtn);

  rebuildSlots();
  refreshDetail();

  return root;
}
