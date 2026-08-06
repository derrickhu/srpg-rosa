import * as PIXI from 'pixi.js';
import { C } from '@/view/mvpTheme';
import { makeButton } from '@/ui/Button';
import { createUiIcon } from '@/view/renderHelpers';
import { AssetManager } from '@/core/AssetManager';
import type { SkillModRarity } from '@/data/skillModCatalog';

/**
 * 战后结算弹层。
 *
 * 关键决定：**盖在战场上，不换场景。** 以前是 `replaceAll` 一个新页面，
 * 战场连同刚才那一击的残影一起消失，胜利感也跟着断掉——玩家从「我赢了这一场」
 * 被瞬间搬到一个陌生的列表页。压一层半透明遮罩则保留了「刚刚发生了什么」的上下文。
 *
 * 分两屏也是同一个道理：第一屏只回答「我赚了什么」（已经到手的固定奖励），
 * 第二屏只回答「我选什么」（要玩家做决定的强化）。挤在一屏时这两类东西
 * 长得一样，玩家分不清哪些已经入账、哪些还等着他点。
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
}

export interface RewardOverlayOpts {
  screenW: number;
  screenH: number;
  /** 横幅里的大字，如「胜 利」 */
  title: string;
  /** 横幅下方一行小字，如「草原关隘 3/8」 */
  subtitle: string;
  entries: RewardEntry[];
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * 结算第二屏的一张强化卡。
 *
 * 卡面要在一眼之内回答三个问题，顺序也是视觉权重的顺序：
 *
 *   **给谁**（顶部头像 + 名字）→ **哪一招**（正中大图标 + 技能名）→ **加什么**（词条名 + 说明）
 *
 * 早先只画了词条图标，结果三张卡看上去是「三个抽象符号」，玩家得读完两行小字
 * 才知道这次强化落在谁身上。词条图标本质是**类型标记**（伤害/冷却/中毒…），
 * 它回答的是最后一个问题，所以退到右下角当小标签。
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
  /** 叠到第几层，画在卡片底部的小圆里 */
  stacks: number;
  rarity: SkillModRarity;
}

export interface LootOverlayOpts {
  screenW: number;
  screenH: number;
  cards: LootCard[];
  onPick: (index: number) => void;
  onSkip: () => void;
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

/** 半透明遮罩：既压暗战场，又吃掉穿透到下层棋盘的点击 */
function createScrim(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.beginFill(0x000000, 0.72);
  g.drawRect(0, 0, w, h);
  g.endFill();
  g.eventMode = 'static';
  g.hitArea = new PIXI.Rectangle(0, 0, w, h);
  return g;
}

/**
 * 金色横幅贴图 + 代码画的标题字。
 *
 * 字不烧进贴图：一是文案要跟着「胜利 / 副本通关 / 失败」变，二是烧进去的字形
 * 和界面其余部分用的游戏字体对不上，凑在一起会很明显。
 *
 * **不要**走 `createUiIcon`：那个函数按正方形定尺寸并把图居中，横幅这种扁图会被
 * 上下垫出空白。标题若按「容器高度 × 0.62」算，落点会跑到皇冠上；副标题按
 * `banner.height` 往下排，又会叠回黄色面板里——截图里「胜利」在上、关卡名和奖励格
 * 啃进横幅，就是这么来的。
 */
function createTitleBanner(cx: number, y: number, text: string, width: number): PIXI.Container {
  const wrap = new PIXI.Container();
  let h = 60;
  if (AssetManager.isBundleLoaded('ui')) {
    const tex = AssetManager.texture('ui', 'banner_victory');
    if (tex && tex !== PIXI.Texture.WHITE) {
      const sp = new PIXI.Sprite(tex);
      // 按宽度等比缩放，高度跟着走，不再塞进正方形
      const s = width / tex.width;
      sp.width = width;
      sp.height = tex.height * s;
      sp.x = cx - width / 2;
      sp.y = y;
      wrap.addChild(sp);
      h = sp.height;
    }
  }
  const tx = new PIXI.Text(text, {
    fill: 0xfff4d8,
    fontSize: 30,
    fontWeight: 'bold',
    stroke: 0x7a4a10,
    strokeThickness: 5,
  });
  tx.anchor.set(0.5);
  tx.x = cx;
  // 贴图上方是皇冠+月桂，标题落在中间那块黄色面板的视觉中心
  tx.y = y + h * 0.58;
  wrap.addChild(tx);
  return wrap;
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

/**
 * 物品详情弹窗。参考的是成熟商业游戏的做法：奖励格本身只放图标和数量，
 * 说明藏在点击之后。结算屏要在两秒内让人看清「拿到了什么」，
 * 把每件东西的用途、来源都平铺出来反而谁也读不完。
 */
function createItemDetail(
  screenW: number,
  screenH: number,
  entry: RewardEntry,
  onClose: () => void,
): PIXI.Container {
  const layer = new PIXI.Container();
  const scrim = createScrim(screenW, screenH);
  scrim.alpha = 0.7;
  scrim.on('pointertap', onClose);
  layer.addChild(scrim);

  const w = Math.min(300, screenW - 48);
  const headerH = 74;
  const bodyPad = 12;

  const descTx = new PIXI.Text(entry.desc, {
    fill: C.text,
    fontSize: 12,
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
  card.addChild(panelBg(w, h));

  // 顶部色条：品质色在这里出现一次，玩家就知道这一格属于哪一类资源
  const header = new PIXI.Graphics();
  header.beginFill(entry.tint, 0.95);
  header.drawRoundedRect(0, 0, w, headerH, 14);
  header.drawRect(0, headerH - 14, w, 14);
  header.endFill();
  card.addChild(header);

  const nameTx = new PIXI.Text(entry.name, {
    fill: C.textOnDark, fontSize: 15, fontWeight: 'bold',
  });
  nameTx.x = 12;
  nameTx.y = 8;
  card.addChild(nameTx);

  const icon = createUiIcon(entry.iconKey, 38);
  if (icon) {
    icon.x = 14;
    icon.y = 30;
    card.addChild(icon);
  }
  const qTx = new PIXI.Text(`品质：${entry.quality}`, {
    fill: C.textOnDark, fontSize: 12, fontWeight: 'bold',
  });
  qTx.x = 62;
  qTx.y = 34;
  card.addChild(qTx);
  const amtTx = new PIXI.Text(`本次获得：${entry.amount}`, { fill: 0xffe8c0, fontSize: 11 });
  amtTx.x = 62;
  amtTx.y = 52;
  card.addChild(amtTx);

  let by = headerH + 10;
  const sect = (label: string): void => {
    const lb = new PIXI.Graphics();
    lb.beginFill(0xd8e8f4, 1);
    lb.drawRoundedRect(bodyPad, by, w - bodyPad * 2, 20, 5);
    lb.endFill();
    card.addChild(lb);
    const t = new PIXI.Text(label, { fill: 0x3a5a78, fontSize: 11, fontWeight: 'bold' });
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
      const t = new PIXI.Text(s, { fill: 0x4a3a12, fontSize: 12, fontWeight: 'bold' });
      t.x = bodyPad + 10;
      t.y = by + (rowH - 15) / 2;
      card.addChild(t);
      by += rowH + 6;
    }
  }

  layer.addChild(card);

  const hint = new PIXI.Text('点击空白处关闭', {
    fill: 0xd8d8c8, fontSize: 11,
  });
  hint.anchor.set(0.5, 0);
  hint.x = screenW / 2;
  hint.y = y + h + 10;
  layer.addChild(hint);

  return layer;
}

/** 结算第一屏：横幅 + 已到手的奖励格 + 确定 */
export function createRewardOverlay(opts: RewardOverlayOpts): PIXI.Container {
  const { screenW: W, screenH: H } = opts;
  const root = new PIXI.Container();
  root.addChild(createScrim(W, H));

  const cx = W / 2;
  const bannerW = Math.min(300, W - 40);
  const bannerY = Math.max(40, H * 0.12);
  const banner = createTitleBanner(cx, bannerY, opts.title, bannerW);
  root.addChild(banner);

  // 关卡名在横幅下方，不再挤进黄色面板——那块位置留给「胜利」
  const sub = new PIXI.Text(opts.subtitle, { fill: 0xe8e8d8, fontSize: 12 });
  sub.anchor.set(0.5, 0);
  sub.x = cx;
  sub.y = bannerY + banner.height + 10;
  root.addChild(sub);

  // 奖励格排成一行，和图标同宽同高。做成网格而不是逐行文字，是为了让「这一场
  // 拿到 N 样东西」在一瞥之间就成立——数格子比读三行字快。
  const cellSize = 62;
  const gap = 10;
  const n = opts.entries.length;
  const gridW = n * cellSize + Math.max(0, n - 1) * gap;
  const gridY = sub.y + 22;

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

  opts.entries.forEach((e, i) => {
    const cell = new PIXI.Container();
    cell.x = cx - gridW / 2 + i * (cellSize + gap);
    cell.y = gridY;

    const bg = new PIXI.Graphics();
    bg.lineStyle(2.5, C.ink, 1);
    bg.beginFill(C.paper, 0.96);
    bg.drawRoundedRect(0, 0, cellSize, cellSize, 10);
    bg.endFill();
    cell.addChild(bg);

    const icon = createUiIcon(e.iconKey, 34);
    if (icon) {
      icon.x = (cellSize - icon.width) / 2;
      icon.y = 8;
      cell.addChild(icon);
    }

    const amt = new PIXI.Text(`+${e.amount}`, {
      fill: e.tint, fontSize: 14, fontWeight: 'bold',
    });
    amt.anchor.set(0.5, 1);
    amt.x = cellSize / 2;
    amt.y = cellSize - 4;
    cell.addChild(amt);

    cell.eventMode = 'static';
    cell.cursor = 'pointer';
    cell.hitArea = new PIXI.Rectangle(0, 0, cellSize, cellSize);
    cell.on('pointertap', () => openDetail(e));
    root.addChild(cell);
  });

  const tapHint = new PIXI.Text('点击奖励查看说明', { fill: 0xb8b8a8, fontSize: 10 });
  tapHint.anchor.set(0.5, 0);
  tapHint.x = cx;
  tapHint.y = gridY + cellSize + 8;
  root.addChild(tapHint);

  const btnW = Math.min(220, W - 80);
  const btn = makeButton(opts.confirmLabel, opts.onConfirm, {
    variant: 'primary', width: btnW, height: 48, fontSize: 17, radius: 14,
  });
  btn.x = cx - btnW / 2;
  btn.y = tapHint.y + 28;
  root.addChild(btn);

  return root;
}

/**
 * 单张强化卡的卡面。自上而下：稀有度色条 → 头像 + 角色名 → 技能大图标 → 技能名
 * → 词条名（带类型小标签）→ 效果说明 → 层数圆。
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
  const rar = new PIXI.Text(RARITY_LABEL[card.rarity], {
    fill: C.textOnDark, fontSize: 10, fontWeight: 'bold',
  });
  rar.anchor.set(0.5);
  rar.x = cardW / 2;
  rar.y = 11;
  cc.addChild(rar);

  let y = 22;

  // 头像带在卡顶：三张卡并排时，玩家第一眼扫的是这一行，靠它分辨「这次轮到谁」
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

  const whoTx = new PIXI.Text(card.who, {
    fill: C.text, fontSize: 12, fontWeight: 'bold',
  });
  whoTx.anchor.set(0.5, 0);
  whoTx.x = cardW / 2;
  whoTx.y = y + 3;
  cc.addChild(whoTx);
  y += whoTx.height + 7;

  // 技能大图标坐在圆底上：卡面是米白的，图标直接贴会显得漂着
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

  const skillTx = new PIXI.Text(card.skillName, {
    fill: 0x6a6a5a, fontSize: 11,
  });
  skillTx.anchor.set(0.5, 0);
  skillTx.x = cardW / 2;
  skillTx.y = y;
  cc.addChild(skillTx);
  y += skillTx.height + 3;

  // 词条名 + 类型小标签并排居中。标签是"这属于哪一类强化"的速记，
  // 不承担辨识主责，所以只有 16px，摆在名字左边而不是单独占一行。
  const modTx = new PIXI.Text(card.modName, {
    fill: accent, fontSize: 13, fontWeight: 'bold',
  });
  // 卡宽是屏宽三等分，「势不可挡」这种四字词条加上标签就顶到边框了。
  // 挤不下时丢掉标签而不是缩字号：标签只是类型速记，名字才是玩家要读的。
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
  y += modTx.height + 4;

  const descTx = new PIXI.Text(card.desc, {
    fill: 0x5a6a3a, fontSize: 11,
    wordWrap: true, wordWrapWidth: cardW - 14, align: 'center', lineHeight: 15,
  });
  descTx.anchor.set(0.5, 0);
  descTx.x = cardW / 2;
  descTx.y = y;
  cc.addChild(descTx);

  // 层数小圆压在卡片下沿。没有它的话，同一个词条第二次出现和第一次长得一模一样。
  const badge = new PIXI.Graphics();
  badge.lineStyle(2.5, C.ink, 1);
  badge.beginFill(C.paper, 1);
  badge.drawCircle(cardW / 2, cardH, 13);
  badge.endFill();
  cc.addChild(badge);
  const bt = new PIXI.Text(String(card.stacks), {
    fill: accent, fontSize: 13, fontWeight: 'bold',
  });
  bt.anchor.set(0.5);
  bt.x = cardW / 2;
  bt.y = cardH;
  cc.addChild(bt);

  return cc;
}

/** 结算第二屏：三张强化卡竖着并排，点哪张选哪张 */
export function createLootOverlay(opts: LootOverlayOpts): PIXI.Container {
  const { screenW: W, screenH: H } = opts;
  const root = new PIXI.Container();
  root.addChild(createScrim(W, H));

  const cx = W / 2;
  const title = new PIXI.Text('请 选 择 强 化', {
    fill: C.primary, fontSize: 19, fontWeight: 'bold',
    stroke: 0x2a2010, strokeThickness: 4,
  });
  title.anchor.set(0.5, 0);
  title.x = cx;
  title.y = Math.max(52, H * 0.14);
  root.addChild(title);

  const n = Math.max(1, opts.cards.length);
  const gap = 8;
  const cardW = Math.min(116, (W - 28 - (n - 1) * gap) / n);
  const cardH = 258;
  const totalW = n * cardW + (n - 1) * gap;
  const top = title.y + 34;

  opts.cards.forEach((card, i) => {
    const cc = new PIXI.Container();
    cc.x = cx - totalW / 2 + i * (cardW + gap);
    cc.y = top;
    cc.addChild(buildLootCard(card, cardW, cardH));
    cc.eventMode = 'static';
    cc.cursor = 'pointer';
    cc.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH + 16);
    cc.on('pointertap', () => opts.onPick(i));
    root.addChild(cc);
  });

  const skipW = Math.min(200, W - 100);
  // 不能用 ghost：那一档是给米白面板调的（近透明底 + 深色字），压在这里的
  // 深色遮罩上字直接读不出来。见风格圣经 §6 对 ghost 适用范围的限定。
  const skip = makeButton('都不要，继续前进', opts.onSkip, {
    variant: 'secondary', width: skipW, height: 36, fontSize: 13,
  });
  skip.x = cx - skipW / 2;
  skip.y = top + cardH + 30;
  root.addChild(skip);

  return root;
}
