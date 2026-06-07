import * as PIXI from 'pixi.js';
import type { PixiHost } from '@/boot/createPixiApp';
import type { BattleReport, SkillKind, UnitState, Vec2 } from '@/battle/types';
import { effectiveUnitDef } from '@/battle/effectiveUnit';
import { gridSize } from '@/battle/grid';
import type { TerrainGrid } from '@/battle/grid';
import { computeBoardLayout } from '@/view/boardLayout';
import { UNIT_DEFS } from '@/data/unitDefs';
import { C } from '@/view/mvpTheme';
import { createUnitOverhead, type UnitOverheadHandle } from '@/view/unitOverhead';
import { createTerrainCell, createUnitToken, createBackground } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';
import { AssetManager } from '@/core/AssetManager';

export interface PlaybackScreen {
  screenWidth: number;
  screenHeight: number;
}

export interface PlaybackState {
  stageIndex: number;
  gold: number;
}

export interface PlaybackCallbacks {
  onComplete: () => void;
  onHome: () => void;
  onReturnDeploy: () => void;
}

function cellCenter(originX: number, originY: number, cell: number, p: Vec2): { x: number; y: number } {
  return {
    x: originX + p.x * cell + (cell - 2) / 2,
    y: originY + p.y * cell + (cell - 2) / 2,
  };
}

function awaitEase(ticker: PIXI.Ticker, ms: number, onProgress: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let acc = 0;
    const step = (): void => {
      acc += ticker.deltaMS;
      const k = Math.min(1, acc / ms);
      const e = 1 - (1 - k) ** 2;
      onProgress(e);
      if (k >= 1) {
        ticker.remove(step);
        resolve();
      }
    };
    ticker.add(step);
  });
}

function skillRangeColor(kind: SkillKind): number {
  switch (kind) {
    case 'whirlwind':
      return 0xe8c866;
    case 'singleBash':
      return 0x7ab8ff;
    case 'lineShot':
      return 0xff9966;
    default:
      return C.accent;
  }
}

/** 移动可达格高亮（与技能区分） */
const MOVE_RANGE_COLOR = 0x52c4dc;

/**
 * 战斗事件回放：逐格移动、技能名与伤害、普攻线、死亡淡出；结束后回调结算。
 */
export function createBattlePlaybackView(
  app: PixiHost,
  report: BattleReport,
  initialUnits: UnitState[],
  terrain: TerrainGrid,
  screen: PlaybackScreen,
  callbacks: PlaybackCallbacks,
  gameState?: PlaybackState,
): PIXI.Container {
  const root = new PIXI.Container();
  const { w: GW, h: GH } = gridSize(terrain);
  const { cell, originX, originY } = computeBoardLayout(screen, GW, GH);

  const bgLayer = createBackground(screen.screenWidth, screen.screenHeight);
  const gridLayer = new PIXI.Container();
  const rangeLayer = new PIXI.Container();
  const tokenLayer = new PIXI.Container();
  const fxLayer = new PIXI.Container();
  root.addChild(bgLayer);
  root.addChild(gridLayer);
  root.addChild(rangeLayer);
  root.addChild(tokenLayer);
  root.addChild(fxLayer);

  // --- 设置按钮（左上角齿轮） ---
  const settingsBtnSize = 36;
  const settingsBtn = new PIXI.Container();
  const settingsBg = new PIXI.Graphics();
  settingsBg.beginFill(0x000000, 0.35);
  settingsBg.drawRoundedRect(0, 0, settingsBtnSize, settingsBtnSize, 8);
  settingsBg.endFill();
  settingsBtn.addChild(settingsBg);
  const gearTx = new PIXI.Text('⚙', { fill: 0xffffff, fontSize: 20 });
  gearTx.anchor.set(0.5);
  gearTx.x = settingsBtnSize / 2;
  gearTx.y = settingsBtnSize / 2;
  settingsBtn.addChild(gearTx);
  settingsBtn.x = 8;
  settingsBtn.y = 6;
  settingsBtn.eventMode = 'static';
  settingsBtn.cursor = 'pointer';
  settingsBtn.hitArea = new PIXI.Rectangle(0, 0, settingsBtnSize, settingsBtnSize);

  // --- 关卡信息（屏幕顶部居中） ---
  if (gameState) {
    const stageText = `第 ${gameState.stageIndex + 1} 关`;
    const stageTx = new PIXI.Text(stageText, { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' });
    stageTx.anchor.set(0.5, 0.5);
    const stagePadX = 16;
    const stagePadY = 6;
    const stageLabelW = stageTx.width + stagePadX * 2;
    const stageLabelH = stageTx.height + stagePadY * 2;
    const stageBg2 = new PIXI.Graphics();
    stageBg2.beginFill(0x000000, 0.4);
    stageBg2.drawRoundedRect(0, 0, stageLabelW, stageLabelH, 8);
    stageBg2.endFill();
    stageBg2.x = Math.floor((screen.screenWidth - stageLabelW) / 2);
    stageBg2.y = 8;
    root.addChild(stageBg2);
    stageTx.x = stageBg2.x + stageLabelW / 2;
    stageTx.y = stageBg2.y + stageLabelH / 2;
    root.addChild(stageTx);
  }

  // --- 金币（设置按钮下方） ---
  if (gameState) {
    const goldIconSize = 22;
    const goldValueTx = new PIXI.Text(`${gameState.gold}`, { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' });
    const goldPadX = 6;
    const goldPadY = 4;
    const goldBgW = goldIconSize + 4 + goldValueTx.width + goldPadX * 2;
    const goldBgH = Math.max(goldIconSize, goldValueTx.height) + goldPadY * 2;

    const goldContainer = new PIXI.Container();
    goldContainer.x = 8;
    goldContainer.y = settingsBtn.y + settingsBtnSize + 4;

    const goldBg2 = new PIXI.Graphics();
    goldBg2.beginFill(0x000000, 0.4);
    goldBg2.drawRoundedRect(0, 0, goldBgW, goldBgH, 8);
    goldBg2.endFill();
    goldContainer.addChild(goldBg2);

    const goldTex = AssetManager.isBundleLoaded('ui') ? AssetManager.texture('ui', 'icon_gold') : null;
    if (goldTex && goldTex !== PIXI.Texture.WHITE) {
      const goldIcon = new PIXI.Sprite(goldTex);
      goldIcon.width = goldIconSize;
      goldIcon.height = goldIconSize;
      goldIcon.x = goldPadX;
      goldIcon.y = (goldBgH - goldIconSize) / 2;
      goldContainer.addChild(goldIcon);
    }
    goldValueTx.x = goldPadX + goldIconSize + 4;
    goldValueTx.y = (goldBgH - goldValueTx.height) / 2;
    goldContainer.addChild(goldValueTx);
    root.addChild(goldContainer);
  }

  // --- 设置面板 ---
  const settingsOverlay = new PIXI.Container();
  settingsOverlay.visible = false;
  settingsBtn.on('pointertap', () => { settingsOverlay.visible = !settingsOverlay.visible; });

  {
    const sw = screen.screenWidth;
    const sh = screen.screenHeight;
    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.5);
    dim.drawRect(0, 0, sw, sh);
    dim.endFill();
    dim.eventMode = 'static';
    dim.on('pointertap', () => { settingsOverlay.visible = false; });
    settingsOverlay.addChild(dim);

    const panelW = Math.min(280, sw - 40);
    const panelH = 220;
    const panelX = Math.floor((sw - panelW) / 2);
    const panelY = Math.floor((sh - panelH) / 2) - 30;
    const panel = new PIXI.Container();
    panel.x = panelX;
    panel.y = panelY;
    panel.eventMode = 'static';

    const panelBg = new PIXI.Graphics();
    panelBg.beginFill(0xfefef6, 0.97);
    panelBg.drawRoundedRect(0, 0, panelW, panelH, 14);
    panelBg.endFill();
    panel.addChild(panelBg);

    const titleTx = new PIXI.Text('设置', { fill: 0x3a3a2a, fontSize: 18, fontWeight: 'bold' });
    titleTx.anchor.set(0.5, 0);
    titleTx.x = panelW / 2;
    titleTx.y = 16;
    panel.addChild(titleTx);

    const btnW = panelW - 32;
    let by = 50;

    const btnContinue = makeButton('继续战斗', () => { settingsOverlay.visible = false; },
      { width: btnW, height: 42, fillColor: 0x5a9e3a, fillAlpha: 0.9, borderColor: 0x4a8e2a, textColor: 0xffffff, fontSize: 15, radius: 8 });
    btnContinue.x = 16; btnContinue.y = by; panel.addChild(btnContinue); by += 52;

    const btnDeploy = makeButton('返回布阵', () => { settingsOverlay.visible = false; callbacks.onReturnDeploy(); },
      { width: btnW, height: 42, fillColor: 0xcc8833, fillAlpha: 0.9, borderColor: 0xbb7722, textColor: 0xffffff, fontSize: 15, radius: 8 });
    btnDeploy.x = 16; btnDeploy.y = by; panel.addChild(btnDeploy); by += 52;

    const btnHome = makeButton('回到首页', () => { settingsOverlay.visible = false; callbacks.onHome(); },
      { width: btnW, height: 42, fillColor: 0x888888, fillAlpha: 0.85, borderColor: 0x777777, textColor: 0xffffff, fontSize: 15, radius: 8 });
    btnHome.x = 16; btnHome.y = by; panel.addChild(btnHome);

    settingsOverlay.addChild(panel);
  }

  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const px = originX + x * cell;
      const py = originY + y * cell;
      const ter = terrain[y]![x]!;
      const tc = createTerrainCell(ter, cell);
      tc.x = px;
      tc.y = py;
      gridLayer.addChild(tc);
    }
  }
  const line = new PIXI.Graphics();
  line.lineStyle(1, C.gridLine, 0.15);
  for (let y = 0; y <= GH; y++) {
    line.moveTo(originX, originY + y * cell);
    line.lineTo(originX + GW * cell, originY + y * cell);
  }
  for (let x = 0; x <= GW; x++) {
    line.moveTo(originX + x * cell, originY);
    line.lineTo(originX + x * cell, originY + GH * cell);
  }
  gridLayer.addChild(line);

  const posByUid = new Map<string, Vec2>();
  for (const u of initialUnits) {
    posByUid.set(u.uid, { ...u.pos });
  }

  const tokens = new Map<string, PIXI.Container>();
  const tokenOverheads = new Map<string, UnitOverheadHandle>();

  for (const u of initialUnits) {
    const ed = effectiveUnitDef(u, UNIT_DEFS);
    const c = new PIXI.Container();
    const body = createUnitToken(u.defId, u.faction, cell);
    body.y = Math.max(6, cell * 0.07);
    const spriteH = Math.max(10, cell * 0.4);
    const oh = createUnitOverhead({
      maxHp: ed.maxHp,
      currentHp: u.hp,
      professionName: UNIT_DEFS[u.defId].name,
      faction: u.faction,
      cell,
    });
    oh.root.y = body.y - spriteH - 2;
    c.addChild(body);
    c.addChild(oh.root);
    const p = posByUid.get(u.uid)!;
    const ctr = cellCenter(originX, originY, cell, p);
    c.x = ctr.x;
    c.y = ctr.y;
    tokenLayer.addChild(c);
    tokens.set(u.uid, c);
    tokenOverheads.set(u.uid, oh);
  }

  async function flashRangeCells(cells: Vec2[], color: number, durationMs: number): Promise<void> {
    if (cells.length === 0) return;
    const rangeG = new PIXI.Graphics();
    for (const p of cells) {
      const px = originX + p.x * cell;
      const py = originY + p.y * cell;
      rangeG.lineStyle(2, color, 0.92);
      rangeG.beginFill(color, 0.32);
      rangeG.drawRoundedRect(px, py, cell - 2, cell - 2, 4);
      rangeG.endFill();
    }
    rangeLayer.addChild(rangeG);
    await awaitEase(app.ticker, durationMs, (k) => {
      rangeG.alpha = 0.42 + Math.sin(k * Math.PI) * 0.48;
    });
    rangeLayer.removeChild(rangeG);
    rangeG.destroy();
  }

  function floatText(x: number, y: number, msg: string, color: number, opts?: { large?: boolean }): void {
    const fs = opts?.large ? 20 : 16;
    const t = new PIXI.Text(msg, {
      fill: color,
      fontSize: fs,
      fontWeight: 'bold',
      stroke: 0x000000,
      strokeThickness: opts?.large ? 4 : 3,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 1,
      dropShadowAlpha: 0.5,
    });
    t.anchor.set(0.5);
    t.x = x;
    t.y = y - 10;
    t.scale.set(opts?.large ? 1.3 : 1.1);
    fxLayer.addChild(t);
    void (async () => {
      const startY = t.y;
      const startScale = t.scale.x;
      await awaitEase(app.ticker, 650, (k) => {
        t.y = startY - 30 * k;
        t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const pop = k < 0.15 ? 1 + 0.2 * (k / 0.15) : 1 + 0.2 * (1 - (k - 0.15) / 0.85);
        t.scale.set(startScale * pop);
      });
      if (!t.destroyed) {
        fxLayer.removeChild(t);
        t.destroy();
      }
    })();
  }

  function showSkillLabel(x: number, y: number, name: string): void {
    const c = new PIXI.Container();
    const tx = new PIXI.Text(name, {
      fill: 0xffffff, fontSize: 14, fontWeight: 'bold',
      stroke: 0x6b3a0a, strokeThickness: 3,
    });
    tx.anchor.set(0.5);
    const padX = 10;
    const padY = 4;
    const bg = new PIXI.Graphics();
    bg.beginFill(0xcc8833, 0.85);
    bg.drawRoundedRect(-tx.width / 2 - padX, -tx.height / 2 - padY, tx.width + padX * 2, tx.height + padY * 2, 6);
    bg.endFill();
    c.addChild(bg);
    c.addChild(tx);
    c.x = x;
    c.y = y;
    c.alpha = 0;
    fxLayer.addChild(c);
    void (async () => {
      await awaitEase(app.ticker, 500, (k) => {
        if (k < 0.15) {
          c.alpha = k / 0.15;
          c.scale.set(0.8 + 0.2 * (k / 0.15));
        } else if (k < 0.7) {
          c.alpha = 1;
          c.scale.set(1);
        } else {
          c.alpha = 1 - (k - 0.7) / 0.3;
          c.y = y - 12 * ((k - 0.7) / 0.3);
        }
      });
      if (!c.destroyed) {
        fxLayer.removeChild(c);
        c.destroy({ children: true });
      }
    })();
  }

  function skillFxKey(kind: SkillKind): string | null {
    switch (kind) {
      case 'whirlwind': return 'whirlwind';
      case 'singleBash': return 'shield_bash';
      case 'lineShot': return 'arrow';
      default: return 'slash';
    }
  }

  function showFxSprite(x: number, y: number, fxKey: string, size: number): void {
    if (!AssetManager.isBundleLoaded('fx')) return;
    const tex = AssetManager.texture('fx', fxKey);
    if (!tex || tex === PIXI.Texture.WHITE) return;
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = size;
    sp.height = size;
    sp.x = x;
    sp.y = y;
    sp.alpha = 0;
    fxLayer.addChild(sp);
    void (async () => {
      await awaitEase(app.ticker, 400, (k) => {
        if (k < 0.2) {
          sp.alpha = k / 0.2;
          sp.scale.set((size / tex.width) * (0.6 + 0.6 * (k / 0.2)));
        } else if (k < 0.6) {
          sp.alpha = 0.9;
          sp.rotation = (k - 0.2) * 0.3;
        } else {
          sp.alpha = 0.9 * (1 - (k - 0.6) / 0.4);
          sp.scale.set((size / tex.width) * (1.0 + 0.3 * ((k - 0.6) / 0.4)));
        }
      });
      if (!sp.destroyed) {
        fxLayer.removeChild(sp);
        sp.destroy();
      }
    })();
  }

  function hitShake(target: PIXI.Container): void {
    const origX = target.x;
    void (async () => {
      await awaitEase(app.ticker, 120, (k) => {
        const shake = Math.sin(k * Math.PI * 4) * 3 * (1 - k);
        target.x = origX + shake;
      });
      target.x = origX;
    })();
  }

  // --- 行动队列条（队列推进式） ---
  const unitInfoMap = new Map<string, { defId: string; faction: string; name: string }>();
  for (const u of initialUnits) {
    unitInfoMap.set(u.uid, {
      defId: u.defId,
      faction: u.faction,
      name: u.displayName ?? UNIT_DEFS[u.defId].name,
    });
  }

  // 预扫描所有事件，构建全局行动队列
  const globalQueue: string[] = [];
  for (const ev of report.events) {
    if (ev.type === 'moveRange') globalQueue.push(ev.uid);
  }

  const deadSet = new Set<string>();
  let queueHead = 0;

  const turnBarLayer = new PIXI.Container();
  const sw = screen.screenWidth;
  const sh = screen.screenHeight;
  const slotSize = 48;
  const slotGap = 6;
  const barPadX = 8;
  const barPadY = 6;
  const barH = slotSize + 18 + barPadY * 2;
  turnBarLayer.y = sh - barH - 4;

  const turnBarBg = new PIXI.Graphics();
  turnBarLayer.addChild(turnBarBg);

  const slotContainer = new PIXI.Container();
  turnBarLayer.addChild(slotContainer);

  const maxVisible = Math.floor((sw - barPadX * 2 + slotGap) / (slotSize + slotGap));

  function getVisibleQueue(): string[] {
    const visible: string[] = [];
    for (let i = queueHead; i < globalQueue.length && visible.length < maxVisible; i++) {
      const uid = globalQueue[i]!;
      if (!deadSet.has(uid)) visible.push(uid);
    }
    return visible;
  }

  function buildSlot(uid: string, isActive: boolean): PIXI.Container {
    const info = unitInfoMap.get(uid);
    const slot = new PIXI.Container();
    if (!info) return slot;

    const isPlayer = info.faction === 'player';
    const borderColor = isActive ? 0xffdd44 : (isPlayer ? 0x44bb44 : 0xcc3333);

    const frame = new PIXI.Graphics();
    frame.lineStyle(2, borderColor, 1);
    frame.beginFill(isActive ? 0xffdd44 : 0x000000, isActive ? 0.25 : 0.3);
    frame.drawRoundedRect(0, 0, slotSize, slotSize, 6);
    frame.endFill();
    slot.addChild(frame);

    const portrait = createUnitToken(info.defId as any, info.faction as any, slotSize - 8);
    portrait.x = slotSize / 2;
    portrait.y = slotSize / 2;
    slot.addChild(portrait);

    const nameTx = new PIXI.Text(info.name, {
      fill: 0xffffff, fontSize: 9, fontWeight: 'bold',
    });
    nameTx.anchor.set(0.5, 0);
    nameTx.x = slotSize / 2;
    nameTx.y = slotSize + 2;
    slot.addChild(nameTx);

    return slot;
  }

  function renderQueue(activeUid?: string): void {
    slotContainer.removeChildren();

    const visible = getVisibleQueue();
    turnBarBg.clear();
    if (visible.length === 0) return;

    const totalW = visible.length * slotSize + (visible.length - 1) * slotGap + barPadX * 2;
    const barX = Math.floor((sw - totalW) / 2);

    turnBarBg.beginFill(0x000000, 0.45);
    turnBarBg.drawRoundedRect(barX, 0, totalW, barH, 10);
    turnBarBg.endFill();

    let sx = barX + barPadX;
    for (const uid of visible) {
      const slot = buildSlot(uid, uid === activeUid);
      slot.x = sx;
      slot.y = barPadY;
      slotContainer.addChild(slot);
      sx += slotSize + slotGap;
    }
  }

  async function advanceQueue(): Promise<void> {
    if (queueHead >= globalQueue.length) return;
    const visible = getVisibleQueue();
    if (visible.length === 0) { queueHead++; return; }

    const childCount = slotContainer.children.length;
    if (childCount > 0) {
      const firstSlot = slotContainer.children[0] as PIXI.Container;
      const shiftDist = slotSize + slotGap;
      const startPositions = Array.from({ length: childCount }, (_, i) =>
        (slotContainer.children[i] as PIXI.Container).x,
      );
      await awaitEase(app.ticker, 180, (k) => {
        for (let i = 0; i < childCount; i++) {
          const child = slotContainer.children[i] as PIXI.Container | undefined;
          if (!child || child.destroyed) continue;
          if (i === 0) {
            child.alpha = 1 - k;
            child.scale.set(1 - k * 0.3);
          } else {
            child.x = startPositions[i]! - shiftDist * k;
          }
        }
      });
      if (!firstSlot.destroyed) {
        slotContainer.removeChild(firstSlot);
        firstSlot.destroy({ children: true });
      }
    }

    queueHead++;
    while (queueHead < globalQueue.length && deadSet.has(globalQueue[queueHead]!)) {
      queueHead++;
    }
  }

  function removeDeadFromQueue(uid: string): void {
    deadSet.add(uid);
  }

  let firstMoveRange = true;
  renderQueue();

  async function run(): Promise<void> {
    for (let evIdx = 0; evIdx < report.events.length; evIdx++) {
      const ev = report.events[evIdx]!;
      if (root.destroyed) return;
      switch (ev.type) {
        case 'round': {
          const banner = new PIXI.Container();
          const bg = new PIXI.Graphics();
          bg.beginFill(0x000000, 0.55);
          bg.drawRoundedRect(0, 0, 160, 36, 8);
          bg.endFill();
          const tx = new PIXI.Text(`第 ${ev.round} 回合`, { fill: 0xffffff, fontSize: 16 });
          tx.anchor.set(0.5);
          tx.x = 80;
          tx.y = 18;
          banner.addChild(bg);
          banner.addChild(tx);
          banner.x = screen.screenWidth / 2 - 80;
          banner.y = 44;
          fxLayer.addChild(banner);
          await awaitEase(app.ticker, 380, () => {});
          fxLayer.removeChild(banner);
          banner.destroy({ children: true });
          break;
        }
        case 'moveRange': {
          if (firstMoveRange) {
            firstMoveRange = false;
          } else {
            await advanceQueue();
          }
          renderQueue(ev.uid);
          await flashRangeCells(ev.cells, MOVE_RANGE_COLOR, 440);
          break;
        }
        case 'moveStep': {
          const tok = tokens.get(ev.uid);
          if (tok) {
            const fromC = cellCenter(originX, originY, cell, ev.from);
            const toC = cellCenter(originX, originY, cell, ev.to);
            tok.x = fromC.x;
            tok.y = fromC.y;
            await awaitEase(app.ticker, 165, (k) => {
              tok.x = fromC.x + (toC.x - fromC.x) * k;
              tok.y = fromC.y + (toC.y - fromC.y) * k;
            });
            posByUid.set(ev.uid, { ...ev.to });
          }
          break;
        }
        case 'skillCast': {
          await flashRangeCells(ev.rangeCells, skillRangeColor(ev.kind), 520);
          const caster = tokens.get(ev.uid);
          const cx = caster?.x ?? screen.screenWidth / 2;
          const cy = caster?.y ?? 120;
          showSkillLabel(cx, cy - Math.max(42, cell * 0.6), ev.skillName);

          const fxKey = skillFxKey(ev.kind);
          if (fxKey) {
            const fxSize = Math.max(cell * 1.8, 64);
            if (ev.hits.length > 0) {
              const firstHit = tokens.get(ev.hits[0]!.target);
              showFxSprite(firstHit?.x ?? cx, firstHit?.y ?? cy, fxKey, fxSize);
            } else {
              showFxSprite(cx, cy, fxKey, fxSize);
            }
          }

          await awaitEase(app.ticker, 180, () => {});
          for (const h of ev.hits) {
            tokenOverheads.get(h.target)?.updateHp(h.hpLeft);
            const tt = tokens.get(h.target);
            if (tt) {
              hitShake(tt);
              floatText(tt.x, tt.y, `-${h.damage}`, 0xff4444, { large: true });
            }
          }
          await awaitEase(app.ticker, 350, () => {});
          break;
        }
        case 'attack': {
          const a = tokens.get(ev.attacker);
          const t = tokens.get(ev.target);
          const label = ev.attackLabel ?? '普攻';
          if (a && t) {
            showSkillLabel(a.x, a.y - Math.max(42, cell * 0.6), label);
            showFxSprite(t.x, t.y, 'slash', Math.max(cell * 1.5, 56));
            await awaitEase(app.ticker, 140, () => {});
            hitShake(t);
            floatText(t.x, t.y, `-${ev.damage}`, 0xff4444, { large: true });
            tokenOverheads.get(ev.target)?.updateHp(ev.hpLeft);
            await awaitEase(app.ticker, 280, () => {});
          } else if (t) {
            floatText(t.x, t.y, `-${ev.damage}`, 0xff4444, { large: true });
            tokenOverheads.get(ev.target)?.updateHp(ev.hpLeft);
            await awaitEase(app.ticker, 280, () => {});
          }
          break;
        }
        case 'death': {
          removeDeadFromQueue(ev.uid);
          renderQueue();
          const tok = tokens.get(ev.uid);
          if (tok) {
            await awaitEase(app.ticker, 280, (k) => {
              tok.alpha = 1 - k;
            });
            tokenLayer.removeChild(tok);
            tok.destroy({ children: true });
            tokens.delete(ev.uid);
            tokenOverheads.delete(ev.uid);
          }
          break;
        }
        case 'end':
          renderQueue();
          await awaitEase(app.ticker, 200, () => {});
          if (!root.destroyed) callbacks.onComplete();
          return;
      }
    }
    if (!root.destroyed) callbacks.onComplete();
  }

  void run();

  root.addChild(turnBarLayer);
  root.addChild(settingsBtn);
  root.addChild(settingsOverlay);

  return root;
}
