import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { DUNGEON_DEFS, getDungeonDef, type DungeonDef } from '@/data/dungeonCatalog';
import {
  adventureChapterList,
  isSandboxDungeon,
} from '@/data/sandboxLab';
import {
  dungeonClearSoul,
  gmAddSoul,
  gmUnlockAllCharacters,
  isDungeonUnlocked,
  unlockDungeonWithMeta,
  type MvpGameState,
} from '@/game/MvpState';
import { AssetManager } from '@/core/AssetManager';
import {
  createBackground,
  createUiIcon,
  createUnitToken,
  drawCheck,
  drawChevron,
} from '@/view/renderHelpers';
import { createHubHeader } from '@/view/hubHeader';
import { C, shade } from '@/view/mvpTheme';
import { createNodeStrip } from '@/view/NodeStrip';
import { isDisplayLive } from '@/view/pixiLive';
import { makeButton } from '@/ui/Button';

export interface AdventureCallbacks {
  onStartRun: (dungeonId: string, party: string[]) => void;
  /** 有进行中的 run 时点「继续冒险」 */
  onContinueRun: () => void;
  /** meta 变更（解锁副本）后持久化并重绘 */
  onChanged: () => void;
  /** 记住章节页码，Tab 切换回来不丢 */
  onChapterChange: (index: number) => void;
}

const RADIUS = 20;
/** 插图占卡片高度的比例，同时也是 DungeonDef.art 出图时的取景依据 */
const ART_RATIO = 0.4;
/** 节点进度条底板高度。当前节点上方有「你在这」标记，比裸圆点要高出一截 */
const STRIP_BAR_H = 58;

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
    flat.beginFill(unlocked ? d.themeColor : 0x3a3a48, 1);
    flat.drawRoundedRect(x, y, w, h, RADIUS);
    flat.drawRect(x, y + h / 2, w, h / 2);
    flat.endFill();
    c.addChild(flat);
  }

  // 插图与正文之间压一道墨线，两块内容才不会看起来是糊在一起的
  const edge = new PIXI.Graphics();
  edge.lineStyle(2, C.ink, 0.85);
  edge.moveTo(x, y + h);
  edge.lineTo(x + w, y + h);
  c.addChild(edge);

  return c;
}

/**
 * 冒险页 = 章节地图：大幅章节卡 + 底部节点进度条，左右滑动切换章节。
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
  root.addChild(createBackground(W, H));

  const chapters = adventureChapterList(DUNGEON_DEFS);
  let chapter = Math.max(0, Math.min(chapterIndex, chapters.length - 1));

  // 顶栏走四页共用的那一份，胶囊避让在它内部处理。
  // 这一页不出「冒险」标题：章节绶带本身就是标题，再写一行只是把卡片往下挤。
  const header = createHubHeader({ screenWidth: W, soul: state.meta.metaCurrency });
  root.addChild(header.root);
  /** 章节卡顶。绶带跨在卡片上沿，所以要比顶栏再让出它的一半高度 */
  const cardY = Math.max(66, header.height + 26);

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
    // 卡片下方还要放节点进度条和底部按钮，所以高度是「剩下多少」而不是固定比例：
    // 顶栏在刘海机上会比在旧机型高 40 多像素，按固定比例算会把进度条顶到按钮里
    const cardH = Math.min(H * 0.42, 340, H - cardY - STRIP_BAR_H - 108);

    // 卡片底：统一用面板色，章节身份交给上方插图。底色跟着 themeColor 走的话，
    // 草原章的绿会和同样是绿的战场背景糊在一起，卡片边界看不出来。
    const card = new PIXI.Graphics();
    card.beginFill(unlocked ? C.panel : 0x333340, 0.97);
    card.drawRoundedRect(cardX, cardY, cardW, cardH, RADIUS);
    card.endFill();
    c.addChild(card);
    c.addChild(buildCardArt(d, unlocked, cardX, cardY, cardW, cardH * ART_RATIO));

    // 描边画在插图之上，否则插图会盖掉上半圈。奶白外圈同按钮，用来从亮绿草地里托出卡片
    const border = new PIXI.Graphics();
    border.lineStyle(3, C.paper, unlocked ? 0.9 : 0.4);
    border.drawRoundedRect(cardX - 2, cardY - 2, cardW + 4, cardH + 4, RADIUS + 2);
    border.lineStyle(2, C.ink, 1);
    border.drawRoundedRect(cardX, cardY, cardW, cardH, RADIUS);
    c.addChild(border);

    // 章节标题绶带
    const title = makeText(
      isSandboxDungeon(d.id) ? `测试 · ${d.name}` : `第 ${chapter + 1} 章 · ${d.name}`,
      'title',
      { fill: C.paper, fontSize: 19 },
    );
    title.anchor.set(0.5);
    const ribbonW = title.width + (cleared ? 76 : 48);
    const ribbon = new PIXI.Graphics();
    ribbon.lineStyle(2, C.ink, 1, 0);
    ribbon.beginFill(shade(C.panel, 0.82), 1);
    ribbon.drawRoundedRect(W / 2 - ribbonW / 2, cardY - 22, ribbonW, 40, 12);
    ribbon.endFill();
    c.addChild(ribbon);
    title.x = W / 2 - (cleared ? 12 : 0);
    title.y = cardY - 2;
    c.addChild(title);
    if (cleared) {
      const badge = new PIXI.Graphics();
      badge.lineStyle(2, C.ink, 1, 0);
      badge.beginFill(0x5aae3a, 1);
      badge.drawCircle(0, 0, 11);
      badge.endFill();
      badge.x = W / 2 + ribbonW / 2 - 22;
      badge.y = cardY - 2;
      c.addChild(badge);
      const tick = drawCheck(9);
      tick.x = badge.x;
      tick.y = badge.y;
      c.addChild(tick);
    }

    if (unlocked) {
      // 上阵角色小队立绘（用棋子代替插画）
      const roster = state.meta.roster.slice(0, 3);
      roster.forEach((m, i) => {
        const token = createUnitToken(m.profession, 'player', 56);
        token.x = W / 2 + (i - (roster.length - 1) / 2) * 64;
        token.y = cardY + cardH * 0.52;
        c.addChild(token);
      });
      const desc = makeText(d.desc, 'body', {
        fill: C.paper, fontSize: 13,
        wordWrap: true, wordWrapWidth: cardW - 48, align: 'center',
      });
      desc.anchor.set(0.5, 0);
      desc.x = W / 2;
      desc.y = cardY + cardH * 0.66;
      c.addChild(desc);

      if (!isSandboxDungeon(d.id)) {
        // 奖励行带上魂晶图标：顶栏 pill 和这里用同一个符号，玩家才能把图标和「魂晶」对上号
        const reward = makeText(`通关奖励 +${d.metaReward}`, 'body', { fill: C.soulText });
        const RI = 16;
        const rewardW = RI + 4 + reward.width;
        const rewardY = cardY + cardH * 0.66 + desc.height + 8;
        const rIcon = createUiIcon('icon_soul', RI);
        if (rIcon) {
          rIcon.x = W / 2 - rewardW / 2;
          rIcon.y = rewardY - 2;
          c.addChild(rIcon);
        }
        reward.x = W / 2 - rewardW / 2 + RI + 4;
        reward.y = rewardY;
        c.addChild(reward);
      }
    } else {
      const LOCK = 48;
      const lock = createUiIcon('icon_lock', LOCK);
      if (lock) {
        lock.x = W / 2 - LOCK / 2;
        lock.y = cardY + cardH * 0.42 - LOCK / 2;
        c.addChild(lock);
      }
      let condStr = '';
      if (d.unlock.kind === 'clearDungeon') {
        const need = getDungeonDef(d.unlock.dungeonId);
        condStr = `通关「${need?.name ?? '前置章节'}」解锁`;
      } else if (d.unlock.kind === 'meta') {
        condStr = `魂晶 ${d.unlock.cost} 解锁`;
      }
      const cond = makeText(condStr, 'ui', { fill: 0xd8d0e8 });
      cond.anchor.set(0.5);
      cond.x = W / 2;
      cond.y = cardY + cardH * 0.6;
      c.addChild(cond);
      if (d.unlock.kind === 'meta') {
        const cost = d.unlock.cost;
        const ub = makeButton(`解锁（魂晶 ${cost}）`, () => {
          if (unlockDungeonWithMeta(state, d.id)) cb.onChanged();
        }, { variant: 'primary', width: 160, height: 38, fontSize: 13, radius: 10 });
        ub.x = W / 2 - 80;
        ub.y = cardY + cardH * 0.7;
        c.addChild(ub);
      }
    }

    // 节点进度条（进行中的 run 在当前章节则显示实际进度）。
    // 垫一条与卡片同宽同风格的底板：裸的圆点串压在草地上像是浮在那儿，
    // 接在卡片下方才读得出「这是这一章的路线」。
    const barY = cardY + cardH + 12;
    const bar = new PIXI.Graphics();
    bar.lineStyle(3, C.paper, 0.9);
    bar.drawRoundedRect(cardX - 2, barY - 2, cardW + 4, STRIP_BAR_H + 4, 16);
    bar.lineStyle(2, C.ink, 1);
    bar.beginFill(C.panel, 0.97);
    bar.drawRoundedRect(cardX, barY, cardW, STRIP_BAR_H, 14);
    bar.endFill();
    c.addChild(bar);

    const inRunHere = state.run?.dungeonId === d.id;
    const strip = createNodeStrip(d, {
      currentIndex: inRunHere ? state.run!.nodeIndex : cleared ? d.nodes.length : 0,
      width: cardW - 16,
    });
    strip.x = cardX + 8;
    // strip 的原点在圆心，内容上探到标记顶 26px、下探到标签底 27px
    strip.y = barY + 29;
    c.addChild(strip);

    // 左右切章箭头。裸尖角压在亮绿草地上看不清，套一个深色圆钮既提对比也点明这里能点
    const mkArrow = (dir: -1 | 1): void => {
      const target = chapter + dir;
      if (target < 0 || target >= chapters.length) return;
      const a = new PIXI.Container();
      const knob = new PIXI.Graphics();
      knob.lineStyle(2, C.ink, 1, 0);
      knob.beginFill(C.panel, 0.92);
      knob.drawCircle(0, 0, 16);
      knob.endFill();
      a.addChild(knob);
      a.addChild(drawChevron(dir, 9, C.paper));
      a.x = dir < 0 ? cardX - 6 : cardX + cardW + 6;
      a.y = cardY + cardH / 2;
      a.eventMode = 'static';
      a.cursor = 'pointer';
      a.hitArea = new PIXI.Circle(0, 0, 26);
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

    // 开打前先说清这一趟能拿到什么永久收益。
    //
    // 魂晶按**节点首通**发放，所以全首通过的章节再打一遍，沿途一颗都不会掉，
    // 只剩通关那一笔。玩家没法从界面上看出这件事——两次进副本长得一模一样——
    // 只会打完才发现魂晶没涨，然后怀疑是不是漏发了。
    const doneNodes = state.meta.clearedNodesByDungeonId[d.id] ?? 0;
    const freshNodes = d.nodes.filter((n, i) => n.kind !== 'shop' && i >= doneNodes).length;
    const clearSoul = dungeonClearSoul(state, d.id);
    const note = freshNodes > 0
      ? `本章还有 ${freshNodes} 个节点未首通 · 通关再得魂晶 ${clearSoul}`
      : `已全部首通，重复通关仅得魂晶 ${clearSoul}`;
    const noteTx = makeText(note, 'caption', {
      fill: freshNodes > 0 ? 0xffe8a8 : 0xc8c8bb,
      stroke: 0x000000,
      strokeThickness: 3,
    });
    noteTx.anchor.set(0.5, 1);
    noteTx.x = W / 2;
    noteTx.y = btnY - 6;
    actionLayer.addChild(noteTx);

    // 全部角色带入本局，看到地图和敌人后在布阵阶段再决定谁上场
    const btn = makeButton('开  始', () => cb.onStartRun(d.id, state.meta.roster.map((m) => m.rosterId)), {
      variant: 'primary', width: W - 96, height: 48, fontSize: 18, radius: 14,
    });
    btn.x = 48; btn.y = btnY;
    actionLayer.addChild(btn);
  }

  let currentCard = buildChapterCard(currentDef());
  chapterLayer.addChild(currentCard);
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
