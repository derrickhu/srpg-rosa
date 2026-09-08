import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { makeText } from '@/theme/typography';
import { HUB_UPGRADE_GUIDE_COPY } from '@/game/hubGuide/hubUpgradeGuideCopy';
import {
  HUB_GUIDE_RAYEN_ID,
  HubUpgradeGuideStep,
  isHubUpgradeGuideActive,
  subscribeHubUpgradeGuide,
  visibleHubUpgradeGuideStep,
} from '@/game/hubGuide/hubUpgradeGuide';
import type { MvpGameState } from '@/game/state/GameState';
import type { TabId } from '@/view/TabBar';
import type { SpotlightRect } from '@/view/tutorial/TutorialOverlay';

export interface HubUpgradeGuideHost {
  getState: () => MvpGameState;
  screenW: number;
  screenH: number;
  currentTab: () => TabId;
  tabRect: (id: TabId) => SpotlightRect;
  cardRect: (rosterId: string) => SpotlightRect | null;
  levelUpButtonRect: () => SpotlightRect | null;
  detailRosterId: () => string | null;
}

const DIM = 0x0c0a08;
const BUBBLE = 0xffffff;
const INK = 0x1a1410;
const TEXT = 0x333333;
const NAME_MARK = 0x1e6aa8;
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
  } else {
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

function drawDim(g: PIXI.Graphics, sw: number, sh: number, holes: SpotlightRect[]): void {
  g.clear();
  g.beginFill(DIM, holes.length ? 0.52 : 0.28);
  g.drawRect(0, 0, sw, sh);
  if (holes.length) {
    g.beginHole();
    for (const hole of holes) g.drawRoundedRect(hole.x, hole.y, hole.w, hole.h, hole.r ?? 8);
    g.endHole();
  }
  g.endFill();
}

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
    for (const ch of m[1] ?? '') chars.push({ ch, fill: NAME_MARK });
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

function dialogTop(host: HubUpgradeGuideHost, hole: SpotlightRect | null, rowH: number): number {
  const topY = 56;
  const gap = 10;
  if (!hole) return topY;
  if (hole.y >= topY + rowH + gap) return topY;
  const below = hole.y + hole.h + gap;
  if (below + rowH <= host.screenH - 16) return below;
  return Math.max(8, hole.y - rowH - gap);
}

function placeDialogRow(
  layer: PIXI.Container,
  host: HubUpgradeGuideHost,
  hole: SpotlightRect | null,
  copy: { title?: string; body: string },
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
  const innerH = (title ? title.height + 6 : 0) + bodyH + 16;
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
  row.eventMode = 'none';

  const rowW = bubble.x + bubbleW;
  const rowH = Math.max(guide ? guide.y + GUIDE_H : 0, bubbleH);
  row.x = Math.round((host.screenW - rowW) / 2);
  row.y = Math.round(dialogTop(host, hole, rowH));
  layer.addChild(row);
}

function stepHole(step: HubUpgradeGuideStep, host: HubUpgradeGuideHost): SpotlightRect | null {
  if (step === HubUpgradeGuideStep.OPEN_ROSTER) return host.tabRect('roster');
  if (step === HubUpgradeGuideStep.TAP_RAYEN) return host.cardRect(HUB_GUIDE_RAYEN_ID);
  if (step === HubUpgradeGuideStep.TAP_LEVELUP) return host.levelUpButtonRect();
  return null;
}

export function attachHubUpgradeGuideOverlay(
  root: PIXI.Container,
  host: HubUpgradeGuideHost,
): () => void {
  const layer = new PIXI.Container();
  layer.eventMode = 'passive';
  root.addChild(layer);

  const redraw = (): void => {
    if (layer.destroyed) return;
    layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const state = host.getState();
    if (!isHubUpgradeGuideActive(state.meta)) return;
    const step = visibleHubUpgradeGuideStep(
      state.meta,
      host.currentTab(),
      host.detailRosterId(),
    );
    if (step <= HubUpgradeGuideStep.IDLE || step >= HubUpgradeGuideStep.DONE) return;

    const hole = stepHole(step, host);
    const copy = HUB_UPGRADE_GUIDE_COPY[step];
    const dim = new PIXI.Graphics();
    drawDim(dim, host.screenW, host.screenH, hole ? [hole] : []);
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
      layer.addChild(makeSpot(hole));
      layer.addChild(maskHit);
      placeHand(layer, hole);
    } else {
      dim.eventMode = 'static';
      dim.hitArea = new PIXI.Rectangle(0, 0, host.screenW, host.screenH);
      dim.on('pointertap', () => undefined);
      layer.addChild(dim);
    }
    if (copy) placeDialogRow(layer, host, hole, copy);
  };

  redraw();
  const unsub = subscribeHubUpgradeGuide(redraw);
  return () => {
    unsub();
    if (!layer.destroyed) layer.destroy({ children: true });
  };
}
