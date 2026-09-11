import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { C, shade } from '@/view/mvpTheme';
import { makeAdButton, makeButton } from '@/ui/Button';
import { makePanel } from '@/ui/Panel';
import { AudioManager } from '@/core/AudioManager';
import { characterArtKey, getCharacterDef } from '@/data/characterCatalog';
import { createUiIcon, createUnitToken, drawCheck } from '@/view/renderHelpers';
import type { ClearStarBeat } from '@/data/chapterStars';
import type { SkillModRarity } from '@/data/skillModCatalog';
import {
  attachGlowRing,
  confettiBurst,
  createScrim,
  createTitleBanner,
  dropBanner,
  fadeScrim,
  flySoulBurstTo,
  flyTokenTo,
  staggerPop,
} from '@/view/fx/celebration';
import { awaitDelay, awaitEase } from '@/view/fx/tween';

/**
 * 战后结算弹层。
 *
 * 盖在战场上，不换场景。中途胜利和三选一合成一屏：上面回答「我赢了、拿到了什么」，
 * 下面才是「选哪张纹章」。通关只走奖励格；战败也盖一层，不再整页替换。
 */

/** 结算第一屏里的一格奖励；点开有详情 */
export interface RewardEntry {
  iconKey: string;
  name: string;
  /** 角标数量；<= 1 时不画角标 */
  amount: number;
  /** 详情弹窗里的品质标签，如「永久」「本局」 */
  quality: string;
  /** 详情弹窗正文 */
  desc: string;
  /** 详情弹窗的「获取途径」条目 */
  sources: string[];
  /** 详情弹窗标题栏配色 */
  tint: number;
  /** 方框下方的短标签，如「永久纹章」 */
  badge?: string;
  /** 跟人奖励：详情和格下画这个人的形象 */
  whoRosterId?: string;
}

export interface RewardOverlayOpts {
  screenW: number;
  screenH: number;
  /** 横幅里的大字，如「胜 利」 */
  title: string;
  /** 横幅下方一行小字，如「草原关隘 3/8」 */
  subtitle: string;
  /** 通关横幅后的三星。有则先演点亮，再出奖励格 */
  stars?: ClearStarBeat[];
  entries: RewardEntry[];
  confirmLabel: string;
  onConfirm: () => void;
  /** 缺省播胜利号。扫荡已经在点按钮时响过，再播会叠两声 */
  fanfare?: boolean;
  /** 点确定后魂晶飞向哪里。缺省战场左上；大厅扫荡要飞顶栏魂晶条 */
  soulFlyTo?: { x: number; y: number };
  /** true = 按入账枚数错帧飞（扫荡）；false = 飞一枚 */
  soulFlyBurst?: boolean;
}

/**
 * 结算第二屏的一张强化卡。
 *
 * 卡面要在一眼之内回答三个问题，顺序也是视觉权重的顺序：
 *
 *   **给谁**（顶部头像 + 名字）→ **哪一招**（正中大图标 + 技能名）→ **加什么**（词条名 + 说明）
 */
export interface LootCard {
  /** 顶部头像；null = 非角色类奖励（药剂兜底卡），此时不画头像区 */
  portrait: PIXI.Container | null;
  /** 角色名，如「雷恩」 */
  who: string;
  /** 正中的大图标：技能图标（`skill_*`）或药剂图标 */
  iconKey: string;
  /** 图标下方一行：技能名，如「旋风斩」 */
  skillName: string;
  /** 词条名，如「淬毒」 */
  modName: string;
  /** 右下角的词条类型小标签图标；null = 不画 */
  modIconKey: string | null;
  desc: string;
  rarity: SkillModRarity;
  exclusive?: boolean;
  /** 可叠层时：选完后的星级，如 ★★☆。空或不写 = 不画 */
  stars?: string;
}

export interface LootSummary {
  gold: number;
  soul: number;
}

export interface LootOverlayOpts {
  screenW: number;
  screenH: number;
  cards: LootCard[];
  summary?: LootSummary;
  onConfirm: (index: number) => void;
  onSkip: () => void;
  onNeedPick?: () => void;
  /** 看广告刷新三选一。不传就不画这颗钮（教学局） */
  onRefresh?: () => void;
}

export interface DefeatHint {
  iconKey: string;
  title: string;
  desc: string;
}

export type DefeatHintSet = 'chapter' | 'endless' | 'tutorial';

const HINT_REDEPLOY: DefeatHint = {
  iconKey: 'icon_deploy',
  title: '重新布阵',
  desc: '换站位、换技能，重打这一关',
};
const HINT_RECRUIT: DefeatHint = {
  iconKey: 'tab_recruit',
  title: '招募同伴',
  desc: '回大厅招人，队伍齐了再进',
};
const HINT_UPGRADE: DefeatHint = {
  iconKey: 'tab_roster',
  title: '升级角色',
  desc: '用已得魂晶升级、学技能',
};

/** 失败页「还能变强」三条。教程还不能离章，只留布阵。 */
export function defeatHintsFor(set: DefeatHintSet): DefeatHint[] {
  if (set === 'tutorial') return [HINT_REDEPLOY];
  if (set === 'endless') return [HINT_RECRUIT, HINT_UPGRADE];
  return [HINT_REDEPLOY, HINT_RECRUIT, HINT_UPGRADE];
}

export interface AbandonConfirmCopy {
  title: string;
  keep: string;
  lose: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** 放弃副本二次确认。小关首通已经入账；章节奖要下次从头打完。 */
export const ABANDON_RUN_CONFIRM: AbandonConfirmCopy = {
  title: '放弃副本？',
  keep: '已打通的小关卡，首次奖励已经发放，不会收回。',
  lose: '章节通关奖励要下次进入本章后，从头打完才能拿。局内金币和纹章会清空。',
  confirmLabel: '确认放弃',
  cancelLabel: '再想想',
};

/** 冒险页另开一章：先放弃正在打的那章。比战败页那份短，只说后果。 */
export function switchAdventureConfirm(runName: string): AbandonConfirmCopy {
  const name = runName.trim() || '当前章节';
  return {
    title: `放弃进行中的${name}？`,
    keep: '已拿的小关奖励保留。',
    lose: '局内金币和纹章会清空。',
    confirmLabel: '放弃并开始',
    cancelLabel: '取消',
  };
}

export function formatAbandonConfirmBody(copy: AbandonConfirmCopy): string {
  return `${copy.keep}\n\n${copy.lose}`;
}

export interface DefeatOverlayOpts {
  screenW: number;
  screenH: number;
  subtitle: string;
  hints?: DefeatHint[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** 有这份文案时，点放弃先弹确认，确认才走 onSecondary */
  abandonConfirm?: AbandonConfirmCopy;
}

/** 稀有度 → 卡框色。史诗要一眼比另外两档扎眼，否则三选一没有轻重 */
const RARITY_COLOR: Record<SkillModRarity, number> = {
  common: 0x8ca0b4,
  rare: 0x4a9ad8,
  epic: 0xb45ae0,
};

const RARITY_LABEL: Record<SkillModRarity, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
};

export function resolveLootConfirm(
  selected: number | null,
): { ok: true; index: number } | { ok: false; reason: 'need-pick' } {
  if (selected === null) return { ok: false, reason: 'need-pick' };
  return { ok: true, index: selected };
}

/** 米白圆角面板 */
function panelBg(w: number, h: number, radius = 14): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.lineStyle(3, C.ink, 1);
  g.beginFill(C.paper, 0.97);
  g.drawRoundedRect(0, 0, w, h, radius);
  g.endFill();
  return g;
}

function placeBanner(
  root: PIXI.Container,
  cx: number,
  y: number,
  text: string,
  width: number,
): { banner: PIXI.Container; height: number } {
  const banner = createTitleBanner(text, width);
  const height = banner.height;
  banner.pivot.x = width / 2;
  banner.x = cx;
  root.addChild(banner);
  dropBanner(banner, y);
  confettiBurst(root, cx, y + 20, 26);
  return { banner, height };
}

function makeWhoToken(rosterId: string, size: number): PIXI.Container {
  const def = getCharacterDef(rosterId);
  return createUnitToken(
    characterArtKey({ rosterId, profession: def?.profession ?? 'sword' }),
    'player',
    size,
  );
}

/**
 * 物品详情弹窗。奖励格本身只放图标，说明藏在点击之后。
 * 点卡片外面的遮罩关闭；卡片自己吃掉点击，避免点到内容也关掉。
 */
function createItemDetail(
  screenW: number,
  screenH: number,
  entry: RewardEntry,
  onClose: () => void,
): PIXI.Container {
  const layer = new PIXI.Container();
  layer.eventMode = 'static';
  layer.hitArea = new PIXI.Rectangle(0, 0, screenW, screenH);

  const scrim = createScrim(screenW, screenH, 0.7);
  const close = (): void => onClose();
  scrim.on('pointertap', close);
  layer.on('pointertap', (ev) => {
    if (ev.target === layer || ev.target === scrim) close();
  });
  layer.addChild(scrim);

  const w = Math.min(300, screenW - 48);
  const portraitSize = entry.whoRosterId ? 56 : 0;
  const headerH = entry.whoRosterId ? 88 : 74;
  const bodyPad = 12;

  const descTx = makeText(entry.desc, 'body', {
    fill: C.text,
    wordWrap: true,
    wordWrapWidth: w - bodyPad * 4,
    lineHeight: 18,
  });
  const rowH = 30;
  const bodyH = 26 + descTx.height + 14 + (entry.sources.length > 0 ? 26 + entry.sources.length * (rowH + 6) : 0);
  const h = headerH + bodyH + bodyPad;
  const x = (screenW - w) / 2;
  const y = Math.max(40, (screenH - h) / 2 - 30);

  const card = new PIXI.Container();
  card.x = x;
  card.y = y;
  card.eventMode = 'static';
  card.hitArea = new PIXI.Rectangle(0, 0, w, h);
  card.on('pointertap', (ev) => ev.stopPropagation());
  card.addChild(panelBg(w, h));

  const header = new PIXI.Graphics();
  header.beginFill(entry.tint, 0.95);
  header.drawRoundedRect(0, 0, w, headerH, 14);
  header.drawRect(0, headerH - 14, w, 14);
  header.endFill();
  card.addChild(header);

  const textRight = portraitSize > 0 ? w - portraitSize - 20 : w - 12;
  const nameTx = makeText(entry.name, 'uiStrong', {
    fill: C.textOnDark, fontSize: 15,
    wordWrap: true,
    wordWrapWidth: textRight - 12,
  });
  nameTx.x = 12;
  nameTx.y = 8;
  card.addChild(nameTx);

  const icon = createUiIcon(entry.iconKey, 36);
  if (icon) {
    icon.x = 14;
    icon.y = headerH - 44;
    card.addChild(icon);
  }
  const subLine = entry.badge
    ? (entry.quality ? `${entry.badge} · ${entry.quality}` : entry.badge)
    : `品质：${entry.quality}`;
  const qTx = makeText(subLine, 'uiStrong', {
    fill: C.textOnDark, fontSize: 12,
  });
  qTx.x = 58;
  qTx.y = headerH - 40;
  card.addChild(qTx);
  if (entry.amount > 1) {
    const amtTx = makeText(`本次获得：${entry.amount}`, 'caption', { fill: 0xffe8c0 });
    amtTx.x = 58;
    amtTx.y = headerH - 22;
    card.addChild(amtTx);
  }

  if (entry.whoRosterId) {
    const token = makeWhoToken(entry.whoRosterId, portraitSize);
    token.x = w - 16 - portraitSize / 2;
    token.y = headerH / 2 + 2;
    card.addChild(token);
  }

  let by = headerH + 10;
  const sect = (label: string): void => {
    const lb = new PIXI.Graphics();
    lb.beginFill(0xd8e8f4, 1);
    lb.drawRoundedRect(bodyPad, by, w - bodyPad * 2, 20, 5);
    lb.endFill();
    card.addChild(lb);
    const t = makeText(label, 'caption', { fill: 0x3a5a78, fontWeight: 'bold' });
    t.x = bodyPad + 8;
    t.y = by + 4;
    card.addChild(t);
    by += 26;
  };

  sect('道具说明');
  descTx.x = bodyPad + 8;
  descTx.y = by;
  card.addChild(descTx);
  by += descTx.height + 12;

  if (entry.sources.length > 0) {
    sect('获取途径');
    for (const s of entry.sources) {
      const row = new PIXI.Graphics();
      row.beginFill(C.primary, 0.9);
      row.drawRoundedRect(bodyPad, by, w - bodyPad * 2, rowH, 6);
      row.endFill();
      card.addChild(row);
      const t = makeText(s, 'uiStrong', { fill: 0x4a3a12, fontSize: 12 });
      t.x = bodyPad + 10;
      t.y = by + (rowH - 15) / 2;
      card.addChild(t);
      by += rowH + 6;
    }
  }

  layer.addChild(card);

  const hint = makeText('点击空白处关闭', 'caption', {
    fill: 0xd8d8c8,
  });
  hint.anchor.set(0.5, 0);
  hint.x = screenW / 2;
  hint.y = y + h + 10;
  hint.eventMode = 'none';
  layer.addChild(hint);

  return layer;
}

function makeSummaryChip(iconKey: string, label: string, tint: number): PIXI.Container {
  const c = new PIXI.Container();
  const icon = createUiIcon(iconKey, 18);
  const tx = makeText(label, 'uiStrong', { fill: tint, fontSize: 13 });
  const pad = 8;
  const iconW = icon ? 20 : 0;
  const w = pad * 2 + iconW + tx.width;
  const h = 26;
  const bg = new PIXI.Graphics();
  bg.beginFill(0x000000, 0.38);
  bg.drawRoundedRect(0, 0, w, h, 13);
  bg.endFill();
  c.addChild(bg);
  if (icon) {
    icon.x = pad;
    icon.y = (h - 18) / 2;
    c.addChild(icon);
  }
  tx.x = pad + iconW;
  tx.y = (h - tx.height) / 2;
  c.addChild(tx);
  return c;
}

function makeClearStarIcon(filled: boolean, size: number): PIXI.Container {
  const icon = createUiIcon(filled ? 'chapter_star_on' : 'chapter_star_off', size);
  if (icon) {
    const sprite = icon.getChildAt(0);
    if (sprite instanceof PIXI.Sprite && filled) sprite.tint = C.primary;
    return icon;
  }
  const g = new PIXI.Graphics();
  g.beginFill(filled ? C.primary : 0x5a5044, 1);
  g.drawCircle(size / 2, size / 2, size / 2);
  g.endFill();
  const c = new PIXI.Container();
  c.addChild(g);
  return c;
}

function fillClearStarSlot(slot: PIXI.Container, filled: boolean, size: number): void {
  slot.removeChildren();
  slot.addChild(makeClearStarIcon(filled, size));
}

/** 通关条件一行：对勾 + 文案，出现后留着，不覆盖上一条 */
function makeStarCondRow(label: string): PIXI.Container {
  const row = new PIXI.Container();
  const tx = makeText(label, 'body', { fill: 0xffe08a, fontSize: 13 });
  const check = drawCheck(6, 0xb8f08a);
  const gap = 8;
  const w = 12 + gap + tx.width;
  check.x = -w / 2 + 6;
  check.y = tx.height * 0.55;
  tx.x = check.x + 10;
  tx.y = 0;
  row.addChild(check);
  row.addChild(tx);
  return row;
}

/** 方框底下的细标签：米白底、墨线、暖字，不压在图标上 */
function addRewardCaption(parent: PIXI.Container, text: string, cx: number, y: number): number {
  const tx = makeText(text, 'caption', {
    fill: 0x8a5a18,
    fontSize: 10,
    fontWeight: 'bold',
  });
  const padX = 6;
  const w = tx.width + padX * 2;
  const h = 16;
  const bg = new PIXI.Graphics();
  bg.lineStyle(1.4, C.ink, 0.55);
  bg.beginFill(0xfff6e4, 1);
  bg.drawRoundedRect(-w / 2, 0, w, h, 8);
  bg.endFill();
  bg.x = cx;
  bg.y = y;
  tx.anchor.set(0.5, 0.5);
  tx.x = cx;
  tx.y = y + h / 2;
  parent.addChild(bg);
  parent.addChild(tx);
  return h;
}

function rewardCaptionH(entry: RewardEntry): number {
  let h = 6;
  if (entry.badge) h += 18;
  else if (entry.amount > 0) h += 16;
  if (entry.whoRosterId) h += 22;
  return h;
}

/** 结算奖励屏：横幅落下 +（通关时三星逐条点亮）+ 奖励格弹出 + 确定 */
export function createRewardOverlay(opts: RewardOverlayOpts): PIXI.Container {
  const { screenW: W, screenH: H } = opts;
  const root = new PIXI.Container();
  if (opts.fanfare !== false) AudioManager.playSfx('sfx_victory');
  if (opts.entries.some((e) => e.iconKey === 'icon_soul' && e.amount > 0)) {
    AudioManager.playSfx('sfx_soul_gain');
  }
  root.addChild(fadeScrim(W, H));

  const cx = W / 2;
  const bannerW = Math.min(300, W - 40);
  const bannerY = Math.max(36, H * 0.1);
  const { height: bannerH } = placeBanner(root, cx, bannerY, opts.title, bannerW);

  const stars = opts.stars ?? [];
  const starSize = 28;
  const starGap = 8;
  const starRowW = stars.length * starSize + Math.max(0, stars.length - 1) * starGap;
  const starRowY = bannerY + Math.max(bannerH, 60) + 6;
  const starSlots: PIXI.Container[] = [];
  const condLineH = 20;
  const metBeats = stars
    .map((beat, i) => ({ beat, index: i }))
    .filter((x) => x.beat.state !== 'miss');
  const condList = new PIXI.Container();
  condList.x = cx;
  condList.y = starRowY + (stars.length > 0 ? starSize + 8 : 0);
  root.addChild(condList);
  const condRows: PIXI.Container[] = [];
  metBeats.forEach((item, rowI) => {
    const row = makeStarCondRow(item.beat.label);
    row.y = rowI * condLineH;
    row.alpha = item.beat.state === 'held' ? 1 : 0;
    condList.addChild(row);
    condRows.push(row);
  });

  for (let i = 0; i < stars.length; i++) {
    const beat = stars[i]!;
    const slot = new PIXI.Container();
    slot.x = cx - starRowW / 2 + i * (starSize + starGap) + starSize / 2;
    slot.y = starRowY + starSize / 2;
    slot.pivot.set(starSize / 2, starSize / 2);
    fillClearStarSlot(slot, beat.state === 'held', starSize);
    if (beat.state !== 'held') slot.alpha = 0.42;
    root.addChild(slot);
    starSlots.push(slot);
  }

  const sub = makeText(opts.subtitle, 'body', { fill: 0xe8e8d8 });
  sub.anchor.set(0.5, 0);
  sub.x = cx;
  sub.y = condList.y + (metBeats.length > 0 ? metBeats.length * condLineH + 6 : 4);
  root.addChild(sub);

  const entries = opts.entries.filter((e) => e.amount > 0);
  const cellSize = 72;
  const gap = 20;
  const n = entries.length;
  const captionH = entries.reduce((h, e) => Math.max(h, rewardCaptionH(e)), 0);
  const gridW = n * cellSize + Math.max(0, n - 1) * gap;
  const gridY = sub.y + 24;
  const cells: PIXI.Container[] = [];
  let soulFrom: { x: number; y: number } | null = null;
  let soulAmount = 0;

  let detail: PIXI.Container | null = null;
  const closeDetail = (): void => {
    if (!detail) return;
    root.removeChild(detail);
    detail.destroy({ children: true });
    detail = null;
  };
  const openDetail = (e: RewardEntry): void => {
    closeDetail();
    detail = createItemDetail(W, H, e, closeDetail);
    root.addChild(detail);
  };

  entries.forEach((e, i) => {
    const cell = new PIXI.Container();
    const x = cx - gridW / 2 + i * (cellSize + gap);
    cell.x = x + cellSize / 2;
    cell.y = gridY + cellSize / 2;
    cell.pivot.set(cellSize / 2, cellSize / 2);

    const bg = new PIXI.Graphics();
    bg.lineStyle(2.5, C.ink, 1);
    bg.beginFill(C.paper, 0.96);
    bg.drawRoundedRect(0, 0, cellSize, cellSize, 10);
    bg.endFill();
    cell.addChild(bg);

    const iconPad = 6;
    const icon = createUiIcon(e.iconKey, cellSize - iconPad * 2);
    if (icon) {
      icon.x = iconPad;
      icon.y = iconPad;
      cell.addChild(icon);
    }

    let cy = cellSize + 4;
    if (e.badge) {
      cy += addRewardCaption(cell, e.badge, cellSize / 2, cy) + 2;
    } else {
      const amt = makeText(`+${e.amount}`, 'uiStrong', { fill: e.tint });
      amt.anchor.set(0.5, 0);
      amt.x = cellSize / 2;
      amt.y = cy;
      cell.addChild(amt);
      cy += amt.height + 2;
    }
    if (e.whoRosterId) {
      const face = makeWhoToken(e.whoRosterId, 20);
      const whoName = getCharacterDef(e.whoRosterId)?.name ?? '';
      const nameTx = makeText(whoName, 'caption', { fill: 0xf0e6c8, fontSize: 11 });
      const rowW = 22 + (whoName ? nameTx.width + 4 : 0);
      face.x = cellSize / 2 - rowW / 2 + 10;
      face.y = cy + 10;
      cell.addChild(face);
      if (whoName) {
        nameTx.x = face.x + 12;
        nameTx.y = cy + (20 - nameTx.height) / 2;
        cell.addChild(nameTx);
      }
    }

    cell.eventMode = 'static';
    cell.cursor = 'pointer';
    cell.hitArea = new PIXI.Rectangle(0, 0, cellSize, cellSize + captionH);
    cell.on('pointertap', () => openDetail(e));
    root.addChild(cell);
    cells.push(cell);
    if (e.iconKey === 'icon_soul') {
      soulFrom = { x: cell.x, y: cell.y };
      soulAmount = e.amount;
    }
  });

  let btnY = gridY;
  const extras: PIXI.Container[] = [];
  if (n > 0) {
    const tapHint = makeText('点击奖励查看说明', 'caption', { fill: 0xb8b8a8, fontSize: 10 });
    tapHint.anchor.set(0.5, 0);
    tapHint.x = cx;
    tapHint.y = gridY + cellSize + captionH + 6;
    root.addChild(tapHint);
    extras.push(tapHint);
    btnY = tapHint.y + 28;
  }

  const btnW = Math.min(220, W - 80);
  let confirmed = false;
  const btn = makeButton(opts.confirmLabel, () => {
    if (confirmed) return;
    confirmed = true;
    btn.setDisabled(true);
    const go = (): void => opts.onConfirm();
    if (soulFrom) {
      const to = opts.soulFlyTo ?? { x: 28, y: 28 };
      if (opts.soulFlyBurst) {
        void flySoulBurstTo(root, soulFrom, to, soulAmount).then(go);
      } else {
        void flyTokenTo(root, 'icon_soul', soulFrom, to).then(go);
      }
      return;
    }
    go();
  }, {
    variant: 'primary', width: btnW, height: 48, fontSize: 17, radius: 14,
  });
  btn.x = cx - btnW / 2;
  btn.y = btnY;
  root.addChild(btn);
  extras.push(btn);

  const live = (): boolean => !root.destroyed;
  const fresh = metBeats
    .map((item, rowI) => ({
      beat: item.beat,
      slot: starSlots[item.index]!,
      row: condRows[rowI]!,
    }))
    .filter((x) => x.beat.state === 'fresh');

  const revealRewards = (): void => {
    if (!live()) return;
    staggerPop(cells, 80);
    for (const node of extras) {
      node.alpha = 1;
      node.visible = true;
    }
  };

  if (fresh.length === 0) {
    staggerPop(cells, 80);
  } else {
    for (const cell of cells) cell.alpha = 0;
    for (const node of extras) node.alpha = 0;
    void (async () => {
      await awaitDelay(340);
      if (!live()) return;
      for (const { slot, row } of fresh) {
        if (!live()) return;
        await awaitEase(220, (t) => {
          if (live()) row.alpha = t;
        }, { live });
        if (!live()) return;
        fillClearStarSlot(slot, true, starSize);
        slot.alpha = 1;
        slot.scale.set(0.7);
        await awaitEase(260, (t) => {
          if (!live()) return;
          const s = t < 0.7 ? 0.7 + 0.5 * (t / 0.7) : 1.2 - 0.2 * ((t - 0.7) / 0.3);
          slot.scale.set(s);
        }, { live });
        if (!live()) return;
        slot.scale.set(1);
        confettiBurst(root, slot.x, slot.y, 10);
        await awaitDelay(180);
      }
      revealRewards();
    })();
  }

  return root;
}

/**
 * 单张强化卡的卡面。自上而下：稀有度色条 → 头像 + 角色名 → 技能大图标 → 技能名
 * → 词条名（带类型小标签）→ 效果说明。
 */
function buildLootCard(card: LootCard, cardW: number, cardH: number): PIXI.Container {
  const cc = new PIXI.Container();
  const accent = RARITY_COLOR[card.rarity];

  const bg = new PIXI.Graphics();
  bg.lineStyle(3, accent, 1);
  bg.beginFill(C.paper, 0.97);
  bg.drawRoundedRect(0, 0, cardW, cardH, 12);
  bg.endFill();
  cc.addChild(bg);

  const strip = new PIXI.Graphics();
  strip.beginFill(accent, 1);
  strip.drawRoundedRect(0, 0, cardW, 22, 12);
  strip.drawRect(0, 11, cardW, 11);
  strip.endFill();
  cc.addChild(strip);
  const rarLabel = card.exclusive ? `专属纹章 · ${RARITY_LABEL[card.rarity]}` : RARITY_LABEL[card.rarity];
  const rar = makeText(rarLabel, 'caption', {
    fill: C.textOnDark, fontSize: 10, fontWeight: 'bold',
  });
  rar.anchor.set(0.5);
  rar.x = cardW / 2;
  rar.y = 11;
  cc.addChild(rar);

  let y = 22;

  if (card.portrait) {
    const bandH = 44;
    const band = new PIXI.Graphics();
    band.beginFill(accent, 0.16);
    band.drawRect(0, y, cardW, bandH);
    band.endFill();
    cc.addChild(band);
    card.portrait.x = cardW / 2;
    card.portrait.y = y + bandH / 2 - 3;
    cc.addChild(card.portrait);
    y += bandH;
  }

  const whoTx = makeText(card.who, 'uiStrong', {
    fill: C.text, fontSize: 12,
  });
  whoTx.anchor.set(0.5, 0);
  whoTx.x = cardW / 2;
  whoTx.y = y + 3;
  cc.addChild(whoTx);
  y += whoTx.height + 7;

  const discR = 27;
  const discCy = y + discR;
  const disc = new PIXI.Graphics();
  disc.lineStyle(2.5, C.ink, 1);
  disc.beginFill(0xffffff, 0.9);
  disc.drawCircle(cardW / 2, discCy, discR);
  disc.endFill();
  cc.addChild(disc);
  const icon = createUiIcon(card.iconKey, 40);
  if (icon) {
    icon.x = cardW / 2 - icon.width / 2;
    icon.y = discCy - icon.height / 2;
    cc.addChild(icon);
  }
  y = discCy + discR + 4;

  const skillTx = makeText(card.skillName, 'caption', {
    fill: 0x6a6a5a,
  });
  skillTx.anchor.set(0.5, 0);
  skillTx.x = cardW / 2;
  skillTx.y = y;
  cc.addChild(skillTx);
  y += skillTx.height + 3;

  const modTx = makeText(card.modName, 'uiStrong', {
    fill: accent, fontSize: 13,
  });
  const tagFits = modTx.width + 16 + 3 <= cardW - 10;
  const tag = card.modIconKey && tagFits ? createUiIcon(card.modIconKey, 16) : null;
  const rowW = modTx.width + (tag ? 16 + 3 : 0);
  let rx = (cardW - rowW) / 2;
  if (tag) {
    tag.x = rx;
    tag.y = y + 1;
    cc.addChild(tag);
    rx += 16 + 3;
  }
  modTx.x = rx;
  modTx.y = y;
  cc.addChild(modTx);
  y += modTx.height + (card.stars ? 1 : 4);

  if (card.stars) {
    const starTx = makeText(card.stars, 'caption', {
      fill: 0xc9a227, fontSize: 11, fontWeight: 'bold',
    });
    starTx.anchor.set(0.5, 0);
    starTx.x = cardW / 2;
    starTx.y = y;
    cc.addChild(starTx);
    y += starTx.height + 3;
  }

  // 中文无空格：必须 breakWords，否则整句当一个词撑破卡宽。
  // 居中锚点 + wordWrap 在 Pixi 里会把本地原点算偏，改左对齐再在卡内居中。
  const descPad = 8;
  const wrapW = Math.max(40, cardW - descPad * 2);
  const maxDescH = Math.max(20, cardH - y - descPad);
  const descStyle = (fontSize: number, lineHeight: number) => ({
    fill: 0x5a6a3a,
    fontSize,
    wordWrap: true,
    wordWrapWidth: wrapW,
    breakWords: true,
    align: 'center' as const,
    lineHeight,
  });
  let descTx = makeText(card.desc, 'body', descStyle(11, 15));
  if (descTx.height > maxDescH) {
    descTx.destroy();
    descTx = makeText(card.desc, 'body', descStyle(9, 12));
  }
  descTx.x = descPad + Math.max(0, (wrapW - descTx.width) / 2);
  descTx.y = y;
  cc.addChild(descTx);

  const clip = new PIXI.Graphics();
  clip.beginFill(0xffffff);
  clip.drawRoundedRect(0, 0, cardW, cardH, 12);
  clip.endFill();
  clip.renderable = false;
  cc.addChild(clip);
  cc.mask = clip;

  return cc;
}

function setConfirmLook(btn: PIXI.Container, ready: boolean): void {
  btn.alpha = ready ? 1 : 0.45;
}

/** 中途胜利 + 三选一：横幅、入账条、点选高亮、确认才提交 */
export function createLootOverlay(opts: LootOverlayOpts): PIXI.Container {
  const { screenW: W, screenH: H } = opts;
  const root = new PIXI.Container();
  AudioManager.playSfx('sfx_victory');
  if ((opts.summary?.soul ?? 0) > 0) AudioManager.playSfx('sfx_soul_gain');
  root.addChild(fadeScrim(W, H));

  const cx = W / 2;
  const bannerW = Math.min(280, W - 48);
  const bannerY = Math.max(18, H * 0.05);
  const { height: bannerH } = placeBanner(root, cx, bannerY, '胜  利', bannerW);

  const summaryBits: PIXI.Container[] = [];
  const s = opts.summary;
  if (s && (s.gold > 0 || s.soul > 0)) {
    if (s.gold > 0) summaryBits.push(makeSummaryChip('icon_gold', `+${s.gold} 金币`, C.gold));
    if (s.soul > 0) summaryBits.push(makeSummaryChip('icon_soul', `+${s.soul} 魂晶`, C.soulText));
  }
  const summaryY = bannerY + Math.max(bannerH, 56) + 4;
  if (summaryBits.length > 0) {
    const gap = 10;
    const total = summaryBits.reduce((w, c) => w + c.width, 0) + gap * (summaryBits.length - 1);
    let x = cx - total / 2;
    for (const chip of summaryBits) {
      chip.x = x;
      chip.y = summaryY;
      root.addChild(chip);
      x += chip.width + gap;
    }
    staggerPop(summaryBits, 50);
  }

  const pickHint = makeText('请 选 择 纹 章', 'title', {
    fill: C.primary, fontSize: 16,
    stroke: 0x2a2010, strokeThickness: 4,
  });
  pickHint.anchor.set(0.5, 0);
  pickHint.x = cx;
  pickHint.y = summaryY + (summaryBits.length > 0 ? 32 : 8);

  const SELECT_SCALE = 1.08;
  const n = Math.max(1, opts.cards.length);
  const gap = 8;
  const cardW = Math.min(110, (W - 28 - (n - 1) * gap) / n);
  const cardH = Math.min(248, Math.max(210, H * 0.38));
  const totalW = n * cardW + (n - 1) * gap;
  // 选中 1.08、入场过冲 1.12 都从中心放大；再给 glow 外扩留空，避免盖住标题。
  const scaleHeadroom = Math.ceil(cardH * 0.06) + 10;
  const top = pickHint.y + pickHint.height + scaleHeadroom;

  let selected: number | null = null;
  const wraps: PIXI.Container[] = [];
  const glows: ReturnType<typeof attachGlowRing>[] = [];
  let confirmBtn: PIXI.Container | null = null;
  const cardLayer = new PIXI.Container();
  root.addChild(cardLayer);

  const applySelect = (index: number): void => {
    selected = index;
    wraps.forEach((w, i) => {
      const on = i === index;
      w.scale.set(on ? SELECT_SCALE : 1);
      glows[i]?.setActive(on);
      if (on) cardLayer.addChild(w);
    });
    if (confirmBtn) setConfirmLook(confirmBtn, true);
  };

  opts.cards.forEach((card, i) => {
    const wrap = new PIXI.Container();
    wrap.x = cx - totalW / 2 + i * (cardW + gap) + cardW / 2;
    wrap.y = top + cardH / 2;
    wrap.pivot.set(cardW / 2, cardH / 2);
    wrap.addChild(buildLootCard(card, cardW, cardH));
    wrap.eventMode = 'static';
    wrap.cursor = 'pointer';
    wrap.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);
    wrap.on('pointertap', () => applySelect(i));
    cardLayer.addChild(wrap);
    wraps.push(wrap);
    glows.push(attachGlowRing(wrap, cardW, cardH));
  });
  staggerPop(wraps, 80);
  // 标题始终画在卡层之上，选中放大也不会盖住「请选择纹章」。
  root.addChild(pickHint);

  const btnW = Math.min(220, W - 80);
  let lootConfirmed = false;
  const confirm = makeButton('确认选择', () => {
    if (lootConfirmed) return;
    const resolved = resolveLootConfirm(selected);
    if (!resolved.ok) {
      opts.onNeedPick?.();
      return;
    }
    lootConfirmed = true;
    confirm.setDisabled(true);
    const soulChip = summaryBits.find((_, i) => (s?.soul ?? 0) > 0 && (s?.gold ?? 0) > 0 ? i === 1 : (s?.soul ?? 0) > 0);
    const from = soulChip
      ? { x: soulChip.x + soulChip.width / 2, y: soulChip.y + 13 }
      : null;
    const go = (): void => opts.onConfirm(resolved.index);
    if (from && (s?.soul ?? 0) > 0) {
      void flyTokenTo(root, 'icon_soul', from, { x: 28, y: 28 }).then(go);
      return;
    }
    go();
  }, {
    variant: 'primary', width: btnW, height: 44, fontSize: 16, radius: 14,
  });
  confirm.x = cx - btnW / 2;
  confirm.y = top + cardH + scaleHeadroom + 8;
  confirmBtn = confirm;
  setConfirmLook(confirm, false);
  root.addChild(confirm);

  let nextY = confirm.y + 52;
  if (opts.onRefresh) {
    const subW = Math.min(220, W - 80);
    const refresh = makeAdButton('刷新选项', opts.onRefresh, {
      width: subW, height: 40, fontSize: 14, radius: 12,
    });
    refresh.x = cx - subW / 2;
    refresh.y = nextY;
    root.addChild(refresh);
    nextY += 48;
  }

  const subW = Math.min(220, W - 80);
  const skip = makeButton('都不要，继续前进', opts.onSkip, {
    variant: 'secondary', width: subW, height: 40, fontSize: 14, radius: 12,
  });
  skip.x = cx - subW / 2;
  skip.y = nextY;
  root.addChild(skip);

  return root;
}

export interface AdReviveChoice {
  uid: string;
  name: string;
}

export interface AdReviveOverlayOpts {
  screenW: number;
  screenH: number;
  units: AdReviveChoice[];
  onPick: (uid: string) => void;
  onSkip: () => void;
}

/** 看广告复活：点谁就救谁 */
export function createAdReviveOverlay(opts: AdReviveOverlayOpts): PIXI.Container {
  const { screenW: W, screenH: H } = opts;
  const root = new PIXI.Container();
  root.addChild(fadeScrim(W, H));

  const panelW = Math.min(300, W - 36);
  const rowH = 44;
  const titleH = 52;
  const skipH = 40;
  const pad = 14;
  const listH = opts.units.length * (rowH + 8) - 8;
  const panelH = titleH + listH + skipH + pad * 2 + 12;
  const panel = makePanel({
    width: panelW,
    height: panelH,
    light: true,
  });
  panel.x = (W - panelW) / 2;
  panel.y = Math.max(24, (H - panelH) / 2);
  root.addChild(panel);

  const title = makeText('看广告复活一名队员', 'uiStrong', { fill: C.text, fontSize: 16 });
  title.anchor.set(0.5, 0);
  title.x = panelW / 2;
  title.y = 14;
  panel.addChild(title);

  let y = titleH;
  for (const u of opts.units) {
    const btn = makeButton(u.name, () => opts.onPick(u.uid), {
      variant: 'primary', width: panelW - pad * 2, height: rowH, fontSize: 15,
    });
    btn.x = pad;
    btn.y = y;
    panel.addChild(btn);
    y += rowH + 8;
  }

  const skip = makeButton('不复活', opts.onSkip, {
    variant: 'ghost', width: panelW - pad * 2, height: skipH, fontSize: 14,
  });
  skip.x = pad;
  skip.y = y + 4;
  panel.addChild(skip);
  return root;
}

const DEFEAT_BANNER = 0x8a3a3a;
const HINT_ROW_H = 50;
const HINT_ICON = 32;

function createDefeatBanner(width: number, height: number): PIXI.Container {
  const bar = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(C.paper, 1);
  g.drawRoundedRect(-2, -2, width + 4, height + 4, 14);
  g.endFill();
  g.lineStyle(2.5, C.ink, 1);
  g.beginFill(shade(DEFEAT_BANNER, 0.72), 1);
  g.drawRoundedRect(0, 0, width, height, 12);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(DEFEAT_BANNER, 1);
  g.drawRoundedRect(2, 2, width - 4, height - 6, 10);
  g.endFill();
  bar.addChild(g);
  const title = makeText('失  败', 'display', {
    fill: 0xfff4d8,
    fontSize: 28,
    stroke: 0x4a1818,
    strokeThickness: 4,
  });
  title.anchor.set(0.5);
  title.x = width / 2;
  title.y = height / 2 - 1;
  bar.addChild(title);
  return bar;
}

function buildHintRow(hint: DefeatHint, width: number): PIXI.Container {
  const row = new PIXI.Container();
  const well = new PIXI.Graphics();
  well.beginFill(0xf0ebe0, 1);
  well.drawRoundedRect(0, (HINT_ROW_H - 40) / 2, 40, 40, 10);
  well.endFill();
  row.addChild(well);
  const icon = createUiIcon(hint.iconKey, HINT_ICON);
  if (icon) {
    icon.x = (40 - icon.width) / 2;
    icon.y = (HINT_ROW_H - icon.height) / 2;
    row.addChild(icon);
  }
  const title = makeText(hint.title, 'uiStrong', { fill: C.text, fontSize: 13 });
  title.x = 48;
  title.y = 8;
  row.addChild(title);
  const desc = makeText(hint.desc, 'caption', {
    fill: C.muted,
    wordWrap: true,
    wordWrapWidth: width - 52,
    breakWords: true,
  });
  desc.x = 48;
  desc.y = 26;
  row.addChild(desc);
  return row;
}

function buildDefeatCard(
  lead: string,
  hints: DefeatHint[],
  width: number,
): { card: PIXI.Container; height: number } {
  const pad = 14;
  const innerW = width - pad * 2;
  const leadTx = makeText(lead, 'body', {
    fill: C.text,
    fontSize: 13,
    wordWrap: true,
    wordWrapWidth: innerW,
    breakWords: true,
    lineHeight: 18,
  });
  const head = makeText(hints.length > 0 ? '还可以这样变强' : '', 'caption', {
    fill: C.muted, fontWeight: 'bold',
  });
  const rowsH = hints.length * HINT_ROW_H;
  const headH = hints.length > 0 ? 18 : 0;
  const height = pad + leadTx.height + (hints.length > 0 ? 12 + headH + 4 + rowsH : 0) + pad;
  const card = new PIXI.Container();
  card.addChild(makePanel({ width, height, light: true, radius: 14 }));
  leadTx.x = pad;
  leadTx.y = pad;
  card.addChild(leadTx);
  let y = pad + leadTx.height + 10;
  if (hints.length > 0) {
    head.x = pad;
    head.y = y;
    card.addChild(head);
    y += headH + 4;
    hints.forEach((hint, i) => {
      if (i > 0) {
        const line = new PIXI.Graphics();
        line.lineStyle(1, C.ink, 0.08);
        line.moveTo(pad, y);
        line.lineTo(width - pad, y);
        card.addChild(line);
      }
      const row = buildHintRow(hint, innerW);
      row.x = pad;
      row.y = y;
      card.addChild(row);
      y += HINT_ROW_H;
    });
  }
  return { card, height };
}

export function attachAbandonConfirm(
  root: PIXI.Container,
  screenW: number,
  screenH: number,
  copy: AbandonConfirmCopy,
  onConfirm: () => void,
): void {
  if (root.getChildByName('abandonConfirm')) return;
  const layer = new PIXI.Container();
  layer.name = 'abandonConfirm';
  const scrim = createScrim(screenW, screenH, 0.55);
  layer.addChild(scrim);

  const w = Math.min(300, screenW - 48);
  const pad = 16;
  const title = makeText(copy.title, 'heading', { fill: C.text, fontSize: 17 });
  const body = makeText(formatAbandonConfirmBody(copy), 'body', {
    fill: C.text,
    fontSize: 13,
    wordWrap: true,
    wordWrapWidth: w - pad * 2,
    breakWords: true,
    lineHeight: 19,
  });
  const btnH = 42;
  const h = pad + title.height + 10 + body.height + 18 + 38 + 10 + btnH + pad;
  const panel = makePanel({ width: w, height: h, light: true, radius: 14 });
  panel.x = (screenW - w) / 2;
  panel.y = Math.max(36, (screenH - h) / 2 - 20);
  layer.addChild(panel);

  title.x = pad;
  title.y = pad;
  panel.addChild(title);
  body.x = pad;
  body.y = pad + title.height + 10;
  panel.addChild(body);

  const closeLayer = (): void => {
    if (layer.parent) layer.parent.removeChild(layer);
    if (!layer.destroyed) layer.destroy({ children: true });
  };
  scrim.on('pointertap', closeLayer);

  const btnW = w - pad * 2;
  let by = pad + title.height + 10 + body.height + 18;
  const cancel = makeButton(copy.cancelLabel, closeLayer, {
    variant: 'secondary', width: btnW, height: 38, fontSize: 14, radius: 12,
  });
  cancel.x = pad;
  cancel.y = by;
  panel.addChild(cancel);
  by += 38 + 10;
  const confirm = makeButton(copy.confirmLabel, () => {
    closeLayer();
    onConfirm();
  }, {
    variant: 'danger', width: btnW, height: btnH, fontSize: 15, radius: 12,
  });
  confirm.x = pad;
  confirm.y = by;
  panel.addChild(confirm);

  root.addChild(layer);
}

/** 战败：盖在棋盘上，不换页。失败不撒彩纸。 */
export function createDefeatOverlay(opts: DefeatOverlayOpts): PIXI.Container {
  const { screenW: W, screenH: H } = opts;
  const root = new PIXI.Container();
  AudioManager.playSfx('sfx_defeat');
  root.addChild(fadeScrim(W, H));

  const cx = W / 2;
  const cardW = Math.min(320, W - 40);
  const bannerW = Math.min(280, cardW);
  const bannerH = 56;
  const hints = opts.hints ?? [];
  const { card, height: cardH } = buildDefeatCard(opts.subtitle, hints, cardW);

  const btnH = 46;
  const hasSecondary = Boolean(opts.secondaryLabel && opts.onSecondary);
  const stackH = bannerH + 18 + cardH + 16 + btnH + (hasSecondary ? 10 + 40 : 0);
  const top = Math.max(36, Math.min(H * 0.12, (H - stackH) / 2 - 8));

  const bar = createDefeatBanner(bannerW, bannerH);
  bar.pivot.x = bannerW / 2;
  bar.x = cx;
  root.addChild(bar);
  dropBanner(bar, top);

  card.pivot.x = cardW / 2;
  card.x = cx;
  card.y = top + bannerH + 18;
  root.addChild(card);
  staggerPop([card], 40);

  const requestAbandon = (): void => {
    if (!opts.onSecondary) return;
    if (opts.abandonConfirm) {
      attachAbandonConfirm(root, W, H, opts.abandonConfirm, opts.onSecondary);
      return;
    }
    opts.onSecondary();
  };

  const primary = makeButton(opts.primaryLabel, opts.onPrimary, {
    variant: 'primary', width: cardW, height: btnH, fontSize: 16, radius: 12,
  });
  primary.x = cx - cardW / 2;
  primary.y = card.y + cardH + 16;
  root.addChild(primary);

  if (hasSecondary) {
    const secondary = makeButton(opts.secondaryLabel!, requestAbandon, {
      variant: 'danger', width: cardW, height: 40, fontSize: 15, radius: 12,
    });
    secondary.x = cx - cardW / 2;
    secondary.y = primary.y + btnH + 10;
    root.addChild(secondary);
  }

  return root;
}
