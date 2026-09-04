import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { makeText } from '@/theme/typography';
import {
  TUTORIAL_COPY,
  TUTORIAL_DEPLOY_CELL_BOW_COPY,
  TUTORIAL_DEPLOY_CELL_SWORD_COPY,
  TUTORIAL_POTION_HINT_COPY,
  TUTORIAL_SKILL_AIM_COPY,
} from '@/game/tutorial/TutorialCopy';
import {
  notifyTutorial,
  readTutorialStep,
  subscribeTutorial,
  type TutorialGameEvent,
} from '@/game/tutorial/TutorialManager';
import {
  TutorialStep,
  tutorialSceneAllows,
  type TutorialScene,
} from '@/game/tutorial/tutorialSteps';
import {
  BATTLE1_MOVE_TO,
  BATTLE1_SKILL_AIM,
  TUTORIAL_HILL_ID,
  TUTORIAL_RAYEN_ID,
  tutorialDeploySlot,
} from '@/game/tutorial/tutorialRules';
import type { MvpGameState } from '@/game/state/GameState';
import { attachPress } from '@/ui/press';
import { RUN_GOLD_Y_STANDALONE } from '@/view/renderHelpers';

export interface SpotlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
}

export interface TutorialHost {
  getState: () => MvpGameState;
  screenW: number;
  screenH: number;
  /** 只画当前场景该出现的步骤，避免商店文案落到战场上 */
  scope: TutorialScene;
  cellRect?: (x: number, y: number) => SpotlightRect;
  skillButtonRect?: () => SpotlightRect | null;
  /** 第一关旋风斩已经放过：遮罩收起，等希尔进场 */
  skillSpent?: () => boolean;
  /** 已点技能、正在选范围格 */
  skillAiming?: () => boolean;
  /** 希尔是否已经在场上 */
  hillOnField?: () => boolean;
  benchRect?: (rosterId: string) => SpotlightRect | null;
  /** 布阵页当前选中的替补 */
  selectedRosterId?: () => string | null;
  fightRect?: () => SpotlightRect | null;
  potionRect?: () => SpotlightRect | null;
  buyRect?: () => SpotlightRect | null;
  leaveRect?: () => SpotlightRect | null;
  /** 战斗右下托管钮 */
  pilotRect?: () => SpotlightRect | null;
  /** 第 3 战：有人掉血且还有治疗药 */
  potionHint?: () => boolean;
}

const DIM = 0x0c0a08;
const BUBBLE = 0xffffff;
const INK = 0x1a1410;
const TEXT = 0x333333;
/** 白底上的「金币」强调色，比主题金更深一档才压得住正文 */
const GOLD_MARK = 0xc47f08;
/** 人名强调色，和金币区分开 */
const NAME_MARK = 0x1e6aa8;
const NEXT = 0x3cbc54;
const SPOT = 0xff8a5c;
const GUIDE_H = 92;
const HAND_SIZE = 52;
const TAIL_W = 9;

function uiTex(key: string): PIXI.Texture | null {
  if (!AssetManager.isBundleLoaded('ui')) return null;
  const tex = AssetManager.texture('ui', key);
  return tex && tex !== PIXI.Texture.WHITE ? tex : null;
}

function makeSpeechBubble(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.eventMode = 'none';
  const r = 14;
  const ty = Math.round(h * 0.52);
  g.beginFill(BUBBLE, 1);
  g.lineStyle(2, INK, 1, 0.5);
  g.drawRoundedRect(0, 0, w, h, r);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(BUBBLE, 1);
  g.drawPolygon([-TAIL_W, ty, 2, ty - 8, 2, ty + 8]);
  g.endFill();
  g.lineStyle(2, INK, 1, 0.5);
  g.moveTo(2, ty - 8);
  g.lineTo(-TAIL_W, ty);
  g.lineTo(2, ty + 8);
  return g;
}

function makeGuideSprite(): PIXI.Sprite | null {
  const tex = uiTex('tutorial_guide');
  if (!tex) return null;
  const sp = new PIXI.Sprite(tex);
  const s = GUIDE_H / Math.max(tex.height, 1);
  sp.scale.set(s);
  sp.eventMode = 'none';
  return sp;
}

function placeHand(layer: PIXI.Container, hole: SpotlightRect | null): void {
  if (!hole) return;
  const tex = uiTex('tutorial_hand');
  const hand = tex ? new PIXI.Sprite(tex) : new PIXI.Graphics();
  if (hand instanceof PIXI.Graphics) {
    hand.beginFill(0xffffff);
    hand.lineStyle(2, 0x111111);
    hand.drawCircle(8, 8, 11);
    hand.endFill();
    hand.beginFill(0xffffff);
    hand.drawPolygon([2, 2, -16, -18, 12, -2]);
    hand.endFill();
  } else {
    // 食指在贴图左上，手腕在右下
    hand.anchor.set(0.16, 0.14);
    const s = HAND_SIZE / Math.max(hand.texture.width, 1);
    hand.scale.set(s);
  }
  const baseX = hole.x + hole.w * 0.78;
  const baseY = hole.y + hole.h * 0.82;
  hand.x = baseX;
  hand.y = baseY;
  hand.eventMode = 'none';
  layer.addChild(hand);
  let acc = 0;
  const bob = (): void => {
    if (!hand.parent || (hand as PIXI.DisplayObject).destroyed) {
      PIXI.Ticker.shared.remove(bob);
      return;
    }
    acc += PIXI.Ticker.shared.deltaMS;
    const d = Math.sin(acc / 180) * 5;
    hand.x = baseX + d;
    hand.y = baseY + d;
  };
  PIXI.Ticker.shared.add(bob);
}

function drawDim(
  g: PIXI.Graphics,
  sw: number,
  sh: number,
  holes: SpotlightRect[],
): void {
  g.clear();
  if (holes.length === 0) {
    g.beginFill(DIM, 0.28);
    g.drawRect(0, 0, sw, sh);
    g.endFill();
    return;
  }
  g.beginFill(DIM, 0.5);
  g.drawRect(0, 0, sw, sh);
  g.beginHole();
  for (const hole of holes) {
    g.drawRoundedRect(hole.x, hole.y, hole.w, hole.h, hole.r ?? 8);
  }
  g.endHole();
  g.endFill();
}

/** 洞上的橙色罩只负责看见，eventMode 必须 none，否则会把格子点击吃掉。 */
function makeSpot(hole: SpotlightRect): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.eventMode = 'none';
  const r = hole.r ?? 10;
  g.beginFill(SPOT, 0.28);
  g.drawRoundedRect(hole.x, hole.y, hole.w, hole.h, r);
  g.endFill();
  g.lineStyle(2, 0xffc8a0, 0.95);
  g.drawRoundedRect(hole.x, hole.y, hole.w, hole.h, r);
  return g;
}

function deployPicked(host: TutorialHost, rosterId: string): boolean {
  return host.selectedRosterId?.() === rosterId;
}

function deployCellRect(host: TutorialHost, kind: 'sword' | 'bow'): SpotlightRect | null {
  const slot = tutorialDeploySlot(host.getState(), kind);
  return host.cellRect?.(slot.x, slot.y) ?? null;
}

function stepHole(step: TutorialStep, host: TutorialHost): SpotlightRect | null {
  switch (step) {
    case TutorialStep.BATTLE1_MOVE:
      return host.cellRect?.(BATTLE1_MOVE_TO.x, BATTLE1_MOVE_TO.y) ?? null;
    case TutorialStep.BATTLE1_SKILL:
      if (host.skillSpent?.()) return null;
      if (host.skillAiming?.()) return host.cellRect?.(BATTLE1_SKILL_AIM.x, BATTLE1_SKILL_AIM.y) ?? null;
      return host.skillButtonRect?.() ?? null;
    case TutorialStep.DEPLOY2_PLACE_SWORD:
      return deployPicked(host, TUTORIAL_RAYEN_ID)
        ? deployCellRect(host, 'sword')
        : host.benchRect?.(TUTORIAL_RAYEN_ID) ?? null;
    case TutorialStep.DEPLOY2_PLACE_BOW:
      return deployPicked(host, TUTORIAL_HILL_ID)
        ? deployCellRect(host, 'bow')
        : host.benchRect?.(TUTORIAL_HILL_ID) ?? null;
    case TutorialStep.DEPLOY2_START:
      return host.fightRect?.() ?? null;
    case TutorialStep.BATTLE2_PILOT:
      return host.pilotRect?.() ?? null;
    default:
      return null;
  }
}

/** 选人阶段额外漏出目标空位，让玩家看见要放到哪。 */
function stepGhostHoles(step: TutorialStep, host: TutorialHost): SpotlightRect[] {
  if (step === TutorialStep.DEPLOY2_PLACE_SWORD && !deployPicked(host, TUTORIAL_RAYEN_ID)) {
    const cell = deployCellRect(host, 'sword');
    return cell ? [cell] : [];
  }
  if (step === TutorialStep.DEPLOY2_PLACE_BOW && !deployPicked(host, TUTORIAL_HILL_ID)) {
    const cell = deployCellRect(host, 'bow');
    return cell ? [cell] : [];
  }
  return [];
}

function lockClicks(step: TutorialStep, host: TutorialHost): boolean {
  if (step === TutorialStep.BATTLE1_SKILL && host.skillSpent?.()) return false;
  if (step === TutorialStep.BATTLE1_WATCH_ARCHER) return false;
  if (step === TutorialStep.BATTLE2_WATCH) return false;
  if (step === TutorialStep.BATTLE3_WATCH_GRON) return false;
  return stepHole(step, host) != null
    || step === TutorialStep.BATTLE1_INTRO
    || step === TutorialStep.BATTLE1_SKILL
    || step === TutorialStep.BATTLE1_ARCHER_JOIN
    || step === TutorialStep.DEPLOY2_INTRO
    || step === TutorialStep.DEPLOY2_PLACE_SWORD
    || step === TutorialStep.DEPLOY2_PLACE_BOW
    || step === TutorialStep.SHOP_INTRO;
}

function stepCopy(step: TutorialStep, host: TutorialHost) {
  if (step === TutorialStep.BATTLE1_SKILL && host.skillAiming?.()) return TUTORIAL_SKILL_AIM_COPY;
  if (step === TutorialStep.DEPLOY2_PLACE_SWORD && deployPicked(host, TUTORIAL_RAYEN_ID)) {
    return TUTORIAL_DEPLOY_CELL_SWORD_COPY;
  }
  if (step === TutorialStep.DEPLOY2_PLACE_BOW && deployPicked(host, TUTORIAL_HILL_ID)) {
    return TUTORIAL_DEPLOY_CELL_BOW_COPY;
  }
  return TUTORIAL_COPY[step];
}

/**
 * `[[词]]` 涂成强调色。中文按字换行，避免 PIXI 默认不拆 CJK。
 */
const HEAL_MARK = 0xc43c3c;

function markFill(word: string): number {
  if (word === '金币') return GOLD_MARK;
  if (word === '治疗药剂') return HEAL_MARK;
  return NAME_MARK;
}

function makeRichBody(src: string, wrapW: number): PIXI.Container {
  const root = new PIXI.Container();
  const chars: { ch: string; fill: number }[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(src);
  while (m) {
    if (m.index > last) {
      for (const ch of src.slice(last, m.index)) chars.push({ ch, fill: TEXT });
    }
    const word = m[1] ?? '';
    const fill = markFill(word);
    for (const ch of word) chars.push({ ch, fill });
    last = m.index + m[0].length;
    m = re.exec(src);
  }
  if (last < src.length) {
    for (const ch of src.slice(last)) chars.push({ ch, fill: TEXT });
  }

  const measure = makeText('测', 'body', { fill: TEXT, fontSize: 14 });
  const lineH = Math.ceil(measure.height);
  const lines: { ch: string; fill: number }[][] = [[]];
  let lineW = 0;
  for (const c of chars) {
    if (c.ch === '\n') {
      lines.push([]);
      lineW = 0;
      continue;
    }
    measure.text = c.ch;
    const w = measure.width;
    if (lineW + w > wrapW && lineW > 0) {
      lines.push([]);
      lineW = 0;
    }
    lines[lines.length - 1]!.push(c);
    lineW += w;
  }
  measure.destroy();

  lines.forEach((line, i) => {
    let x = 0;
    let run = '';
    let runFill = TEXT;
    const flush = (): void => {
      if (!run) return;
      const t = makeText(run, 'body', {
        fill: runFill,
        fontSize: 14,
        fontWeight: runFill === TEXT ? 'normal' : 'bold',
      });
      t.x = x;
      t.y = i * (lineH + 3);
      root.addChild(t);
      x += t.width;
      run = '';
    };
    for (const c of line) {
      if (c.fill !== runFill) flush();
      runFill = c.fill;
      run += c.ch;
    }
    flush();
  });
  return root;
}

/** 默认钉在金币栏下。洞在上半屏才让开，避免挡敌人。 */
function dialogTop(host: TutorialHost, hole: SpotlightRect | null, rowH: number): number {
  const topY = RUN_GOLD_Y_STANDALONE + 38;
  const gap = 10;
  if (!hole) return topY;
  if (hole.y >= topY + rowH + gap) return topY;
  const below = hole.y + hole.h + gap;
  if (below + rowH <= host.screenH - 16) return below;
  return Math.max(8, hole.y - rowH - gap);
}

function emitNext(host: TutorialHost): void {
  const ev: TutorialGameEvent = { type: 'dialogNext' };
  notifyTutorial(host.getState(), ev);
}

function placeDialogRow(
  layer: PIXI.Container,
  host: TutorialHost,
  hole: SpotlightRect | null,
  copy: { title?: string; body: string; button?: string },
): void {
  const guide = makeGuideSprite();
  const guideW = guide ? Math.round(guide.width) : 0;
  const overlap = guide ? 16 : 0;
  const bubbleW = Math.min(248, host.screenW - 24 - Math.max(0, guideW - overlap));
  const padX = 14;
  const wrapW = Math.max(80, bubbleW - padX * 2);
  const title = copy.title
    ? makeText(copy.title, 'uiStrong', { fill: TEXT, fontSize: 15 })
    : null;
  const body = makeRichBody(copy.body, wrapW);
  const bodyH = Math.max(1, Math.ceil(body.getLocalBounds().height));
  const innerH = (title ? title.height + 6 : 0) + bodyH + (copy.button ? 18 : 10) + 16;
  const bubbleH = Math.max(70, innerH);
  const bubble = makeSpeechBubble(bubbleW, bubbleH);

  const row = new PIXI.Container();
  if (guide) {
    guide.x = 0;
    guide.y = Math.max(0, bubbleH - GUIDE_H + 6);
    row.addChild(guide);
  }
  bubble.x = Math.max(0, guideW - overlap);
  bubble.y = 0;
  row.addChild(bubble);

  let ty = 12;
  if (title) {
    title.x = padX;
    title.y = ty;
    bubble.addChild(title);
    ty += title.height + 6;
  }
  body.x = padX;
  body.y = ty;
  bubble.addChild(body);

  if (copy.button) {
    const chevron = new PIXI.Graphics();
    chevron.beginFill(NEXT, 1);
    chevron.drawPolygon([0, 0, 10, 0, 5, 7]);
    chevron.endFill();
    chevron.x = bubbleW - 20;
    chevron.y = bubbleH - 16;
    bubble.addChild(chevron);
    row.eventMode = 'static';
    row.cursor = 'pointer';
    row.hitArea = new PIXI.Rectangle(bubble.x, 0, bubbleW, bubbleH);
    attachPress(row, { scale: 0.99 });
    row.on('pointertap', () => emitNext(host));
  } else {
    row.eventMode = 'none';
  }

  const rowW = bubble.x + bubbleW;
  const rowH = Math.max(guide ? guide.y + GUIDE_H : 0, bubbleH);
  row.x = Math.round((host.screenW - rowW) / 2);
  row.y = Math.round(dialogTop(host, hole, rowH));
  layer.addChild(row);
}

function paintPotionHint(layer: PIXI.Container, host: TutorialHost): void {
  const hole = host.potionRect?.() ?? null;
  if (hole) {
    layer.addChild(makeSpot(hole));
    placeHand(layer, hole);
  }
  placeDialogRow(layer, host, hole, TUTORIAL_POTION_HINT_COPY);
}

export function attachTutorialOverlay(root: PIXI.Container, host: TutorialHost): () => void {
  const layer = new PIXI.Container();
  layer.eventMode = 'passive';
  root.addChild(layer);

  const redraw = (): void => {
    if (layer.destroyed) return;
    layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const state = host.getState();
    const step = readTutorialStep(state.meta);
    if (step >= TutorialStep.COMPLETED || step <= TutorialStep.NOT_STARTED) return;
    if (step === TutorialStep.HILL_REVEAL || step === TutorialStep.GRON_REVEAL) return;
    if (step === TutorialStep.BATTLE2_WATCH) return;
    if (step === TutorialStep.BATTLE2_PILOT && !host.pilotRect) return;

    const inScene = tutorialSceneAllows(host.scope, step);
    const hintPotion = host.scope === 'battle' && !!host.potionHint?.();
    if (!inScene && !hintPotion) return;

    // 用药提示盖过当前旁白（含格隆进场）：手要指血瓶，文案也要换成药剂。
    if (hintPotion) {
      paintPotionHint(layer, host);
      return;
    }

    const copy = stepCopy(step, host);
    const hole = stepHole(step, host);
    const ghosts = stepGhostHoles(step, host);
    const lock = lockClicks(step, host);

    if (lock) {
      const dim = new PIXI.Graphics();
      drawDim(dim, host.screenW, host.screenH, [...(hole ? [hole] : []), ...ghosts]);
      if (hole) {
        dim.eventMode = 'none';
        const maskHit = new PIXI.Graphics();
        maskHit.beginFill(0xffffff, 0.001);
        const pad = 4;
        maskHit.drawRect(0, 0, host.screenW, Math.max(0, hole.y - pad));
        maskHit.drawRect(0, hole.y - pad, Math.max(0, hole.x - pad), hole.h + pad * 2);
        maskHit.drawRect(
          hole.x + hole.w + pad,
          hole.y - pad,
          Math.max(0, host.screenW - hole.x - hole.w - pad),
          hole.h + pad * 2,
        );
        maskHit.drawRect(0, hole.y + hole.h + pad, host.screenW, Math.max(0, host.screenH - hole.y - hole.h - pad));
        maskHit.endFill();
        maskHit.eventMode = 'static';
        maskHit.on('pointertap', () => undefined);
        layer.addChild(dim);
        for (const g of ghosts) layer.addChild(makeSpot(g));
        layer.addChild(makeSpot(hole));
        layer.addChild(maskHit);
      } else {
        dim.eventMode = 'static';
        dim.hitArea = new PIXI.Rectangle(0, 0, host.screenW, host.screenH);
        if (copy?.button) {
          dim.on('pointertap', () => emitNext(host));
        } else {
          dim.on('pointertap', () => undefined);
        }
        layer.addChild(dim);
      }
      placeHand(layer, hole);
    } else if (hole) {
      layer.addChild(makeSpot(hole));
      placeHand(layer, hole);
    }

    if (!copy) return;
    if (step === TutorialStep.BATTLE1_SKILL && host.skillSpent?.()) return;
    if (step === TutorialStep.BATTLE1_ARCHER_JOIN && host.hillOnField && !host.hillOnField()) return;
    placeDialogRow(layer, host, hole, copy);
  };

  redraw();
  const unsub = subscribeTutorial(redraw);
  return () => {
    unsub();
    if (!layer.destroyed) {
      layer.destroy({ children: true });
    }
  };
}
