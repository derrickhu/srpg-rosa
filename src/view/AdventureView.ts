import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { DUNGEON_DEFS, getDungeonDef, type DungeonDef } from '@/data/dungeonCatalog';
import { isStarBit, starCondLabel, LEGACY_CLEARED_STAR_MASK } from '@/data/chapterStars';
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
import { uiTexture } from '@/ui/chrome';

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

export interface ChapterStarRewardView {
  label: string;
  soul: number;
  achieved: boolean;
  claimed: boolean;
}

export interface ChapterRewardModel {
  stars: ChapterStarRewardView[];
  starFilled: number;
  repeatSoul: number;
  firstClaimed: boolean;
  pendingNodeFirstClears: number;
}

function displayStarMask(
  d: DungeonDef,
  meta: Pick<MetaState, 'clearedDungeonIds' | 'chapterStarsByDungeonId'>,
): number {
  const stored = meta.chapterStarsByDungeonId?.[d.id];
  if (stored !== undefined) return stored;
  return chapterClearedForSweep(meta, d.id) ? LEGACY_CLEARED_STAR_MASK : 0;
}

/** 章节卡奖励：本关可扫荡 + 三星各领一次 */
export function chapterRewardModel(
  d: DungeonDef,
  meta: Pick<MetaState, 'clearedDungeonIds' | 'clearedNodesByDungeonId' | 'chapterStarsByDungeonId'>,
): ChapterRewardModel {
  const doneNodes = meta.clearedNodesByDungeonId[d.id] ?? 0;
  const mask = displayStarMask(d, meta);
  const stars = (d.stars ?? []).map((s, i) => {
    const claimed = isStarBit(mask, i);
    return { label: starCondLabel(s.cond), soul: s.soul, achieved: claimed, claimed };
  });
  return {
    stars,
    starFilled: stars.filter((s) => s.claimed).length,
    repeatSoul: DUNGEON_REPEAT_SOUL,
    firstClaimed: chapterClearedForSweep(meta, d.id),
    pendingNodeFirstClears: d.nodes.filter((n, i) => n.kind !== 'shop' && i >= doneNodes).length,
  };
}

const RADIUS = 20;
/** 插图占卡片高度的比例；星星改画在通关三列上，插图可以略抬回来 */
const ART_RATIO = 0.34;
const SOUL_ICON = 28;
const RIBBON_H = 24;
const REPEAT_TITLE_H = 44;
const REPEAT_FRAME_H = 50;
const REPEAT_OVERLAP = 12;
const REPEAT_TITLE_WELL_Y = 0.54;
const STAR_SZ = 24;
const COND_H = 24;
const STAR_COL_H = 10 + STAR_SZ + 6 + COND_H + 6 + SOUL_ICON + 6 + 14 + 8;
/** 羊皮纸降级色：旧纸，不要再铺一块刺眼米白 */
const PARCHMENT = mix(C.paper, C.panel, 0.38);

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

function stretchUi(key: string, w: number, h: number): PIXI.Sprite | null {
  const tex = uiTexture(key);
  if (!tex) return null;
  const sp = new PIXI.Sprite(tex);
  sp.width = w;
  sp.height = h;
  return sp;
}

function fitUi(key: string, w: number, h: number): PIXI.Sprite | null {
  const tex = uiTexture(key);
  if (!tex) return null;
  const sp = new PIXI.Sprite(tex);
  const s = Math.min(w / tex.width, h / tex.height);
  sp.width = tex.width * s;
  sp.height = tex.height * s;
  return sp;
}

function fitUiHeight(key: string, h: number): PIXI.Sprite | null {
  const tex = uiTexture(key);
  if (!tex) return null;
  const sp = new PIXI.Sprite(tex);
  const s = h / tex.height;
  sp.width = tex.width * s;
  sp.height = h;
  return sp;
}

function repeatBlockH(): number {
  return REPEAT_TITLE_H + REPEAT_FRAME_H - REPEAT_OVERLAP;
}

function rewardBlockH(): number {
  return repeatBlockH() + 8 + RIBBON_H + 2 + STAR_COL_H;
}

function parchmentFill(w: number, h: number, radius: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.lineStyle(2, C.ink, 0.9, 0);
  g.beginFill(PARCHMENT, 1);
  g.drawRoundedRect(0, 0, w, h, radius);
  g.endFill();
  return g;
}

function makeStarIcon(filled: boolean, size: number): PIXI.Container {
  const icon = createUiIcon(filled ? 'chapter_star_on' : 'chapter_star_off', size);
  if (icon) return icon;
  const g = new PIXI.Graphics();
  const r = size / 2;
  const inner = r * 0.4;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : inner;
    pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  g.lineStyle(1.6, C.ink, 1, 0);
  g.beginFill(filled ? C.paper : mix(C.panel, C.ink, 0.18), 1);
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.closePath();
  g.endFill();
  g.x = size / 2;
  g.y = size / 2;
  const c = new PIXI.Container();
  c.addChild(g);
  return c;
}

/** 魂晶在左、数量在右，避免字压在图标尖上 */
function makeSoulMark(amount: number, muted: boolean): PIXI.Container {
  const c = new PIXI.Container();
  const icon = createUiIcon('icon_soul', SOUL_ICON);
  const qty = makeText(`×${amount}`, 'ui', {
    fill: muted ? C.muted : C.ink,
    fontSize: 15,
  });
  qty.anchor.set(0, 0.5);
  let x = 0;
  if (icon) {
    icon.alpha = muted ? 0.5 : 1;
    c.addChild(icon);
    x = SOUL_ICON + 4;
  }
  qty.x = x;
  qty.y = SOUL_ICON / 2;
  c.addChild(qty);
  return c;
}

function addRibbonTitle(parent: PIXI.Container, label: string, x: number, y: number, w: number): void {
  const skin = fitUi('chapter_ribbon', w, RIBBON_H + 8);
  if (skin) {
    skin.x = x + (w - skin.width) / 2;
    skin.y = y + (RIBBON_H - skin.height) / 2;
    parent.addChild(skin);
  } else {
    const bar = parchmentFill(Math.min(w, 168), RIBBON_H, 8);
    bar.x = x + (w - bar.width) / 2;
    bar.y = y;
    parent.addChild(bar);
  }
  const title = makeText(label, 'caption', { fill: C.paper, fontSize: 11 });
  title.anchor.set(0.5);
  title.x = x + w / 2;
  title.y = y + RIBBON_H / 2;
  parent.addChild(title);
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

  let y0 = 0;
  const frameY = y0 + REPEAT_TITLE_H - REPEAT_OVERLAP;
  const frame = fitUiHeight('chapter_repeat_frame', REPEAT_FRAME_H);
  if (frame) {
    frame.x = (w - frame.width) / 2;
    frame.y = frameY;
    box.addChild(frame);
  } else {
    const bar = parchmentFill(88, REPEAT_FRAME_H, 10);
    bar.x = (w - bar.width) / 2;
    bar.y = frameY;
    box.addChild(bar);
  }
  const title = fitUiHeight('chapter_repeat_title', REPEAT_TITLE_H);
  if (title) {
    title.x = (w - title.width) / 2;
    title.y = y0;
    box.addChild(title);
  } else {
    const bar = parchmentFill(88, REPEAT_TITLE_H, 8);
    bar.x = (w - bar.width) / 2;
    bar.y = y0;
    box.addChild(bar);
  }
  const caption = makeText('本关奖励', 'caption', { fill: C.ink, fontSize: 13 });
  caption.anchor.set(0.5);
  caption.x = w / 2;
  caption.y = y0 + REPEAT_TITLE_H * REPEAT_TITLE_WELL_Y;
  box.addChild(caption);
  const repeatTile = makeSoulMark(rewards.repeatSoul, false);
  const frameW = frame?.width ?? 88;
  const frameX = (w - frameW) / 2;
  repeatTile.x = frameX + (frameW - repeatTile.width) / 2;
  repeatTile.y = frameY + (REPEAT_FRAME_H - SOUL_ICON) / 2;
  box.addChild(repeatTile);

  y0 += repeatBlockH() + 8;
  addRibbonTitle(box, '通关奖励', 0, y0, w);
  y0 += RIBBON_H + 2;

  const cols = rewards.stars;
  const gap = 8;
  const colW = cols.length > 0 ? Math.floor((w - gap * (cols.length - 1)) / cols.length) : w;
  cols.forEach((col, i) => {
    const cx = i * (colW + gap);
    const plaque = stretchUi('chapter_plaque', colW, STAR_COL_H);
    if (plaque) {
      plaque.x = cx;
      plaque.y = y0;
      plaque.alpha = col.claimed ? 0.78 : 1;
      box.addChild(plaque);
    } else {
      const well = parchmentFill(colW, STAR_COL_H, 12);
      well.x = cx;
      well.y = y0;
      well.alpha = col.claimed ? 0.78 : 1;
      box.addChild(well);
    }

    const star = makeStarIcon(col.achieved, STAR_SZ);
    star.x = cx + (colW - STAR_SZ) / 2;
    star.y = y0 + 8;
    box.addChild(star);

    const cond = makeText(col.label, 'micro', {
      fill: C.ink,
      fontSize: 10,
      wordWrap: true,
      wordWrapWidth: colW - 10,
      align: 'center',
    });
    cond.anchor.set(0.5, 0);
    cond.x = cx + colW / 2;
    cond.y = y0 + 8 + STAR_SZ + 4;
    box.addChild(cond);

    const tile = makeSoulMark(col.soul, col.claimed);
    tile.x = cx + (colW - tile.width) / 2;
    tile.y = y0 + 8 + STAR_SZ + 4 + COND_H + 4;
    box.addChild(tile);

    const mark = makeText(col.claimed ? '已领取' : '未达成', 'micro', {
      fill: col.claimed ? C.ink : C.muted,
      fontSize: 9,
    });
    mark.anchor.set(0.5, 0);
    mark.x = cx + colW / 2;
    mark.y = y0 + STAR_COL_H - 16;
    box.addChild(mark);
  });
  return box;
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
    const cardH = Math.min(H * 0.62, 480, H - cardY - 108);

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

    const rewards = isSandboxDungeon(d.id) ? null : chapterRewardModel(d, state.meta);

    if (unlocked) {
      if (rewards) {
        c.addChild(buildRewardBlock(innerL, bodyTop + 10, innerW, rewards));
      }
    } else {
      const LOCK = 40;
      const lock = createUiIcon('icon_lock', LOCK);
      if (lock) {
        lock.x = W / 2 - LOCK / 2;
        lock.y = bodyTop + 10;
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
      cond.y = bodyTop + 10 + (lock ? LOCK + 14 : 20);
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
      if (rewards) {
        c.addChild(buildRewardBlock(innerL, cardY + cardH - rewardBlockH() - 10, innerW, rewards));
      }
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

    const cleared = chapterClearedForSweep(state.meta, d.id);
    const left = sweepLeftToday(state.meta, d.id);
    const note = cleared
      ? (left > 0 ? `今日还可扫荡 ${left} 次` : '今日扫荡已用完')
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
