import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  CHARACTER_DEFS,
  characterStatsAtLevel,
  characterArtKey,
  getCharacterDef,
  levelUpCost,
  type CharacterDef,
} from '@/data/characterCatalog';
import { getSkillSpec, type SkillSpec } from '@/data/skillCatalog';
import {
  exclusiveChainForSkill,
  exclusiveModsUnlockedBetween,
  type SkillModDef,
  type SkillModRarity,
} from '@/data/skillModCatalog';
import { describeSkillRole } from '@/data/skillText';
import { characterEffectiveStats } from '@/game/characterFactory';
import {
  addCharacterStats,
  personalEmblemModsFor,
  personalEmblemRosterCards,
  type PersonalEmblemCardCopy,
} from '@/data/personalEmblemCatalog';
import type { Character, CharacterBaseStats } from '@/game/characterTypes';
import { resolveBattleSkillIdForCharacter } from '@/game/state/DeployManager';
import {
  MAX_CHARACTER_LEVEL,
  canAffordCharacterLevelUp,
  levelUpCharacter,
  type MvpGameState,
} from '@/game/MvpState';
import { isDisplayLive } from '@/view/pixiLive';
import { getDungeonDef } from '@/data/dungeonCatalog';
import {
  createHubHeader,
  hubSoulBarBottom,
  hubSoulPillOrigin,
} from '@/view/hubHeader';
import { C, PROFESSION_ACCENT, shade } from '@/view/mvpTheme';
import {
  createBackground,
  createCurrencyPill,
  createUiIcon,
  createUnitToken,
  type CurrencyPill,
} from '@/view/renderHelpers';
import { characterInfoModel } from '@/view/unitInfoModel';
import { createUnitInfoPanel } from '@/view/unitInfoPanel';
import { makeButton, makeChevronButton, ROSTER_NAV_BTN, ROSTER_NAV_GAP } from '@/ui/Button';
import { makeRosterCardFace } from '@/ui/chrome';
import { createModal, modalPanelRestY, type ModalHandle } from '@/ui/Modal';
import { attachPress } from '@/ui/press';
import { createScrollList, type ScrollListHandle } from '@/ui/ScrollList';
import { showToast } from '@/ui/Toast';
import { AudioManager } from '@/core/AudioManager';
import { animateCurrencySpend, flashPop, staggerPop } from '@/view/fx/celebration';
import type { EmblemAwakenInfo } from '@/view/emblemAwaken';
import {
  HUB_GUIDE_RAYEN_ID,
  HubUpgradeGuideStep,
  notifyHubUpgradeGuide,
  readHubUpgradeGuideStep,
  setHubUpgradeGuideStep,
} from '@/game/hubGuide/hubUpgradeGuide';
import { spotlightRectOf, type SpotlightRect } from '@/view/tutorial/TutorialOverlay';

export interface RosterCallbacks {
  /** meta 状态变更后持久化并重绘整页 */
  onChanged: () => void;
  /**
   * 只存盘，不重绘。
   *
   * 详情弹窗里的升级/学技能要用它：走 `onChanged` 会把整页连弹窗一起重建，
   * 而玩家的真实操作是「连升三级再关掉」，每点一次就被弹回网格根本没法用。
   */
  onPersist: () => void;
  /** 空名单时「去招募」 */
  onGoRecruit?: () => void;
  /** 大厅养成指引重画挖洞 */
  onGuideRefresh?: () => void;
  /** 这次升级新开了专属纹章 */
  onExclusiveAwaken?: (info: EmblemAwakenInfo) => void;
}

export interface RosterViewHandle {
  root: PIXI.Container;
  cardRect(rosterId: string): SpotlightRect | null;
  levelUpButtonRect(): SpotlightRect | null;
  detailTabRect(id: RosterDetailTab): SpotlightRect | null;
  detailRosterId(): string | null;
}

const PAD = 12;
const GRID_GAP = 8;
/**
 * 一行四个。
 *
 * 静态棋子是 `anim2token` 烤的 128px 高，三列卡在 3 倍屏上会把图拉到两百多物理像素，
 * 线性放大发糊。真要锐，得另出大立绘或提高 token 分辨率；在那之前先把显示尺码压回去。
 */
export const ROSTER_GRID_COLS = 4;
/** 和 `makeRosterCardFace` 的圆角一致，底栏才能贴齐卡底 */
export const ROSTER_CARD_RADIUS = 16;
export const ROSTER_FOOTER_H = 40;

export function rosterGridMetrics(screenW: number): { cols: number; cardW: number; cardH: number } {
  const gridW = screenW - PAD * 2;
  const cols = ROSTER_GRID_COLS;
  const cardW = Math.floor((gridW - GRID_GAP * (cols - 1)) / cols);
  const cardH = Math.round(cardW * 1.34);
  return { cols, cardW, cardH };
}

/** 名字 + 等级在底栏里垂直居中，上下留同样的气口 */
export function rosterCardFooterLayout(opts: {
  cardH: number;
  nameH: number;
  subH: number;
}): { barTop: number; nameY: number; subY: number } {
  const gap = 2;
  const pad = 4;
  const barTop = opts.cardH - ROSTER_FOOTER_H;
  const block = opts.nameH + gap + opts.subH;
  const inner = ROSTER_FOOTER_H - pad * 2;
  const y0 = barTop + pad + Math.max(0, (inner - block) / 2);
  return { barTop, nameY: y0, subY: y0 + opts.nameH + gap };
}

/** 属性行的展示名，顺序即显示顺序 */
const STAT_ROWS: { key: 'maxHp' | 'atk' | 'spd' | 'move'; label: string }[] = [
  { key: 'maxHp', label: '生命' },
  { key: 'atk', label: '攻击' },
  { key: 'spd', label: '速度' },
  { key: 'move', label: '移动' },
];

export interface RosterStatTotal {
  key: 'maxHp' | 'atk' | 'spd' | 'move';
  label: string;
  current: number;
  /** 升一级后的总数；满级或没有成长表时为 null */
  nextTotal: number | null;
  gain: number;
}

/**
 * 详情页四维：左边当前值，右边升级增量。
 * 增量才是养成页要盯的数，展示时必须和当前值一样大。
 */
export function rosterStatTotals(
  current: CharacterBaseStats,
  next: CharacterBaseStats | null,
): RosterStatTotal[] {
  return STAT_ROWS.map((r) => {
    const cur = current[r.key];
    const nxt = next ? next[r.key] : null;
    const gain = nxt !== null ? nxt - cur : 0;
    return { ...r, current: cur, nextTotal: nxt, gain };
  });
}

export interface RosterUpgradeCostItem {
  id: string;
  icon: string;
  label: string;
  need: number;
  have: number;
}

/** 升级消耗。先只有魂晶，做成列表是为了以后加碎片/道具不用改按钮文案。 */
export function rosterUpgradeCostItems(haveSoul: number, level: number): RosterUpgradeCostItem[] {
  return [{
    id: 'soul',
    icon: 'icon_soul',
    label: '魂晶',
    need: levelUpCost(level),
    have: haveSoul,
  }];
}

export const ROSTER_DETAIL_TABS = [
  { id: 'upgrade', label: '升级' },
  { id: 'skill', label: '技能详情' },
  { id: 'emblem', label: '永久纹章' },
] as const;

export type RosterDetailTab = (typeof ROSTER_DETAIL_TABS)[number]['id'];

export const ROSTER_DETAIL_TITLE_H = 76;
export const ROSTER_DETAIL_FOOTER_H = 40;
export const ROSTER_STAT_ROW_H = 24;
export const ROSTER_ACTION_BTN_H = 40;

/** 钉在弹窗底、不进词条滚动的升级条高度 */
export function rosterDetailActionH(showCost: boolean): number {
  return (showCost ? 28 + 6 : 0) + ROSTER_ACTION_BTN_H + 10;
}

/** 详情弹窗宽度：两侧先留给翻页钮，按钮必须在窗外，不能压文字。 */
export function rosterDetailPanelWidth(screenW: number): number {
  const side = ROSTER_NAV_BTN.width + ROSTER_NAV_GAP + 4;
  return Math.min(340, Math.max(200, screenW - side * 2));
}

/** 详情左右翻页：只在已拥有的人里转，到头绕回。不够两人不翻。 */
export function rosterDetailNeighbor(
  rosterIds: string[],
  currentId: string,
  dir: -1 | 1,
): string | null {
  if (rosterIds.length < 2) return null;
  const i = rosterIds.indexOf(currentId);
  if (i < 0) return null;
  return rosterIds[(i + dir + rosterIds.length) % rosterIds.length] ?? null;
}

/**
 * 微信会把一次触摸再合成一次 pointer，翻页钮会连响两下。
 * 连响一次就隔人跳：雷恩→格隆、希尔→奥莉，看起来像两两互切。
 */
export const ROSTER_FLIP_LOCK_MS = 280;

export function rosterFlipLockUntil(now: number, prevLock: number): number | null {
  if (now < prevLock) return null;
  return now + ROSTER_FLIP_LOCK_MS;
}

/** 详情弹窗高度和下移量：上沿让过顶栏魂晶，避免黄标题把数字挡住。 */
export function rosterDetailPanelLayout(screenH: number): { panelH: number; offsetY: number } {
  const topGap = hubSoulBarBottom() + 10;
  const panelH = Math.min(Math.max(320, screenH - topGap - 16), 560);
  const centered = Math.floor((screenH - panelH) / 2);
  return {
    panelH,
    offsetY: Math.max(0, topGap - centered),
  };
}

/** 纹章名的颜色，和三选一卡、信息面板是同一套稀有度语言 */
const MOD_COLOR: Record<SkillModRarity, number> = {
  common: 0x5a6a7a,
  rare: 0x2f6fae,
  epic: 0xa5561f,
};

export function rosterUnlockHint(def: CharacterDef): string {
  if (def.unlock.kind === 'meta') return `魂晶 ${def.unlock.cost}`;
  if (def.unlock.kind === 'clearDungeon') {
    const d = getDungeonDef(def.unlock.dungeonId);
    return d ? `通关${d.name}` : '通关解锁';
  }
  if (def.unlock.kind === 'story') return '跟随冒险加入';
  return '开局拥有';
}

/**
 * 角色页：图鉴网格 + 已拥有的养成。
 *
 * 未拥有的人画成灰卡、点进去招募页，不在这里花魂晶——避免和招募页各开一个入口。
 * 卡直接压在厅堂上，不再套一层空白大面板。
 */
export function createRosterView(
  state: MvpGameState,
  cb: RosterCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): RosterViewHandle {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H, 'roster_bg'));

  const header = createHubHeader({
    screenWidth: W,
    title: '角色',
    page: 'roster',
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

  const gridW = W - PAD * 2;
  const { cols, cardW, cardH } = rosterGridMetrics(W);

  const owned = state.meta.roster;
  const ownedIds = new Set(owned.map((m) => m.rosterId));
  const lockedDefs = CHARACTER_DEFS.filter((d) => !ownedIds.has(d.id));

  const heading = makeText('我的角色', 'title', {
    fill: 0xfff8e8,
    fontSize: 17,
    stroke: 0x2a2010,
    strokeThickness: 4,
  });
  heading.x = PAD;
  heading.y = 6;
  scroll.content.addChild(heading);
  const countTx = makeText(`${owned.length}/${CHARACTER_DEFS.length}`, 'caption', { fill: 0xf0e0c8 });
  countTx.x = PAD + heading.width + 10;
  countTx.y = 10;
  scroll.content.addChild(countTx);

  const pops: PIXI.Container[] = [];
  const gridY = heading.y + heading.height + 10;
  const cards: PIXI.Container[] = [];
  const cardById = new Map<string, { card: PIXI.Container; w: number; h: number }>();

  owned.forEach((m) => cards.push(buildOwnedCard(m, cardW, cardH)));
  lockedDefs.forEach((def) => cards.push(buildLockedCard(def, cardW, cardH)));

  if (cards.length === 0) {
    const empty = makeText('还没有角色。去招募页看看谁能加入。', 'caption', {
      fill: 0xf0e0c8,
      wordWrap: true,
      wordWrapWidth: gridW,
    });
    empty.x = PAD;
    empty.y = gridY;
    scroll.content.addChild(empty);
  } else {
    cards.forEach((card, i) => {
      card.x = PAD + (i % cols) * (cardW + GRID_GAP);
      card.y = gridY + Math.floor(i / cols) * (cardH + GRID_GAP);
      scroll.content.addChild(card);
      pops.push(card);
    });
  }
  const rows = Math.ceil(cards.length / cols);
  const bottom = cards.length === 0
    ? gridY + 48
    : gridY + rows * (cardH + GRID_GAP);
  scroll.refresh(bottom + 8);
  staggerPop(pops.slice(0, cols * 2), 40);

  /**
   * 网格卡。
   *
   * 加了**主技能图标**：一队人里谁带的是横扫谁带的是突刺，是玩家决定升谁、给谁学新招的
   * 主要依据，原来卡上只有名字和等级，这件事必须一个个点开才知道。图标和战斗操作条、
   * 三选一卡片是同一张图，所以这里认过的符号在战斗里直接能用。
   */
  function paintCardShell(w: number, h: number, locked: boolean): PIXI.Container {
    const card = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.28);
    shadow.drawRoundedRect(2, 4, w, h, 16);
    shadow.endFill();
    card.addChild(shadow);
    card.addChild(makeRosterCardFace(w, h, locked));
    return card;
  }

  function paintFooter(card: PIXI.Container, w: number, h: number, name: string, sub: string): void {
    const nameTx = makeText(name, 'uiStrong', { fill: 0xfff8e8, fontSize: 14 });
    const subTx = makeText(sub, 'caption', { fill: 0xf3ddb0, fontSize: 13 });
    const box = rosterCardFooterLayout({
      cardH: h,
      nameH: nameTx.height,
      subH: subTx.height,
    });

    const bar = new PIXI.Graphics();
    bar.beginFill(0x1a1410, 0.88);
    bar.drawRoundedRect(0, box.barTop, w, ROSTER_FOOTER_H, ROSTER_CARD_RADIUS);
    // 上沿抹平，只留卡底那两个圆角，避免内缩条和卡面错位
    bar.drawRect(0, box.barTop, w, ROSTER_CARD_RADIUS);
    bar.endFill();
    card.addChild(bar);

    nameTx.anchor.set(0.5, 0);
    nameTx.x = w / 2;
    nameTx.y = box.nameY;
    card.addChild(nameTx);

    subTx.anchor.set(0.5, 0);
    subTx.x = w / 2;
    subTx.y = box.subY;
    card.addChild(subTx);
  }

  function attachLevelUpHint(card: PIXI.Container, cardW: number): void {
    const hint = new PIXI.Container();
    const disc = new PIXI.Graphics();
    disc.lineStyle(2, 0xf5c84a, 1);
    disc.beginFill(0x1a1410, 0.92);
    disc.drawCircle(0, 0, 11);
    disc.endFill();
    hint.addChild(disc);

    const arrow = new PIXI.Graphics();
    arrow.lineStyle(1.4, 0x145820, 1);
    arrow.beginFill(0x48d45c, 1);
    arrow.drawPolygon([
      0, -7.5,
      7, 1,
      3, 1,
      3, 7.2,
      -3, 7.2,
      -3, 1,
      -7, 1,
    ]);
    arrow.endFill();
    hint.addChild(arrow);

    hint.x = cardW - 13;
    hint.y = 13;
    hint.eventMode = 'none';
    card.addChild(hint);

    const baseY = hint.y;
    let acc = 0;
    const bob = (): void => {
      if (!isDisplayLive(hint)) {
        PIXI.Ticker.shared.remove(bob);
        return;
      }
      acc += PIXI.Ticker.shared.deltaMS;
      hint.y = baseY + Math.sin(acc / 160) * 3.5;
    };
    PIXI.Ticker.shared.add(bob);
  }

  function paintSkillBadge(card: PIXI.Container, skillId: string, accent: number): void {
    const icon = createUiIcon(`skill_${skillId}`, 18);
    const ring = new PIXI.Graphics();
    ring.lineStyle(1.5, C.ink, 0.9, 0);
    ring.beginFill(accent, 1);
    ring.drawCircle(18, 18, 13);
    ring.endFill();
    card.addChild(ring);
    if (icon) {
      icon.x = 18 - 9;
      icon.y = 18 - 9;
      card.addChild(icon);
    }
  }

  /**
   * 网格卡。棋子尽量铺满卡面、压在底栏上——参考页的质感来自立绘占卡，不是白底小图标。
   */
  function buildOwnedCard(m: Character, w: number, h: number): PIXI.Container {
    const card = paintCardShell(w, h, false);
    const token = createUnitToken(characterArtKey(m), 'player', Math.min(w - 6, h - ROSTER_FOOTER_H + 8));
    token.x = w / 2;
    token.y = (h - ROSTER_FOOTER_H) * 0.56;
    card.addChild(token);

    paintSkillBadge(card, resolveBattleSkillIdForCharacter(state, m), PROFESSION_ACCENT[m.profession]);
    paintFooter(card, w, h, m.name, `Lv.${m.level}`);
    if (canAffordCharacterLevelUp(state.meta, m)) {
      attachLevelUpHint(card, w);
    }
    cardById.set(m.rosterId, { card, w, h });

    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.hitArea = new PIXI.Rectangle(0, 0, w, h);
    attachPress(card, { guard: scroll.wasDragging });
    card.on('pointertap', () => {
      if (scroll.wasDragging()) return;
      openDetail(m);
    });
    return card;
  }

  function buildLockedCard(def: CharacterDef, w: number, h: number): PIXI.Container {
    const card = paintCardShell(w, h, true);
    const token = createUnitToken(
      characterArtKey({ rosterId: def.id, profession: def.profession }),
      'player',
      Math.min(w - 6, h - ROSTER_FOOTER_H + 8),
    );
    token.x = w / 2;
    token.y = (h - ROSTER_FOOTER_H) * 0.56;
    token.alpha = 0.4;
    card.addChild(token);

    paintSkillBadge(card, def.defaultSkillId, 0x8a8a90);

    const hint = makeText(rosterUnlockHint(def), 'micro', {
      fill: 0xffffff,
      fontSize: 11,
      stroke: 0x1a1410,
      strokeThickness: 4,
      wordWrap: true,
      wordWrapWidth: w - 12,
      align: 'center',
    });
    hint.anchor.set(0.5, 0.5);
    hint.x = w / 2;
    hint.y = (h - ROSTER_FOOTER_H) * 0.72;
    card.addChild(hint);

    paintFooter(card, w, h, def.name, '未加入');

    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.hitArea = new PIXI.Rectangle(0, 0, w, h);
    attachPress(card, { guard: scroll.wasDragging });
    card.on('pointertap', () => {
      if (scroll.wasDragging()) return;
      cb.onGoRecruit?.();
    });
    return card;
  }

  // ---------------- 详情 + 养成弹窗 ----------------

  let modal: ModalHandle | null = null;
  let stopPanel: (() => void) | null = null;
  /** 弹窗里改过东西：关掉时要重绘网格，不然卡上的等级还是旧的 */
  let dirty = false;
  /** 底栏分页。升级后原地刷新要记住，否则会被弹回默认页 */
  let detailTab: RosterDetailTab = 'upgrade';
  let detailOpenId: string | null = null;
  let levelUpBtn: PIXI.Container | null = null;
  let levelUpBtnSize = { w: 0, h: 38 };
  const detailTabHits = new Map<RosterDetailTab, { node: PIXI.Container; w: number; h: number }>();
  let soulHud: CurrencyPill | null = null;
  let listScroll: ScrollListHandle | null = null;
  let flipLockUntil = 0;

  function mountForegroundSoul(md: ModalHandle): void {
    header.setSoulVisible(false);
    soulHud = createCurrencyPill('icon_soul', `${state.meta.metaCurrency}`);
    const origin = hubSoulPillOrigin();
    soulHud.x = origin.x;
    soulHud.y = origin.y;
    md.overlay.addChild(soulHud);
  }

  function closeDetail(): void {
    stopPanel?.();
    stopPanel = null;
    modal = null;
    detailOpenId = null;
    levelUpBtn = null;
    soulHud = null;
    listScroll = null;
    header.setSoulVisible(true);
    header.setSoul(state.meta.metaCurrency);
    if (readHubUpgradeGuideStep(state.meta) === HubUpgradeGuideStep.TAP_LEVELUP) {
      setHubUpgradeGuideStep(state.meta, HubUpgradeGuideStep.TAP_RAYEN);
      cb.onPersist();
    }
    if (dirty) {
      dirty = false;
      cb.onChanged();
      return;
    }
    cb.onGuideRefresh?.();
  }

  function openDetail(m: Character): void {
    modal?.close();
    detailTab = 'upgrade';
    detailOpenId = m.rosterId;
    const panelW = rosterDetailPanelWidth(W);
    const { panelH, offsetY } = rosterDetailPanelLayout(H);
    const md = createModal({
      screenWidth: W,
      screenHeight: H,
      panelWidth: panelW,
      panelHeight: panelH,
      offsetY,
      footerHeight: ROSTER_DETAIL_FOOTER_H,
      titleHeight: ROSTER_DETAIL_TITLE_H,
      light: true,
      title: '',
      showClose: true,
      closeCorner: true,
      scrollable: false,
      onClose: closeDetail,
      onOpened: () => cb.onGuideRefresh?.(),
    });
    modal = md;
    root.addChild(md.root);
    mountForegroundSoul(md);
    fillDetail(md, m);
    mountDetailNav(md, panelW, panelH, offsetY);
    if (notifyHubUpgradeGuide(state, { type: 'openRayen', rosterId: m.rosterId })) {
      cb.onPersist();
    }
    cb.onGuideRefresh?.();
  }

  function flipDetail(dir: -1 | 1): void {
    const nextLock = rosterFlipLockUntil(Date.now(), flipLockUntil);
    if (nextLock == null) return;
    flipLockUntil = nextLock;
    const nextId = rosterDetailNeighbor(
      state.meta.roster.map((c) => c.rosterId),
      detailOpenId ?? '',
      dir,
    );
    if (!nextId) return;
    const next = state.meta.roster.find((c) => c.rosterId === nextId);
    if (!next) return;
    detailOpenId = next.rosterId;
    refillDetail(next);
    if (notifyHubUpgradeGuide(state, { type: 'openRayen', rosterId: next.rosterId })) {
      cb.onPersist();
    }
    cb.onGuideRefresh?.();
  }

  function mountDetailNav(
    md: ModalHandle,
    panelW: number,
    panelH: number,
    offsetY: number,
  ): void {
    if (state.meta.roster.length < 2) return;
    const restX = Math.floor((W - panelW) / 2);
    const restY = modalPanelRestY(H, panelH, offsetY);
    const btnW = ROSTER_NAV_BTN.width;
    const btnH = ROSTER_NAV_BTN.height;
    const bodyTop = restY + ROSTER_DETAIL_TITLE_H;
    const bodyH = panelH - ROSTER_DETAIL_TITLE_H - ROSTER_DETAIL_FOOTER_H;
    const y = bodyTop + Math.max(8, (bodyH - btnH) / 2);
    const prev = makeChevronButton(-1, () => flipDetail(-1));
    const next = makeChevronButton(1, () => flipDetail(1));
    prev.x = restX - btnW - ROSTER_NAV_GAP;
    next.x = restX + panelW + ROSTER_NAV_GAP;
    prev.y = y;
    next.y = y;
    md.root.addChild(prev);
    md.root.addChild(next);
  }

  /** 重新填一次弹窗内容（升级/学技能之后原地刷新，不关窗） */
  function refillDetail(m: Character): void {
    if (!modal) return;
    stopPanel?.();
    stopPanel = null;
    listScroll = null;
    modal.body.removeChildren();
    modal.titleBar.removeChildren();
    modal.footer.removeChildren();
    detailTabHits.clear();
    fillDetail(modal, m);
  }

  /**
   * 顶栏一行人物、属性钉住、词条可滚、消耗和升级钉在底栏上方。
   * 整页跟着滚会把升级按钮藏到下面——那正是这页不能用弹窗自带滚动的原因。
   */
  function fillDetail(md: ModalHandle, m: Character): void {
    levelUpBtn = null;
    listScroll = null;
    const w = md.bodySize.width;
    const bodyH = md.bodySize.height;
    fillTitleRow(md, m);
    if (detailTab === 'upgrade') {
      const statsH = addStatBlock(md.body, m, w, 0);
      const maxed = m.level >= MAX_CHARACTER_LEVEL;
      const actionH = rosterDetailActionH(!maxed);
      const scrollH = Math.max(72, bodyH - statsH - actionH);
      const scroll = createScrollList({
        x: 0,
        y: statsH,
        width: w,
        height: scrollH,
        showBar: true,
      });
      md.body.addChild(scroll.root);
      listScroll = scroll;
      const listH = addUpgradeEmblemBlock(scroll.content, m, w, 0);
      scroll.refresh(listH);
      addLevelUpAction(md.body, m, w, bodyH - actionH);
    } else {
      const scroll = createScrollList({
        x: 0,
        y: 0,
        width: w,
        height: bodyH,
        showBar: true,
      });
      md.body.addChild(scroll.root);
      listScroll = scroll;
      const listH = detailTab === 'emblem'
        ? addPersonalEmblemBlock(scroll.content, m, w, 0)
        : addSkillBlock(scroll.content, m, w, 0);
      scroll.refresh(listH);
    }
    addFooterTabs(md, m);
  }

  function listDragging(): boolean {
    return listScroll?.wasDragging() ?? false;
  }

  /** 这一局带的招牌技能（含本局纹章前的原始规格） */
  function signatureSpec(m: Character): SkillSpec | undefined {
    return getSkillSpec(resolveBattleSkillIdForCharacter(state, m));
  }

  /** 黄标题栏：全身立绘 + 名字等级 / 定位，右侧招牌技能，点了切到技能详情。 */
  function fillTitleRow(md: ModalHandle, m: Character): void {
    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    const w = md.titleBarSize.width;
    const h = md.titleBarSize.height;
    const tokenH = h + 8;
    const token = createUnitToken(characterArtKey(m), 'player', tokenH);
    token.x = 8 + tokenH / 2;
    token.y = h / 2 + 2;
    md.titleBar.addChild(token);

    const ink = shade(C.primary, 0.28);
    const name = makeText(`${m.name}  Lv.${m.level}`, 'heading', {
      fill: ink,
      fontSize: 17,
    });
    const role = makeText(
      def
        ? `${UNIT_DEFS[m.profession].name} · ${describeSkillRole(def.skillRoute)}`
        : UNIT_DEFS[m.profession].name,
      'caption',
      { fill: ink, fontSize: 12 },
    );
    const textX = 8 + tokenH + 4;
    const block = name.height + 2 + role.height;
    name.x = textX;
    name.y = (h - block) / 2;
    role.x = textX;
    role.y = name.y + name.height + 2;
    md.titleBar.addChild(name);
    md.titleBar.addChild(role);

    const spec = signatureSpec(m);
    if (!spec) return;
    const iconSize = 40;
    const bangR = 6.5;
    const icon = createUiIcon(`skill_${spec.id}`, iconSize) ?? makeSkillIconFallback(iconSize);
    const bang = makeInfoBang(bangR);
    const skName = makeText(spec.name, 'uiStrong', { fill: 0xc46a14, fontSize: 11 });
    const iconW = iconSize + bangR;
    const chipW = Math.max(iconW, skName.width);
    const chipH = iconSize + 2 + skName.height;
    const chip = new PIXI.Container();
    icon.x = (chipW - iconW) / 2;
    icon.y = 0;
    chip.addChild(icon);
    bang.x = icon.x + iconSize - bangR + 2;
    bang.y = -2;
    chip.addChild(bang);
    skName.x = (chipW - skName.width) / 2;
    skName.y = iconSize + 2;
    chip.addChild(skName);
    const afterName = name.x + name.width + 22;
    chip.x = afterName + chipW > w - 4 ? w - chipW - 4 : afterName;
    chip.y = (h - chipH) / 2;
    md.titleBar.eventMode = 'static';
    md.titleBar.interactiveChildren = true;
    chip.eventMode = 'static';
    chip.cursor = 'pointer';
    chip.hitArea = new PIXI.Rectangle(-4, -4, chipW + 8, chipH + 8);
    attachPress(chip);
    chip.on('pointertap', () => {
      if (detailTab === 'skill') return;
      detailTab = 'skill';
      refillDetail(m);
    });
    md.titleBar.addChild(chip);
  }

  function makeSkillIconFallback(size: number): PIXI.Container {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0xc46a14, 0.16);
    g.lineStyle(1.2, 0xc46a14, 0.75);
    g.drawRoundedRect(0, 0, size, size, 6);
    g.endFill();
    c.addChild(g);
    return c;
  }

  /** 信息感叹号：几何画，不靠字体子集里有没有 `!`。 */
  function makeInfoBang(r: number): PIXI.Container {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0xc46a14, 1);
    g.lineStyle(1, 0xfff4d8, 0.95);
    g.drawCircle(r, r, r);
    g.endFill();
    g.lineStyle(0);
    g.beginFill(0xfff6e4, 1);
    g.drawRoundedRect(r - 1.15, r * 0.32, 2.3, r * 0.78, 1);
    g.endFill();
    g.beginFill(0xfff6e4, 1);
    g.drawCircle(r, r * 1.52, 1.35);
    g.endFill();
    c.addChild(g);
    c.hitArea = new PIXI.Circle(r, r, r);
    return c;
  }

  function addSectionTitle(box: PIXI.Container, text: string, w: number, top: number): number {
    const accent = 0xc46a14;
    const title = makeText(text, 'heading', {
      fill: accent,
      fontSize: 15,
      letterSpacing: 1.2,
    });
    title.anchor.set(0.5, 0);
    title.x = w / 2;
    title.y = top;
    box.addChild(title);
    const lineY = top + title.height / 2;
    const gap = 10;
    const lineW = Math.max(24, (w - title.width) / 2 - gap);
    const left = new PIXI.Graphics();
    left.lineStyle(1.5, accent, 0.35);
    left.moveTo(0, lineY);
    left.lineTo(lineW, lineY);
    box.addChild(left);
    const right = new PIXI.Graphics();
    right.lineStyle(1.5, accent, 0.35);
    right.moveTo(w - lineW, lineY);
    right.lineTo(w, lineY);
    box.addChild(right);
    return title.height + 8;
  }

  /**
   * 两列矮行：当前值 + 同号绿字增量。行高低、数字大，才装得下又不抢词条。
   */
  function addStatBlock(parent: PIXI.Container, m: Character, w: number, top: number): number {
    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    const box = new PIXI.Container();
    box.y = top;
    parent.addChild(box);

    const maxed = m.level >= MAX_CHARACTER_LEVEL;
    const emblemStats = personalEmblemModsFor(state.meta, m.rosterId).stats;
    const cur = addCharacterStats(characterEffectiveStats(m), emblemStats);
    const nextBase = def && !maxed ? characterStatsAtLevel(def, m.level + 1) : null;
    const next = nextBase ? addCharacterStats(nextBase, emblemStats) : null;
    const rows = rosterStatTotals(cur, next);
    const rowH = ROSTER_STAT_ROW_H;
    const gap = 2;
    const colW = Math.floor((w - 8) / 2);
    const numSize = 17;
    const rowsH = Math.ceil(rows.length / 2) * (rowH + gap);
    const panel = new PIXI.Graphics();
    panel.beginFill(0x1a1410, 0.045);
    panel.drawRoundedRect(0, 0, w, rowsH + 4, 8);
    panel.endFill();
    box.addChild(panel);
    rows.forEach((row, i) => {
      const cell = new PIXI.Container();
      cell.x = (i % 2) * (colW + 8);
      cell.y = 2 + Math.floor(i / 2) * (rowH + gap);
      const label = makeText(row.label, 'caption', { fill: C.muted, fontSize: 11 });
      label.x = 8;
      label.y = (rowH - label.height) / 2;
      cell.addChild(label);
      let right = colW - 4;
      if (row.gain > 0) {
        const plus = makeText(`+${row.gain}`, 'uiStrong', { fill: 0x2f9a58, fontSize: numSize });
        plus.anchor.set(1, 0);
        plus.x = right;
        plus.y = (rowH - plus.height) / 2;
        cell.addChild(plus);
        right -= plus.width + 6;
      }
      const num = makeText(`${row.current}`, 'uiStrong', { fill: C.ink, fontSize: numSize });
      num.anchor.set(1, 0);
      num.x = right;
      num.y = (rowH - num.height) / 2;
      cell.addChild(num);
      box.addChild(cell);
    });
    return rowsH + 10;
  }

  /**
   * 贴在面板底的文件夹页签，不是两颗独立按钮。
   * 选中格和正文同色：上沿直角贴着正文，下沿圆角往下挂。
   */
  function addFooterTabs(md: ModalHandle, m: Character): void {
    const w = md.footerSize.width;
    const h = md.footerSize.height;
    const n = ROSTER_DETAIL_TABS.length;
    const tw = w / n;
    const radius = 14;

    const back = new PIXI.Graphics();
    back.beginFill(0x6a6560, 1);
    back.drawRoundedRect(0, 0, w, h, radius);
    back.drawRect(0, 0, w, radius);
    back.endFill();
    md.footer.addChild(back);

    for (const [i, t] of ROSTER_DETAIL_TABS.entries()) {
      const on = t.id === detailTab;
      const tab = new PIXI.Container();
      tab.x = i * tw;
      if (on) {
        const face = new PIXI.Graphics();
        face.beginFill(C.paper, 1);
        face.drawRoundedRect(0, 0, tw, h, radius);
        face.drawRect(0, 0, tw, radius);
        face.endFill();
        tab.addChild(face);
      }
      const label = makeText(t.label, 'uiStrong', {
        fill: on ? C.ink : 0xf7f1e6,
        fontSize: n > 2 ? 12 : 14,
      });
      label.anchor.set(0.5);
      label.x = tw / 2;
      label.y = h / 2;
      tab.addChild(label);
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.hitArea = new PIXI.Rectangle(0, 0, tw, h);
      tab.on('pointertap', () => {
        if (t.id === 'emblem' && notifyHubUpgradeGuide(state, { type: 'openEmblemTab', rosterId: m.rosterId })) {
          cb.onPersist();
        }
        if (t.id === detailTab) return;
        detailTab = t.id;
        refillDetail(m);
        cb.onGuideRefresh?.();
      });
      md.footer.addChild(tab);
      detailTabHits.set(t.id, { node: tab, w: tw, h });
    }
  }

  /**
   * 技能分页：招牌招式在前，普攻垫底。
   *
   * 和布阵页、战斗页共用同一块渲染，数值和格子图不会各写一套。
   * 头像、姓名、四维关掉——概览已经写过一次。
   */
  function addSkillBlock(parent: PIXI.Container, m: Character, w: number, top: number): number {
    const box = new PIXI.Container();
    box.y = top;
    parent.addChild(box);

    const model = characterInfoModel(state, m);
    if (model.skills[0]) model.skills[0].title = '招牌技能';
    const info = createUnitInfoPanel(model, w, {
      drawBg: false,
      showHeader: false,
      showStats: false,
      skillsBeforeStrike: true,
    });
    box.addChild(info.view);
    stopPanel = info.stop;

    return info.height + 8;
  }

  /**
   * 升级效果 = 专属纹章解锁链。带等级徽、图标和效果，锁着的也摊开。
   * 通用纹章不跟等级绑，不进这里。
   */
  function addUpgradeEmblemBlock(parent: PIXI.Container, m: Character, w: number, top: number): number {
    const spec = signatureSpec(m);
    const box = new PIXI.Container();
    box.y = top;
    parent.addChild(box);

    let y = addSectionTitle(box, '升级效果', w, 0);

    if (!spec) {
      const empty = makeText('这个角色还没有专属纹章。', 'caption', { fill: C.muted });
      empty.y = y;
      box.addChild(empty);
      return y + empty.height + 8;
    }

    const chain = exclusiveChainForSkill(spec);
    const nextUnlock = chain.find((mod) => m.level < mod.minLevel)?.minLevel;
    for (const mod of chain) {
      const unlocked = m.level >= mod.minLevel;
      y += addEmblemCard(box, mod, w, y, {
        unlocked,
        next: !unlocked && mod.minLevel === nextUnlock,
      });
      y += 4;
    }
    return y + 2;
  }

  /**
   * 跟人的永久被动。没拿到整页留空，不写占位也不剧透。
   */
  function addPersonalEmblemBlock(parent: PIXI.Container, m: Character, w: number, top: number): number {
    const cards = personalEmblemRosterCards(state.meta, m.rosterId);
    if (cards.length === 0) return top;

    const box = new PIXI.Container();
    box.y = top;
    parent.addChild(box);

    let y = addSectionTitle(box, '永久纹章', w, 0);
    for (const card of cards) {
      y += addPersonalEmblemCard(box, w, y, card.copy, {
        icon: card.def.icon,
        owned: true,
      });
      y += 4;
    }
    return y + 2;
  }

  function addPersonalEmblemCard(
    box: PIXI.Container,
    w: number,
    top: number,
    copy: PersonalEmblemCardCopy,
    mark: { icon: string; owned: boolean },
  ): number {
    const card = new PIXI.Container();
    card.y = top;
    const iconSize = 20;
    const pad = 6;
    const textX = pad + iconSize + 8;
    const textW = Math.max(60, w - textX - pad);

    const nm = makeText(copy.title, 'uiStrong', {
      fill: mark.owned ? C.primary : C.muted,
      fontSize: 12,
    });
    const tag = makeText(copy.source, 'caption', {
      fill: mark.owned ? 0x2f9a58 : C.muted,
      fontSize: 10,
    });
    const desc = makeText(copy.desc, 'caption', {
      fill: C.muted,
      fontSize: 10,
      lineHeight: 13,
      wordWrap: true,
      wordWrapWidth: textW,
      breakWords: true,
    });
    const headH = Math.max(nm.height, tag.height);
    const h = pad + headH + 2 + desc.height + pad;

    const bg = new PIXI.Graphics();
    bg.beginFill(mark.owned ? 0xfff6e4 : 0x1a1410, mark.owned ? 1 : 0.035);
    if (mark.owned) bg.lineStyle(1.2, C.primary, 0.9);
    bg.drawRoundedRect(0, 0, w, h, 8);
    bg.endFill();
    card.addChild(bg);

    const icon = createUiIcon(mark.icon, iconSize);
    if (icon) {
      icon.x = pad;
      icon.y = pad;
      icon.alpha = mark.owned ? 1 : 0.45;
      card.addChild(icon);
    }

    nm.x = textX;
    nm.y = pad;
    tag.anchor.set(1, 0);
    tag.x = w - pad;
    tag.y = pad + (headH - tag.height) / 2;
    desc.x = textX;
    desc.y = pad + headH + 2;
    card.addChild(nm);
    card.addChild(tag);
    card.addChild(desc);
    if (!mark.owned) card.alpha = 0.75;

    box.addChild(card);
    return h;
  }

  function addEmblemCard(
    box: PIXI.Container,
    mod: SkillModDef,
    w: number,
    top: number,
    state: { unlocked: boolean; next: boolean },
  ): number {
    const card = new PIXI.Container();
    card.y = top;
    const iconSize = 20;
    const pad = 6;
    const textX = pad + iconSize + 8;
    const textW = Math.max(60, w - textX - pad);

    const nm = makeText(mod.name, 'uiStrong', {
      fill: state.unlocked ? MOD_COLOR[mod.rarity] : C.muted,
      fontSize: 12,
    });
    const tag = makeText(state.unlocked ? '已解锁' : `Lv.${mod.minLevel} 解锁`, 'caption', {
      fill: state.unlocked ? 0x2f9a58 : state.next ? 0xa5561f : C.muted,
      fontSize: 11,
    });
    const desc = makeText(mod.describe(1), 'caption', {
      fill: C.muted,
      fontSize: 10,
      lineHeight: 13,
      wordWrap: true,
      wordWrapWidth: textW,
      breakWords: true,
    });
    const headH = Math.max(nm.height, tag.height);
    const h = pad + headH + 2 + desc.height + pad;

    const bg = new PIXI.Graphics();
    bg.beginFill(state.next ? 0xfff6e4 : 0x1a1410, state.next ? 1 : 0.035);
    if (state.next) bg.lineStyle(1.2, C.primary, 0.9);
    bg.drawRoundedRect(0, 0, w, h, 8);
    bg.endFill();
    card.addChild(bg);

    const icon = createUiIcon(mod.icon, iconSize);
    if (icon) {
      icon.x = pad;
      icon.y = pad;
      icon.alpha = state.unlocked ? 1 : 0.5;
      card.addChild(icon);
    }

    nm.x = textX;
    nm.y = pad;
    tag.anchor.set(1, 0);
    tag.x = w - pad;
    tag.y = pad + (headH - tag.height) / 2;
    desc.x = textX;
    desc.y = pad + headH + 2;
    card.addChild(nm);
    card.addChild(tag);
    card.addChild(desc);
    if (!state.unlocked && !state.next) card.alpha = 0.7;

    box.addChild(card);
    return h;
  }

  /** 消耗单独一行，按钮只写「升级」。以后加碎片/道具只往这一行塞。 */
  function addLevelUpAction(parent: PIXI.Container, m: Character, w: number, top: number): number {
    const box = new PIXI.Container();
    box.y = top;
    parent.addChild(box);

    let y = 0;
    const maxed = m.level >= MAX_CHARACTER_LEVEL;
    const items = rosterUpgradeCostItems(state.meta.metaCurrency, m.level);
    const cost = items[0]?.need ?? 0;
    const affordable = items.every((it) => it.have >= it.need);

    if (!maxed) {
      y += addCostChips(box, items, w, y);
      y += 6;
    }

    const btn = makeButton(
      maxed ? '已满级' : '升级',
      () => {
        if (listDragging() || maxed) return;
        const from = m.level;
        const fromSoul = state.meta.metaCurrency;
        if (levelUpCharacter(state, m.rosterId)) {
          dirty = true;
          cb.onPersist();
          AudioManager.playSfx('sfx_soul_spend');
          if (soulHud) void animateCurrencySpend(soulHud, fromSoul, state.meta.metaCurrency);
          const spec = signatureSpec(m);
          const unlocked = spec
            ? exclusiveModsUnlockedBetween(spec.id, from, m.level)
            : [];
          if (m.rosterId === HUB_GUIDE_RAYEN_ID) {
            notifyHubUpgradeGuide(state, { type: 'leveledRayen', rosterId: m.rosterId });
            if (unlocked.length === 0) {
              notifyHubUpgradeGuide(state, { type: 'confirmAwaken' });
            }
            cb.onPersist();
          }
          refillDetail(m);
          if (unlocked.length) {
            cb.onExclusiveAwaken?.({
              rosterId: m.rosterId,
              characterName: m.name,
              mods: unlocked,
            });
          } else if (modal) {
            flashPop(modal.body, modal.bodySize.width, 48);
            AudioManager.playSfx('sfx_levelup');
          }
          cb.onGuideRefresh?.();
        } else if (modal) {
          showToast(modal.root, `魂晶不足（还差 ${cost - state.meta.metaCurrency}）`, {
            screenWidth: W,
            color: C.soulText,
            deny: true,
          });
        }
      },
      {
        variant: maxed || !affordable ? 'secondary' : 'primary',
        disabled: maxed,
        width: w,
        height: ROSTER_ACTION_BTN_H,
        fontSize: 14,
        radius: 8,
      },
    );
    btn.y = y;
    box.addChild(btn);
    levelUpBtn = btn;
    levelUpBtnSize = { w, h: ROSTER_ACTION_BTN_H };
    return y + ROSTER_ACTION_BTN_H + 10;
  }

  function addCostChips(
    box: PIXI.Container,
    items: RosterUpgradeCostItem[],
    w: number,
    top: number,
  ): number {
    const gap = 16;
    const chips = items.map((item) => makeCostChip(item));
    const totalW = chips.reduce((sum, c) => sum + c.width, 0) + gap * Math.max(0, chips.length - 1);
    let x = Math.max(0, (w - totalW) / 2);
    let rowH = 0;
    for (const chip of chips) {
      chip.x = x;
      chip.y = top;
      box.addChild(chip);
      x += chip.width + gap;
      rowH = Math.max(rowH, chip.height);
    }
    return rowH;
  }

  /** 消耗胶囊：图标 + 现有/需要，不写中文名。以后加材料只往这一排塞。 */
  function makeCostChip(item: RosterUpgradeCostItem): PIXI.Container {
    const chip = new PIXI.Container();
    const iconSize = 22;
    const short = item.have < item.need;
    const amount = makeText(`${item.have}/${item.need}`, 'uiStrong', {
      fill: short ? C.hp : C.ink,
      fontSize: 16,
    });
    const padR = 12;
    const textX = iconSize + 6;
    const w = textX + amount.width + padR;
    const h = 28;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a1410, 0.08);
    bg.drawRoundedRect(iconSize / 2, 0, w - iconSize / 2, h, h / 2);
    bg.endFill();
    chip.addChild(bg);
    const icon = createUiIcon(item.icon, iconSize);
    if (icon) {
      icon.x = 0;
      icon.y = (h - iconSize) / 2;
      chip.addChild(icon);
    }
    amount.x = textX;
    amount.y = (h - amount.height) / 2;
    chip.addChild(amount);
    return chip;
  }

  return {
    root,
    cardRect(rosterId: string): SpotlightRect | null {
      const hit = cardById.get(rosterId);
      if (!hit?.card.parent) return null;
      return spotlightRectOf(root, hit.card, { w: hit.w, h: hit.h }, ROSTER_CARD_RADIUS);
    },
    levelUpButtonRect(): SpotlightRect | null {
      if (!levelUpBtn?.parent) return null;
      return spotlightRectOf(root, levelUpBtn, levelUpBtnSize, 8);
    },
    detailTabRect(id: RosterDetailTab): SpotlightRect | null {
      const hit = detailTabHits.get(id);
      if (!hit?.node.parent) return null;
      return spotlightRectOf(root, hit.node, { w: hit.w, h: hit.h }, 8);
    },
    detailRosterId: () => detailOpenId,
  };
}
