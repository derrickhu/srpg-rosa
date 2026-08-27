import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { DUNGEON_DEFS, getDungeonDef, type DungeonDef } from '@/data/dungeonCatalog';
import {
  adventureChapterList,
  isSandboxDungeon,
} from '@/data/sandboxLab';
import {
  DUNGEON_REPEAT_SOUL,
  canSweepChapter,
  chapterClearedForSweep,
  gmAddSoul,
  gmUnlockAllCharacters,
  isDungeonUnlocked,
  sweepLeftToday,
  sweepQuota,
  unlockDungeonWithMeta,
  type MetaState,
  type MvpGameState,
} from '@/game/MvpState';
import { AssetManager } from '@/core/AssetManager';
import {
  createBackground,
  createUiIcon,
  drawCheck,
  drawChevron,
} from '@/view/renderHelpers';
import { createHubHeader } from '@/view/hubHeader';
import { C, mix } from '@/view/mvpTheme';
import { isDisplayLive } from '@/view/pixiLive';
import { attachPress } from '@/ui/press';
import { makeButton } from '@/ui/Button';
import { showToast } from '@/ui/Toast';
import { AudioManager } from '@/core/AudioManager';
import { staggerPop } from '@/view/fx/celebration';

export interface AdventureCallbacks {
  onStartRun: (dungeonId: string, party: string[]) => void;
  /** 有进行中的 run 时点「继续冒险」 */
  onContinueRun: () => void;
  /** 整章扫荡（已通关） */
  onSweepChapter: (dungeonId: string) => void;
  /** meta 变更（解锁副本）后持久化并重绘 */
  onChanged: () => void;
  /** 记住章节页码，Tab 切换回来不丢 */
  onChapterChange: (index: number) => void;
}

export interface ChapterRewardModel {
  firstSoul: number;
  firstClaimed: boolean;
  repeatSoul: number;
  pendingNodeFirstClears: number;
}

/** 章节卡上的两行奖励：首通一次，重复通关可扫荡 */
export function chapterRewardModel(
  d: DungeonDef,
  meta: Pick<MetaState, 'clearedDungeonIds' | 'clearedNodesByDungeonId'>,
): ChapterRewardModel {
  const doneNodes = meta.clearedNodesByDungeonId[d.id] ?? 0;
  return {
    firstSoul: d.metaReward,
    firstClaimed: chapterClearedForSweep(meta, d.id),
    repeatSoul: DUNGEON_REPEAT_SOUL,
    pendingNodeFirstClears: d.nodes.filter((n, i) => n.kind !== 'shop' && i >= doneNodes).length,
  };
}

const RADIUS = 20;
/** 插图占卡片高度的比例，同时也是 DungeonDef.art 出图时的取景依据 */
const ART_RATIO = 0.38;
/** 星级占位、难度切换条的高度，后面真做评价/精英时不用再挤卡片 */
const STAR_ROW_H = 22;
const DIFF_ROW_H = 32;
const TILE = 40;
const SECTION_H = 18;
const REWARD_H = 86;
/** 分区条 / 奖励井：paper 混 secondary，比纯米白沉一档，仍是浅底 */
const WASH = mix(C.paper, C.secondary, 0.28);
const WELL = mix(C.paper, C.secondary, 0.16);
const SOUL_TILE = mix(C.paper, C.soul, 0.18);

/** 浅底色块。内部分区默认不描边；要线也只走 1px 发丝，避免套框发沉 */
function flatFill(
  w: number,
  h: number,
  radius: number,
  fill: number,
  strokeAlpha = 0,
): PIXI.Graphics {
  const g = new PIXI.Graphics();
  if (strokeAlpha > 0) g.lineStyle(1, C.ink, strokeAlpha, 0);
  g.beginFill(fill, 1);
  g.drawRoundedRect(0, 0, w, h, radius);
  g.endFill();
  return g;
}

function drawFlatStar(size: number, filled: boolean): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = size / 2;
  const inner = r * 0.4;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : inner;
    pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  g.lineStyle(1.5, C.paper, 0.75, 0);
  g.beginFill(filled ? C.paper : mix(C.panel, C.paper, 0.22), 1);
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.closePath();
  g.endFill();
  return g;
}

/** 星级占位：现在全空，后面接入评价时把 `filled` 改成实际星数 */
function buildStarRow(cx: number, y: number, filled: number): PIXI.Container {
  const row = new PIXI.Container();
  const n = 3;
  const gap = 22;
  for (let i = 0; i < n; i++) {
    const star = drawFlatStar(16, i < filled);
    star.x = cx + (i - (n - 1) / 2) * gap;
    star.y = y;
    row.addChild(star);
  }
  return row;
}

function makeSoulTile(amount: number, muted: boolean): PIXI.Container {
  const c = new PIXI.Container();
  c.addChild(flatFill(
    TILE,
    TILE,
    10,
    muted ? mix(C.paper, C.panel, 0.12) : SOUL_TILE,
    muted ? 0.18 : 0.28,
  ));
  const icon = createUiIcon('icon_soul', 22);
  if (icon) {
    icon.x = (TILE - 22) / 2;
    icon.y = 3;
    icon.alpha = muted ? 0.45 : 1;
    c.addChild(icon);
  }
  const qty = makeText(`x${amount}`, 'micro', { fill: muted ? C.muted : C.ink });
  qty.anchor.set(1, 1);
  qty.x = TILE - 4;
  qty.y = TILE - 3;
  c.addChild(qty);
  return c;
}

function buildRewardBlock(
  x: number,
  y: number,
  w: number,
  rewards: ChapterRewardModel,
): PIXI.Container {
  const box = new PIXI.Container();
  box.x = x;
  box.y = y;
  box.addChild(flatFill(w, REWARD_H, 12, WELL, 0.18));

  const gap = 10;
  const colW = Math.floor((w - gap) / 2);
  const cols: Array<{ label: string; soul: number; muted: boolean; tag?: string }> = [
    {
      label: '首通奖励',
      soul: rewards.firstSoul,
      muted: rewards.firstClaimed,
      tag: rewards.firstClaimed ? '已领取' : undefined,
    },
    {
      label: '重复通关',
      soul: rewards.repeatSoul,
      muted: !rewards.firstClaimed,
      tag: rewards.firstClaimed ? '可扫荡' : undefined,
    },
  ];
  cols.forEach((col, i) => {
    const cx = i * (colW + gap);
    const bar = flatFill(colW, SECTION_H, 8, WASH);
    bar.x = cx;
    box.addChild(bar);

    const label = makeText(col.label, 'caption', { fill: C.text, fontSize: 11 });
    label.anchor.set(0.5, 0.5);
    label.x = cx + colW / 2;
    label.y = SECTION_H / 2;
    box.addChild(label);

    const tile = makeSoulTile(col.soul, col.muted);
    tile.x = cx + (colW - TILE) / 2;
    tile.y = SECTION_H + 6;
    box.addChild(tile);

    if (col.tag) {
      const tag = makeText(col.tag, 'micro', { fill: col.muted ? C.muted : C.text });
      tag.anchor.set(0.5, 0);
      tag.x = cx + colW / 2;
      tag.y = SECTION_H + 6 + TILE + 2;
      box.addChild(tag);
    }
  });
  return box;
}

function buildDifficultyRow(
  x: number,
  y: number,
  w: number,
  toastRoot: PIXI.Container,
  screenW: number,
): PIXI.Container {
  const row = new PIXI.Container();
  row.x = x;
  row.y = y;
  const gap = 8;
  const tabW = Math.floor((w - gap) / 2);
  const tabH = DIFF_ROW_H;

  const mkTab = (label: string, active: boolean, locked: boolean, onTap?: () => void): PIXI.Container => {
    const t = new PIXI.Container();
    t.addChild(flatFill(
      tabW,
      tabH,
      10,
      active ? C.paper : mix(C.panel, C.paper, 0.22),
      active ? 0.45 : 0.25,
    ));
    const tx = makeText(label, 'uiStrong', {
      fill: locked ? mix(C.paper, C.panel, 0.45) : active ? C.ink : C.paper,
      fontSize: 13,
    });
    tx.anchor.set(0.5);
    const lock = locked ? createUiIcon('icon_lock', 12) : null;
    if (lock) {
      const pair = 12 + 4 + tx.width;
      lock.x = (tabW - pair) / 2;
      lock.y = (tabH - 12) / 2;
      tx.x = lock.x + 16 + tx.width / 2;
      tx.y = tabH / 2;
      t.addChild(lock);
    } else {
      tx.x = tabW / 2;
      tx.y = tabH / 2;
    }
    t.addChild(tx);
    if (onTap) {
      t.eventMode = 'static';
      t.cursor = 'pointer';
      t.hitArea = new PIXI.Rectangle(0, 0, tabW, tabH);
      attachPress(t);
      t.on('pointertap', onTap);
    }
    return t;
  };

  const normal = mkTab('普通', true, false);
  const elite = mkTab('精英', false, true, () => {
    showToast(toastRoot, '精英难度即将开放，敌方数值会更高', { screenWidth: screenW });
  });
  elite.x = tabW + gap;
  row.addChild(normal);
  row.addChild(elite);
  return row;
}

/**
 * 章节卡上方的插图。没有插图（或资源没到）时退回主题色平涂，布局不变。
 *
 * 插图比例固定，卡片高度却随机型浮动，所以按 cover 等比铺满再裁——拉伸会把地平线压歪。
 * 上圆下方的形状用两块叠加的遮罩做：圆角矩形保住上面两个圆角，再拿一块直角矩形
 * 把下半截的圆角填平，这样插图底边能和下面的正文严丝合缝地接上。
 */
function buildCardArt(
  d: DungeonDef,
  unlocked: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
): PIXI.Container {
  const c = new PIXI.Container();
  const tex =
    unlocked && d.art && AssetManager.isBundleLoaded('bg')
      ? AssetManager.texture('bg', d.art)
      : null;

  if (tex && tex !== PIXI.Texture.WHITE) {
    const art = new PIXI.Sprite(tex);
    const s = Math.max(w / tex.width, h / tex.height);
    art.scale.set(s);
    art.x = x + (w - tex.width * s) / 2;
    art.y = y + (h - tex.height * s) / 2;
    c.addChild(art);

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff, 1);
    mask.drawRoundedRect(x, y, w, h, RADIUS);
    mask.drawRect(x, y + h / 2, w, h / 2);
    mask.endFill();
    c.addChild(mask);
    art.mask = mask;
  } else {
    const flat = new PIXI.Graphics();
    flat.beginFill(unlocked ? d.themeColor : mix(C.paper, C.panel, 0.35), 1);
    flat.drawRoundedRect(x, y, w, h, RADIUS);
    flat.drawRect(x, y + h / 2, w, h / 2);
    flat.endFill();
    c.addChild(flat);
  }

  const edge = new PIXI.Graphics();
  edge.lineStyle(1, C.ink, 0.45);
  edge.moveTo(x, y + h);
  edge.lineTo(x + w, y + h);
  c.addChild(edge);

  return c;
}

/**
 * 冒险页 = 章节地图：大幅章节卡 + 底部开打/扫荡。节点条只在局内布阵页出现。
 */
export function createAdventureView(
  state: MvpGameState,
  chapterIndex: number,
  cb: AdventureCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H, 'adventure_bg'));

  const chapters = adventureChapterList(DUNGEON_DEFS);
  let chapter = Math.max(0, Math.min(chapterIndex, chapters.length - 1));

  // 顶栏走四页共用的那一份，胶囊避让在它内部处理。
  const header = createHubHeader({
    screenWidth: W,
    title: '冒险',
    page: 'adventure',
    soul: state.meta.metaCurrency,
  });
  root.addChild(header.root);
  const cardY = Math.max(66, header.height + 10);

  // 章节内容层（切章节时整体滑动）
  const chapterLayer = new PIXI.Container();
  root.addChild(chapterLayer);

  // 底部操作区
  const actionLayer = new PIXI.Container();
  root.addChild(actionLayer);

  function currentDef(): DungeonDef {
    return chapters[chapter]!;
  }

  function buildChapterCard(d: DungeonDef): PIXI.Container {
    const c = new PIXI.Container();
    const unlocked = isDungeonUnlocked(state.meta, d.id);
    const cleared = state.meta.clearedDungeonIds.includes(d.id);

    const cardW = W - 48;
    const cardX = 24;
    // 下方只留开打/扫荡，卡片可以吃掉原来节点条的高度
    const cardH = Math.min(H * 0.5, 400, H - cardY - 118);

    // 外壳走面板色，留白只给奖励井——整张米白会在海天底上像贴了一张纸。
    const card = new PIXI.Graphics();
    card.beginFill(unlocked ? C.panel : mix(C.panel, C.ink, 0.22), 0.97);
    card.drawRoundedRect(cardX, cardY, cardW, cardH, RADIUS);
    card.endFill();
    c.addChild(card);
    c.addChild(buildCardArt(d, unlocked, cardX, cardY, cardW, cardH * ART_RATIO));

    const border = new PIXI.Graphics();
    border.lineStyle(2, C.ink, unlocked ? 1 : 0.55);
    border.drawRoundedRect(cardX, cardY, cardW, cardH, RADIUS);
    c.addChild(border);

    const title = makeText(
      isSandboxDungeon(d.id) ? `测试 · ${d.name}` : `第 ${chapter + 1} 章 · ${d.name}`,
      'title',
      { fill: C.ink, fontSize: 18 },
    );
    title.anchor.set(0.5);
    const barW = title.width + (cleared ? 76 : 48);
    const bar = flatFill(barW, 36, 10, C.paper, 0.35);
    bar.x = W / 2 - barW / 2;
    bar.y = cardY - 20;
    c.addChild(bar);
    title.x = W / 2 - (cleared ? 12 : 0);
    title.y = cardY - 2;
    c.addChild(title);
    if (cleared) {
      const badge = new PIXI.Graphics();
      badge.lineStyle(1, C.ink, 0.4, 0);
      badge.beginFill(C.paper, 1);
      badge.drawCircle(0, 0, 10);
      badge.endFill();
      badge.x = W / 2 + barW / 2 - 20;
      badge.y = cardY - 2;
      c.addChild(badge);
      const tick = drawCheck(8, C.ink);
      tick.x = badge.x;
      tick.y = badge.y;
      c.addChild(tick);
    }

    const artH = cardH * ART_RATIO;
    const bodyTop = cardY + artH;
    const innerL = cardX + 16;
    const innerW = cardW - 32;

    if (!isSandboxDungeon(d.id)) {
      c.addChild(buildStarRow(W / 2, bodyTop + 12, 0));
    }

    if (unlocked) {
      const descPad = 24;
      const descWrap = cardW - descPad * 2;
      const desc = makeText(d.desc, 'body', {
        fill: C.paper, fontSize: 13,
        wordWrap: true, wordWrapWidth: descWrap, breakWords: true, align: 'center',
      });
      desc.x = cardX + descPad + Math.max(0, (descWrap - desc.width) / 2);
      desc.y = bodyTop + (isSandboxDungeon(d.id) ? 12 : STAR_ROW_H + 8);
      c.addChild(desc);

      if (!isSandboxDungeon(d.id)) {
        const rewards = chapterRewardModel(d, state.meta);
        const rewardY = Math.min(
          desc.y + desc.height + 10,
          cardY + cardH - DIFF_ROW_H - REWARD_H - 8,
        );
        c.addChild(buildRewardBlock(innerL, rewardY, innerW, rewards));
        c.addChild(buildDifficultyRow(innerL, cardY + cardH - DIFF_ROW_H - 10, innerW, root, W));
      }
    } else {
      const LOCK = 40;
      const lock = createUiIcon('icon_lock', LOCK);
      if (lock) {
        lock.x = W / 2 - LOCK / 2;
        lock.y = bodyTop + STAR_ROW_H + 6;
        c.addChild(lock);
      }
      let condStr = '';
      if (d.unlock.kind === 'clearDungeon') {
        const need = getDungeonDef(d.unlock.dungeonId);
        condStr = `通关「${need?.name ?? '前置章节'}」解锁`;
      } else if (d.unlock.kind === 'meta') {
        condStr = `魂晶 ${d.unlock.cost} 解锁`;
      }
      const cond = makeText(condStr, 'ui', { fill: C.paper });
      cond.anchor.set(0.5);
      cond.x = W / 2;
      cond.y = bodyTop + STAR_ROW_H + (lock ? LOCK + 14 : 20);
      c.addChild(cond);
      if (d.unlock.kind === 'meta') {
        const cost = d.unlock.cost;
        const ub = makeButton(`解锁（魂晶 ${cost}）`, () => {
          if (unlockDungeonWithMeta(state, d.id)) {
            AudioManager.playSfx('sfx_unlock');
            cb.onChanged();
          } else {
            showToast(root, `魂晶不足（还差 ${cost - state.meta.metaCurrency}）`, {
              screenWidth: W,
              color: C.soulText,
              deny: true,
            });
          }
        }, { variant: 'primary', width: 160, height: 36, fontSize: 13, radius: 10 });
        ub.x = W / 2 - 80;
        ub.y = cond.y + 18;
        c.addChild(ub);
      }
      const rewards = chapterRewardModel(d, state.meta);
      c.addChild(buildRewardBlock(innerL, cardY + cardH - DIFF_ROW_H - REWARD_H - 8, innerW, rewards));
      c.addChild(buildDifficultyRow(innerL, cardY + cardH - DIFF_ROW_H - 10, innerW, root, W));
    }

    const mkArrow = (dir: -1 | 1): void => {
      const target = chapter + dir;
      if (target < 0 || target >= chapters.length) return;
      const a = new PIXI.Container();
      const knob = new PIXI.Graphics();
      knob.lineStyle(1, C.ink, 0.4, 0);
      knob.beginFill(C.paper, 0.94);
      knob.drawCircle(0, 0, 16);
      knob.endFill();
      a.addChild(knob);
      a.addChild(drawChevron(dir, 9, C.ink));
      a.x = dir < 0 ? cardX - 6 : cardX + cardW + 6;
      a.y = cardY + cardH / 2;
      a.eventMode = 'static';
      a.cursor = 'pointer';
      a.hitArea = new PIXI.Circle(0, 0, 26);
      attachPress(a);
      a.on('pointertap', () => slideToChapter(target, dir));
      c.addChild(a);
    };
    mkArrow(-1);
    mkArrow(1);

    return c;
  }

  function rebuildActions(): void {
    actionLayer.removeChildren();
    const d = currentDef();
    const unlocked = isDungeonUnlocked(state.meta, d.id);
    const btnY = H - 70;

    if (state.run) {
      const runD = getDungeonDef(state.run.dungeonId);
      const label = state.run.dungeonId === d.id ? '继续冒险' : `继续冒险（${runD?.name ?? ''}）`;
      const btn = makeButton(label, () => cb.onContinueRun(), {
        variant: 'primary', width: W - 96, height: 48, fontSize: 17, radius: 14,
      });
      btn.x = 48; btn.y = btnY;
      actionLayer.addChild(btn);
      return;
    }

    if (!unlocked) return;

    if (isSandboxDungeon(d.id)) {
      // 「学满技能」这个按钮没了：一人一招之后技能不入档，试炼场的技能池由
      // `effectiveOwnedSkillIds` 按职业现算，进去就是全的
      const gmW = Math.floor((W - 96 - 8) / 2);
      const gmH = 34;
      const gmY = btnY - 46;
      const row = [
        { label: '解锁全角色', run: () => gmUnlockAllCharacters(state) },
        { label: '魂晶 +99', run: () => gmAddSoul(state, 99) },
      ];
      row.forEach((item, i) => {
        const b = makeButton(item.label, () => {
          item.run();
          cb.onChanged();
        }, { variant: 'secondary', width: gmW, height: gmH, fontSize: 12, radius: 8 });
        b.x = 48 + i * (gmW + 8);
        b.y = gmY;
        actionLayer.addChild(b);
      });
      const btn = makeButton('进入试炼', () => cb.onStartRun(d.id, state.meta.roster.map((m) => m.rosterId)), {
        variant: 'primary', width: W - 96, height: 48, fontSize: 18, radius: 14,
      });
      btn.x = 48; btn.y = btnY;
      actionLayer.addChild(btn);
      return;
    }

    const rewards = chapterRewardModel(d, state.meta);
    const cleared = chapterClearedForSweep(state.meta, d.id);
    const left = sweepLeftToday(state.meta, d.id);
    const note = !cleared && rewards.pendingNodeFirstClears > 0
      ? `沿途战斗另有 ${rewards.pendingNodeFirstClears} 处节点首通魂晶`
      : cleared
        ? (left > 0 ? `今日可扫荡 ${left}/${sweepQuota(d.id)} 次` : '今日扫荡次数已用完')
        : '';
    if (note) {
      const noteTx = makeText(note, 'caption', {
        fill: C.paper,
        stroke: C.ink,
        strokeThickness: 3,
      });
      noteTx.anchor.set(0.5, 1);
      noteTx.x = W / 2;
      noteTx.y = btnY - 6;
      actionLayer.addChild(noteTx);
    }

    const start = (): void => cb.onStartRun(d.id, state.meta.roster.map((m) => m.rosterId));
    if (!cleared) {
      const btn = makeButton('开  始', start, {
        variant: 'primary', width: W - 96, height: 48, fontSize: 18, radius: 14,
      });
      btn.x = 48; btn.y = btnY;
      actionLayer.addChild(btn);
      return;
    }

    const gap = 8;
    const btnW = Math.floor((W - 96 - gap) / 2);
    const canSweepNow = canSweepChapter(state, d.id);
    const startBtn = makeButton('开  始', start, {
      variant: canSweepNow ? 'secondary' : 'primary',
      width: btnW, height: 48, fontSize: 16, radius: 14,
    });
    startBtn.x = 48; startBtn.y = btnY;
    actionLayer.addChild(startBtn);

    const sweepBtn = makeButton(canSweepNow ? `扫荡 (${left})` : '扫荡 (0)', () => {
      cb.onSweepChapter(d.id);
    }, {
      variant: canSweepNow ? 'primary' : 'secondary',
      disabled: !canSweepNow,
      width: btnW, height: 48, fontSize: 16, radius: 14,
    });
    sweepBtn.x = 48 + btnW + gap;
    sweepBtn.y = btnY;
    actionLayer.addChild(sweepBtn);
  }

  let currentCard = buildChapterCard(currentDef());
  chapterLayer.addChild(currentCard);
  staggerPop([currentCard], 40);
  rebuildActions();

  let sliding = false;
  function slideToChapter(target: number, dir: -1 | 1): void {
    if (sliding) return;
    sliding = true;
    chapter = target;
    cb.onChapterChange(chapter);
    const nextCard = buildChapterCard(currentDef());
    nextCard.x = dir * W;
    chapterLayer.addChild(nextCard);
    const oldCard = currentCard;
    currentCard = nextCard;
    rebuildActions();

    const durMs = 220;
    let acc = 0;
    const step = (): void => {
      acc += PIXI.Ticker.shared.deltaMS;
      const k = Math.min(1, acc / durMs);
      const e = 1 - (1 - k) ** 2;
      if (!isDisplayLive(oldCard) || !isDisplayLive(nextCard)) {
        PIXI.Ticker.shared.remove(step);
        sliding = false;
        return;
      }
      oldCard.x = -dir * W * e;
      nextCard.x = dir * W * (1 - e);
      if (k >= 1) {
        PIXI.Ticker.shared.remove(step);
        if (!oldCard.destroyed) {
          chapterLayer.removeChild(oldCard);
          oldCard.destroy({ children: true });
        }
        sliding = false;
      }
    };
    PIXI.Ticker.shared.add(step);
  }

  return root;
}
