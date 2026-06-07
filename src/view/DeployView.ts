import * as PIXI from 'pixi.js';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import { UNIT_DEFS } from '@/data/unitDefs';
import { POTION_DEFS } from '@/data/potionCatalog';
import { STAT_POTION_DEFS } from '@/data/statPotionCatalog';
import { skillDefForId, getSkillSpec } from '@/data/skillCatalog';
import type { Mercenary } from '@/game/mercenaryTypes';
import {
  attachPotionToPlacement,
  attachStatPotionToPlacement,
  benchMercenaries,
  currentStage,
  cycleSkillForRoster,
  getMaxDeploy,
  getMercenary,
  placeMercenary,
  placeTerrainCell,
  removePlacement,
  type MvpGameState,
} from '@/game/MvpState';
import { C } from '@/view/mvpTheme';
import { createUnitOverhead } from '@/view/unitOverhead';
import { createTerrainCell, createUnitToken, createBackground } from '@/view/renderHelpers';
import { AssetManager } from '@/core/AssetManager';
import { makeButton } from '@/ui/Button';

export interface DeployLayoutScreen {
  screenWidth: number;
  screenHeight: number;
}

/**
 * 部署页纵向分区（避免上挤下空）：
 * - 顶栏：关卡名 + 金币（紧凑）
 * - 中区：棋盘在「顶栏下」到「底坞上」之间垂直居中
 * - 底坞（自下而上）：开战主按钮 → 替补席 → 工具栏 → 简短说明（贴近棋盘）
 */
function computeDeployLayout(screen: DeployLayoutScreen, gridW: number, gridH: number): {
  cell: number;
  originX: number;
  originY: number;
  toolbarY: number;
  handY: number;
  fightY: number;
  fightW: number;
  fightX: number;
  marginX: number;
  labelFs: number;
} {
  const sw = Math.max(320, screen.screenWidth);
  const sh = Math.max(480, screen.screenHeight);
  const marginX = 0;
  const usableW = sw;
  const gw = Math.max(1, gridW);
  const gh = Math.max(1, gridH);

  const topBarH = 46;
  const toolbarBlockH = 76;
  const gapToolbarHand = 8;
  const handStripH = 90;
  const gapHandFight = 10;
  const fightH = 46;
  const bottomPad = 14;
  const gapGridDock = 8;

  const dockTotal =
    bottomPad +
    fightH +
    gapHandFight +
    handStripH +
    gapToolbarHand +
    toolbarBlockH;

  const toolbarY = sh - dockTotal;
  const handY = toolbarY + toolbarBlockH + gapToolbarHand;
  const fightY = handY + handStripH + gapHandFight;
  const fightW = Math.min(usableW - 24, sw - 24);
  const fightX = Math.floor((sw - fightW) / 2);

  const gridAreaTop = topBarH + 4;
  const gridAreaBottom = toolbarY - gapGridDock;
  const usableH = Math.max(gh * 30, gridAreaBottom - gridAreaTop);
  const raw = Math.floor(Math.min(usableW / gw, usableH / gh));
  const cell = Math.max(28, Math.min(58, raw));
  const gridPxH = cell * gh;
  const originY = gridAreaTop + Math.max(0, Math.floor((gridAreaBottom - gridAreaTop - gridPxH) / 2));
  const gridPxW = cell * gw;
  const originX = Math.floor((sw - gridPxW) / 2);
  const labelFs = Math.max(10, Math.min(15, Math.floor(cell * 0.28)));
  return {
    cell,
    originX,
    originY,
    toolbarY,
    handY,
    fightY,
    fightW,
    fightX,
    marginX,
    labelFs,
  };
}

export interface DeployCallbacks {
  onStartBattle: () => void;
  onReset: () => void;
  onHome: () => void;
  /** 刷新部署界面（不重置状态） */
  onRefresh?: () => void;
}

export function createDeployView(
  state: MvpGameState,
  callbacks: DeployCallbacks,
  screen: DeployLayoutScreen,
): PIXI.Container {
  const st0 = currentStage(state);
  const { w: GW, h: GH } = gridSize(st0.terrain);
  const [depR0, depR1] = playerDeployRowRange(GH);
  const {
    cell: CELL,
    originX: ORIGIN_X,
    originY: ORIGIN_Y,
    toolbarY,
    handY,
    fightY,
    fightW,
    fightX,
    marginX: layoutMarginX,
    labelFs,
  } = computeDeployLayout(screen, GW, GH);
  const deployRowSet = new Set<number>([depR0, depR1]);

  const root = new PIXI.Container();

  const bgLayer = createBackground(screen.screenWidth, screen.screenHeight);
  root.addChild(bgLayer);

  // --- 设置按钮（左上角齿轮） ---
  const settingsBtnSize = 36;
  const settingsBtn = new PIXI.Container();
  const settingsBg = new PIXI.Graphics();
  settingsBg.beginFill(0x000000, 0.35);
  settingsBg.drawRoundedRect(0, 0, settingsBtnSize, settingsBtnSize, 8);
  settingsBg.endFill();
  settingsBtn.addChild(settingsBg);
  const gear = new PIXI.Text('⚙', { fill: 0xffffff, fontSize: 20 });
  gear.anchor.set(0.5);
  gear.x = settingsBtnSize / 2;
  gear.y = settingsBtnSize / 2;
  settingsBtn.addChild(gear);
  settingsBtn.x = 8;
  settingsBtn.y = 6;
  settingsBtn.eventMode = 'static';
  settingsBtn.cursor = 'pointer';
  settingsBtn.hitArea = new PIXI.Rectangle(0, 0, settingsBtnSize, settingsBtnSize);
  settingsBtn.on('pointertap', () => toggleSettingsPanel());
  root.addChild(settingsBtn);

  // --- 金币（设置按钮下方，带遮罩底板和图标） ---
  const goldIconSize = 22;
  const goldValueTx = new PIXI.Text(`${state.gold}`, { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' });
  const goldPadX = 6;
  const goldPadY = 4;
  const goldBgW = goldIconSize + 4 + goldValueTx.width + goldPadX * 2;
  const goldBgH = Math.max(goldIconSize, goldValueTx.height) + goldPadY * 2;

  const goldContainer = new PIXI.Container();
  goldContainer.x = 8;
  goldContainer.y = settingsBtn.y + settingsBtnSize + 4;

  const goldBg = new PIXI.Graphics();
  goldBg.beginFill(0x000000, 0.4);
  goldBg.drawRoundedRect(0, 0, goldBgW, goldBgH, 8);
  goldBg.endFill();
  goldContainer.addChild(goldBg);

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

  // --- 关卡信息（与金币同一行，居中显示） ---
  const stageText = `第 ${state.stageIndex + 1} 关`;
  const stageTx = new PIXI.Text(stageText, { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' });
  stageTx.anchor.set(0.5, 0.5);
  const stagePadX = 16;
  const stagePadY = 6;
  const stageLabelW = stageTx.width + stagePadX * 2;
  const stageLabelH = stageTx.height + stagePadY * 2;
  const stageBg = new PIXI.Graphics();
  stageBg.beginFill(0x000000, 0.4);
  stageBg.drawRoundedRect(0, 0, stageLabelW, stageLabelH, 8);
  stageBg.endFill();
  stageBg.x = Math.floor((screen.screenWidth - stageLabelW) / 2);
  stageBg.y = goldContainer.y + Math.floor((goldBgH - stageLabelH) / 2);
  root.addChild(stageBg);
  stageTx.x = stageBg.x + stageLabelW / 2;
  stageTx.y = stageBg.y + stageLabelH / 2;
  root.addChild(stageTx);

  // --- 上阵人数提示（关卡名称下方，居中） ---
  const maxDeployCount = getMaxDeploy(state);
  const baseMaxDeploy = currentStage(state).maxDeploy ?? 3;
  const deployedCount = state.placements.length;
  const deployInfoTx = new PIXI.Text(`${deployedCount}/${maxDeployCount}`, { fill: 0xffffff, fontSize: 12, fontWeight: 'bold' });
  const deployInfoPadX = 8;
  const deployInfoPadY = 4;

  const adBtnW = 20;
  const adBtnGap = 6;
  const hasAdSlot = state.adExtraSlot === 0;
  const deployInfoContentW = 14 + deployInfoTx.width + (hasAdSlot ? adBtnGap + adBtnW : 0);
  const deployInfoW = deployInfoContentW + deployInfoPadX * 2;
  const deployInfoH = deployInfoTx.height + deployInfoPadY * 2;
  const deployInfoContainer = new PIXI.Container();
  deployInfoContainer.x = Math.floor((screen.screenWidth - deployInfoW) / 2);
  deployInfoContainer.y = stageBg.y + stageLabelH + 4;

  const deployInfoBg = new PIXI.Graphics();
  deployInfoBg.beginFill(0x000000, 0.4);
  deployInfoBg.drawRoundedRect(0, 0, deployInfoW, deployInfoH, 8);
  deployInfoBg.endFill();
  deployInfoContainer.addChild(deployInfoBg);

  const personIcon = new PIXI.Text('⚔', { fill: 0xffdd88, fontSize: 12 });
  personIcon.x = deployInfoPadX;
  personIcon.y = (deployInfoH - personIcon.height) / 2;
  deployInfoContainer.addChild(personIcon);

  deployInfoTx.x = deployInfoPadX + 14;
  deployInfoTx.y = (deployInfoH - deployInfoTx.height) / 2;
  deployInfoContainer.addChild(deployInfoTx);

  if (hasAdSlot) {
    const adBtn = new PIXI.Container();
    const adBtnBg = new PIXI.Graphics();
    adBtnBg.beginFill(0x44aa44, 0.9);
    adBtnBg.drawRoundedRect(0, 0, adBtnW, deployInfoH - deployInfoPadY, 4);
    adBtnBg.endFill();
    adBtn.addChild(adBtnBg);
    const adTx = new PIXI.Text('+1', { fill: 0xffffff, fontSize: 10, fontWeight: 'bold' });
    adTx.anchor.set(0.5);
    adTx.x = adBtnW / 2;
    adTx.y = (deployInfoH - deployInfoPadY) / 2;
    adBtn.addChild(adTx);
    adBtn.x = deployInfoPadX + 14 + deployInfoTx.width + adBtnGap;
    adBtn.y = deployInfoPadY / 2;
    adBtn.eventMode = 'static';
    adBtn.cursor = 'pointer';
    adBtn.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      state.adExtraSlot = 1;
      callbacks.onRefresh?.();
    });
    deployInfoContainer.addChild(adBtn);
  }

  root.addChild(deployInfoContainer);

  // --- 设置面板 ---
  const settingsOverlay = new PIXI.Container();
  settingsOverlay.visible = false;
  function toggleSettingsPanel(): void {
    settingsOverlay.visible = !settingsOverlay.visible;
  }
  function buildSettingsPanel(): void {
    settingsOverlay.removeChildren();
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

    const bg = new PIXI.Graphics();
    bg.beginFill(0xfefef6, 0.97);
    bg.drawRoundedRect(0, 0, panelW, panelH, 14);
    bg.endFill();
    panel.addChild(bg);

    const titleTx = new PIXI.Text('设置', { fill: 0x3a3a2a, fontSize: 18, fontWeight: 'bold' });
    titleTx.anchor.set(0.5, 0);
    titleTx.x = panelW / 2;
    titleTx.y = 16;
    panel.addChild(titleTx);

    const btnW = panelW - 32;
    let by = 50;

    const btnContinue = makeButton('继续游戏', () => {
      settingsOverlay.visible = false;
    }, { width: btnW, height: 42, fillColor: 0x5a9e3a, fillAlpha: 0.9, borderColor: 0x4a8e2a, textColor: 0xffffff, fontSize: 15, radius: 8 });
    btnContinue.x = 16;
    btnContinue.y = by;
    panel.addChild(btnContinue);
    by += 52;

    const btnRestart = makeButton('重新开局', () => {
      settingsOverlay.visible = false;
      callbacks.onReset();
    }, { width: btnW, height: 42, fillColor: 0xcc8833, fillAlpha: 0.9, borderColor: 0xbb7722, textColor: 0xffffff, fontSize: 15, radius: 8 });
    btnRestart.x = 16;
    btnRestart.y = by;
    panel.addChild(btnRestart);
    by += 52;

    const btnHome = makeButton('回到首页', () => {
      settingsOverlay.visible = false;
      callbacks.onHome();
    }, { width: btnW, height: 42, fillColor: 0x888888, fillAlpha: 0.85, borderColor: 0x777777, textColor: 0xffffff, fontSize: 15, radius: 8 });
    btnHome.x = 16;
    btnHome.y = by;
    panel.addChild(btnHome);

    settingsOverlay.addChild(panel);
  }
  buildSettingsPanel();

  let selectedRosterId: string | null = null;
  type DeployTool = 'unit' | 'terrain' | 'potion' | 'essence';
  let deployTool: DeployTool = 'unit';
  let potionPickId: string | null = null;
  /** 精华子类：`STAT_POTION_DEFS` 的 id，选好后点已上场格 */
  let essencePickId: string | null = null;

  const STAT_POTION_IDS = Object.keys(STAT_POTION_DEFS) as (keyof typeof STAT_POTION_DEFS)[];
  function essenceShortLabel(id: string): string {
    if (id === 'perm_atk') return '力';
    if (id === 'perm_spd') return '速';
    if (id === 'perm_move') return '腿';
    return STAT_POTION_DEFS[id]?.name.slice(0, 2) ?? id;
  }
  function essenceStockTotal(): number {
    let s = 0;
    for (const id of STAT_POTION_IDS) {
      s += state.statPotions[id] ?? 0;
    }
    return s;
  }

  const gridLayer = new PIXI.Container();
  root.addChild(gridLayer);

  const toolbarLayer = new PIXI.Container();
  toolbarLayer.y = toolbarY;
  root.addChild(toolbarLayer);

  const handLayer = new PIXI.Container();
  handLayer.y = handY;
  root.addChild(handLayer);

  function isDeployRow(y: number): boolean {
    return deployRowSet.has(y);
  }

  let _deployCountUpdater: (() => void) | null = () => {
    deployInfoTx.text = `${state.placements.length}/${maxDeployCount}`;
  };

  function redrawGrid(): void {
    gridLayer.removeChildren();
    const st = currentStage(state);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const px = ORIGIN_X + x * CELL;
        const py = ORIGIN_Y + y * CELL;
        const ov = state.terrainOverlay.find((o) => o.x === x && o.y === y);
        const ter = ov ? ov.terrain : st.terrain[y]![x]!;
        const tc = createTerrainCell(ter, CELL);
        tc.x = px;
        tc.y = py;
        if (!isDeployRow(y)) tc.alpha = 0.7;
        tc.eventMode = 'static';
        tc.cursor = 'pointer';
        tc.hitArea = new PIXI.Rectangle(0, 0, CELL - 2, CELL - 2);
        tc.on('pointertap', () => onCellTap(x, y));
        gridLayer.addChild(tc);

        if (isDeployRow(y)) {
          const highlight = new PIXI.Graphics();
          highlight.lineStyle(1.5, 0x44bb44, 0.7);
          highlight.beginFill(0x44bb44, 0.12);
          highlight.drawRoundedRect(px + 1, py + 1, CELL - 4, CELL - 4, 3);
          highlight.endFill();
          gridLayer.addChild(highlight);
        }

        // 药剂/精华模式下高亮已部署角色格子
        const isItemMode = deployTool === 'potion' || deployTool === 'essence';
        const placedHere = state.placements.find((p) => p.pos.x === x && p.pos.y === y);
        if (isItemMode && placedHere) {
          const glow = new PIXI.Graphics();
          glow.lineStyle(2, 0xffaa33, 0.9);
          glow.beginFill(0xffcc44, 0.2);
          glow.drawRoundedRect(px + 1, py + 1, CELL - 4, CELL - 4, 3);
          glow.endFill();
          gridLayer.addChild(glow);
        }

        const placed = placedHere;
        const enemy = st.enemies.find((e) => e.x === x && e.y === y);
        if (enemy) {
          const d = UNIT_DEFS[enemy.defId];
          const wrap = new PIXI.Container();
          wrap.x = px + (CELL - 2) / 2;
          wrap.y = py + (CELL - 2) / 2;
          const token = createUnitToken(enemy.defId, 'enemy', CELL);
          wrap.addChild(token);
          const oh = createUnitOverhead({
            maxHp: d.base.maxHp,
            currentHp: d.base.maxHp,
            professionName: d.name,
            faction: 'enemy',
            cell: CELL,
          });
          oh.root.y = -(CELL * 0.4) - 2;
          wrap.addChild(oh.root);
          gridLayer.addChild(wrap);
        } else if (placed) {
          const m = getMercenary(state, placed.rosterId);
          const sb = placed.statBonus;
          const stMark =
            sb && (sb.atk > 0 || sb.spd > 0 || sb.move > 0)
              ? `+${sb.atk + sb.spd + sb.move}`
              : '';
          const pk = placed.potionId ? '药' : '';
          const wrap = new PIXI.Container();
          wrap.x = px + (CELL - 2) / 2;
          wrap.y = py + (CELL - 2) / 2;
          if (m) {
            const token = createUnitToken(m.profession, 'player', CELL);
            wrap.addChild(token);
            const oh = createUnitOverhead({
              maxHp: m.base.maxHp,
              currentHp: m.base.maxHp,
              professionName: UNIT_DEFS[m.profession].name,
              faction: 'player',
              cell: CELL,
            });
            oh.root.y = -(CELL * 0.4) - 2;
            wrap.addChild(oh.root);
          } else {
            const t = new PIXI.Text(`?${pk}${stMark}`, { fill: 0x5566aa, fontSize: labelFs });
            t.anchor.set(0.5, 1);
            wrap.addChild(t);
          }
          gridLayer.addChild(wrap);
        }
      }
    }
    const line = new PIXI.Graphics();
    line.lineStyle(1, C.gridLine, 0.15);
    for (let y = 0; y <= GH; y++) {
      line.moveTo(ORIGIN_X, ORIGIN_Y + y * CELL);
      line.lineTo(ORIGIN_X + GW * CELL, ORIGIN_Y + y * CELL);
    }
    for (let x = 0; x <= GW; x++) {
      line.moveTo(ORIGIN_X + x * CELL, ORIGIN_Y);
      line.lineTo(ORIGIN_X + x * CELL, ORIGIN_Y + GH * CELL);
    }
    gridLayer.addChild(line);
    _deployCountUpdater?.();
  }

  function onCellTap(x: number, y: number): void {
    const pos = { x, y };
    if (deployTool === 'terrain') {
      if (placeTerrainCell(state, pos, 'high')) {
        deployTool = 'unit';
        redrawToolbar();
        redrawGrid();
        redrawHand();
      }
      return;
    }
    if (deployTool === 'potion' && potionPickId) {
      if (attachPotionToPlacement(state, pos, potionPickId)) {
        deployTool = 'unit';
        potionPickId = null;
        redrawToolbar();
        redrawGrid();
        redrawHand();
      }
      return;
    }
    if (deployTool === 'essence' && essencePickId) {
      if (attachStatPotionToPlacement(state, pos, essencePickId)) {
        deployTool = 'unit';
        essencePickId = null;
        redrawToolbar();
        redrawGrid();
        redrawHand();
      }
      return;
    }
    const placed = state.placements.find((p) => p.pos.x === x && p.pos.y === y);
    if (placed) {
      removePlacement(state, pos);
      redrawGrid();
      redrawHand();
      redrawToolbar();
      return;
    }
    if (selectedRosterId && placeMercenary(state, selectedRosterId, pos)) {
      redrawGrid();
      redrawHand();
      return;
    }
  }

  function makeToolChip(label: string, active: boolean, onPress: () => void, enabled = true, iconKey?: string): PIXI.Container {
    const chipW = 76;
    const chipH = 28;
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.lineStyle(1, active ? C.accent : C.muted, 1);
    g.beginFill(active ? C.accent : 0xffffff, active ? 0.35 : 0.65);
    g.drawRoundedRect(0, 0, chipW, chipH, 6);
    g.endFill();
    c.addChild(g);

    let textOffsetX = 6;
    if (iconKey && AssetManager.isBundleLoaded('ui')) {
      const tex = AssetManager.texture('ui', iconKey);
      if (tex && tex !== PIXI.Texture.WHITE) {
        const iconSize = chipH - 6;
        const sprite = new PIXI.Sprite(tex);
        sprite.width = iconSize;
        sprite.height = iconSize;
        sprite.x = 4;
        sprite.y = 3;
        if (!enabled) sprite.alpha = 0.4;
        c.addChild(sprite);
        textOffsetX = iconSize + 8;
      }
    }

    const t = new PIXI.Text(label, { fill: enabled ? C.text : C.muted, fontSize: 10 });
    t.x = textOffsetX;
    t.y = 7;
    c.addChild(t);

    c.eventMode = 'static';
    c.cursor = enabled ? 'pointer' : 'default';
    if (enabled) c.on('pointertap', onPress);
    c.hitArea = new PIXI.Rectangle(0, 0, chipW, chipH);
    return c;
  }

  function redrawToolbar(): void {
    toolbarLayer.removeChildren();
    let tx = 0;
    const row = new PIXI.Container();
    const tUnit = makeToolChip(
      '部署',
      deployTool === 'unit',
      () => {
        deployTool = 'unit';
        potionPickId = null;
        essencePickId = null;
        redrawToolbar();
        redrawHand();
      },
      true,
      'icon_deploy',
    );
    tUnit.x = tx;
    tx += 82;
    const tc = state.terrainCharges;
    const tTer = makeToolChip(
      `地形×${tc}`,
      deployTool === 'terrain',
      () => {
        deployTool = 'terrain';
        potionPickId = null;
        essencePickId = null;
        selectedRosterId = null;
        redrawToolbar();
        redrawHand();
      },
      tc > 0,
      'icon_terrain',
    );
    tTer.x = tx;
    tx += 82;
    const pd = state.potions['draught'] ?? 0;
    const tPot = makeToolChip(
      `药剂×${pd}`,
      deployTool === 'potion',
      () => {
        if (pd <= 0) return;
        deployTool = 'potion';
        potionPickId = 'draught';
        essencePickId = null;
        selectedRosterId = null;
        redrawToolbar();
        redrawHand();
      },
      pd > 0,
      'icon_potion',
    );
    tPot.x = tx;
    tx += 82;
    const essTotal = essenceStockTotal();
    const tEss = makeToolChip(
      `精华×${essTotal}`,
      deployTool === 'essence',
      () => {
        if (essTotal <= 0) return;
        deployTool = 'essence';
        potionPickId = null;
        selectedRosterId = null;
        const inStock = STAT_POTION_IDS.filter((id) => (state.statPotions[id] ?? 0) > 0);
        essencePickId = inStock.length === 1 ? inStock[0]! : null;
        redrawToolbar();
        redrawHand();
      },
      essTotal > 0,
      'icon_essence',
    );
    tEss.x = tx;
    row.addChild(tUnit);
    row.addChild(tTer);
    row.addChild(tPot);
    row.addChild(tEss);
    toolbarLayer.addChild(row);

    let sx = 0;
    const sy = 34;
    if (deployTool === 'essence') {
      for (const id of STAT_POTION_IDS) {
        const cnt = state.statPotions[id] ?? 0;
        const chip = makeToolChip(
          `${essenceShortLabel(id)}×${cnt}`,
          essencePickId === id,
          () => {
            if (cnt <= 0) return;
            essencePickId = id;
            redrawToolbar();
          },
          cnt > 0,
        );
        chip.x = sx;
        chip.y = sy;
        sx += 82;
        toolbarLayer.addChild(chip);
      }
      const essHint = new PIXI.Text('👆 点击地图上已部署的角色使用精华', { fill: 0xffdd88, fontSize: 10 });
      essHint.x = 0;
      essHint.y = sy + 32;
      toolbarLayer.addChild(essHint);
    } else if (deployTool === 'potion') {
      const potHint = new PIXI.Text('👆 点击地图上已部署的角色使用药剂', { fill: 0xffdd88, fontSize: 10 });
      potHint.x = 0;
      potHint.y = sy;
      toolbarLayer.addChild(potHint);
    } else if (deployTool === 'terrain') {
      const terHint = new PIXI.Text('👆 点击地图上任意空格放置高地', { fill: 0xffdd88, fontSize: 10 });
      terHint.x = 0;
      terHint.y = sy;
      toolbarLayer.addChild(terHint);
    } else if (selectedRosterId) {
      const m = getMercenary(state, selectedRosterId);
      if (m && m.ownedSkillIds.length > 1) {
        const sid = m.activeSkillId;
        const sn = skillDefForId(sid)?.name ?? sid;
        const chip = makeToolChip(
          `技能:${sn}`,
          false,
          () => {
            cycleSkillForRoster(state, selectedRosterId!);
            redrawToolbar();
          },
        );
        chip.x = sx;
        chip.y = sy;
        sx += 82;
        toolbarLayer.addChild(chip);
      }
    }
  }

  // --- 人物详情弹窗 ---
  const detailOverlay = new PIXI.Container();
  detailOverlay.visible = false;

  function showMercDetail(m: Mercenary): void {
    detailOverlay.removeChildren();
    detailOverlay.visible = true;

    const sw2 = screen.screenWidth;
    const sh2 = screen.screenHeight;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.5);
    dim.drawRect(0, 0, sw2, sh2);
    dim.endFill();
    dim.eventMode = 'static';
    dim.on('pointertap', () => { detailOverlay.visible = false; });
    detailOverlay.addChild(dim);

    const panelW = Math.min(300, sw2 - 32);
    const panelX = Math.floor((sw2 - panelW) / 2);

    const panel = new PIXI.Container();
    panel.x = panelX;
    panel.eventMode = 'static';

    const profDef = UNIT_DEFS[m.profession];
    const skillId = m.activeSkillId;
    const skillSpec = getSkillSpec(skillId);
    const skillDef = skillDefForId(skillId);

    let cy = 16;
    const lineH = 20;
    const labelStyle = { fill: 0xaaa088, fontSize: 11 } as const;
    const valueStyle = { fill: 0x3a3a2a, fontSize: 12, fontWeight: 'bold' as const };
    const sectionStyle = { fill: 0x6b4c2a, fontSize: 13, fontWeight: 'bold' as const };

    // 头像 + 名称 + 职业
    const portrait = createUnitToken(m.profession, 'player', 48);
    portrait.x = 30;
    portrait.y = cy + 24;
    panel.addChild(portrait);

    const nameTx = new PIXI.Text(m.name, { fill: 0x3a3a2a, fontSize: 16, fontWeight: 'bold' });
    nameTx.x = 62;
    nameTx.y = cy + 6;
    panel.addChild(nameTx);

    const profTx = new PIXI.Text(profDef.name, { fill: 0x8a7a5a, fontSize: 12 });
    profTx.x = 62;
    profTx.y = cy + 28;
    panel.addChild(profTx);

    cy += 56;

    // 分割线
    const sep1 = new PIXI.Graphics();
    sep1.lineStyle(1, 0xd0c8b8, 0.6);
    sep1.moveTo(12, cy);
    sep1.lineTo(panelW - 12, cy);
    panel.addChild(sep1);
    cy += 8;

    // 基础属性
    const secBase = new PIXI.Text('基础属性', sectionStyle);
    secBase.x = 12;
    secBase.y = cy;
    panel.addChild(secBase);
    cy += lineH + 2;

    const stats = [
      { label: '生命', value: `${m.base.maxHp}` },
      { label: '攻击', value: `${m.base.atk}` },
      { label: '速度', value: `${m.base.spd}` },
      { label: '移动', value: `${m.base.move}` },
    ];

    const colW = Math.floor((panelW - 24) / 2);
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i]!;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = 16 + col * colW;
      const sy = cy + row * lineH;

      const lb = new PIXI.Text(s.label, labelStyle);
      lb.x = sx;
      lb.y = sy;
      panel.addChild(lb);

      const vl = new PIXI.Text(s.value, valueStyle);
      vl.x = sx + 36;
      vl.y = sy;
      panel.addChild(vl);
    }
    cy += Math.ceil(stats.length / 2) * lineH + 8;

    // 分割线
    const sep2 = new PIXI.Graphics();
    sep2.lineStyle(1, 0xd0c8b8, 0.6);
    sep2.moveTo(12, cy);
    sep2.lineTo(panelW - 12, cy);
    panel.addChild(sep2);
    cy += 8;

    // 普攻属性
    const secStrike = new PIXI.Text('普通攻击', sectionStyle);
    secStrike.x = 12;
    secStrike.y = cy;
    panel.addChild(secStrike);
    cy += lineH + 2;

    const strikeInfo = [
      { label: '射程', value: `${m.strike.range}` },
      { label: '类型', value: m.strike.isRanged ? '远程' : '近战' },
      { label: '嘲讽', value: m.strike.taunt ? '是' : '否' },
    ];
    for (let i = 0; i < strikeInfo.length; i++) {
      const s = strikeInfo[i]!;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = 16 + col * colW;
      const sy = cy + row * lineH;

      const lb = new PIXI.Text(s.label, labelStyle);
      lb.x = sx;
      lb.y = sy;
      panel.addChild(lb);

      const vl = new PIXI.Text(s.value, valueStyle);
      vl.x = sx + 36;
      vl.y = sy;
      panel.addChild(vl);
    }
    cy += Math.ceil(strikeInfo.length / 2) * lineH + 8;

    // 技能信息
    if (skillDef && skillSpec) {
      const sep3 = new PIXI.Graphics();
      sep3.lineStyle(1, 0xd0c8b8, 0.6);
      sep3.moveTo(12, cy);
      sep3.lineTo(panelW - 12, cy);
      panel.addChild(sep3);
      cy += 8;

      const secSkill = new PIXI.Text('装备技能', sectionStyle);
      secSkill.x = 12;
      secSkill.y = cy;
      panel.addChild(secSkill);
      cy += lineH + 2;

      const skillName = new PIXI.Text(skillDef.name, { fill: 0xcc8833, fontSize: 13, fontWeight: 'bold' });
      skillName.x = 16;
      skillName.y = cy;
      panel.addChild(skillName);

      const cdTx = new PIXI.Text(`CD: ${skillSpec.cooldown}回合`, { fill: 0x888888, fontSize: 11 });
      cdTx.x = 16 + skillName.width + 10;
      cdTx.y = cy + 2;
      panel.addChild(cdTx);
      cy += lineH;

      // 技能描述
      const descParts: string[] = [];
      const timingMap: Record<string, string> = { beforeMove: '移动前释放', afterMove: '移动后释放', passive: '被动技能' };
      descParts.push(timingMap[skillSpec.timing] ?? skillSpec.timing);

      if (skillSpec.damage.kind === 'scaledAtk') {
        descParts.push(`伤害: 攻击力×${Math.round(skillSpec.damage.atkMul * 100)}%`);
      }
      if (skillSpec.passiveBasicAttackMulIfMoved) {
        descParts.push(`移动后普攻伤害×${Math.round(skillSpec.passiveBasicAttackMulIfMoved * 100)}%`);
      }
      if (skillSpec.onCastSelfEffects) {
        for (const e of skillSpec.onCastSelfEffects) {
          if (e.kind === 'taunt') descParts.push(`自身嘲讽${e.rounds}回合`);
        }
      }
      if (skillSpec.onCastFoeEffects) {
        for (const e of skillSpec.onCastFoeEffects) {
          if (e.kind === 'atkDown') descParts.push(`敌方攻击-${e.subAtk}，${e.rounds}回合`);
        }
      }
      if (skillSpec.onCastAllyEffects) {
        for (const e of skillSpec.onCastAllyEffects) {
          if (e.kind === 'atkBonus') descParts.push(`友方攻击+${e.addAtk}，${e.rounds}回合`);
          if (e.kind === 'spdBonus') descParts.push(`友方速度+${e.addSpd}，${e.rounds}回合`);
        }
      }

      const descTx = new PIXI.Text(descParts.join('\n'), {
        fill: 0x555544,
        fontSize: 10,
        wordWrap: true,
        wordWrapWidth: panelW - 32,
        lineHeight: 16,
      });
      descTx.x = 16;
      descTx.y = cy;
      panel.addChild(descTx);
      cy += descTx.height + 8;

      // --- 技能范围格子动态展示 ---
      const shape = skillSpec.shape;
      const cs = 12;
      const gap = 1;
      const st2 = cs + gap;

      let gridR = 2;
      let rangeDesc = '';
      const isLine = shape.type === 'lineBestRayAllFoes';
      if (shape.type === 'neighborAoE') {
        gridR = shape.manhattan + 1;
        rangeDesc = `周围${shape.manhattan}格范围\n命中所有敌人`;
      } else if (shape.type === 'neighborPickLowest') {
        gridR = shape.manhattan + 1;
        rangeDesc = `周围${shape.manhattan}格范围\n选中血量最低的敌人`;
      } else if (shape.type === 'neighborPickFoe') {
        gridR = shape.manhattan + 1;
        const pickLabel = shape.pick === 'lowestHp' ? '血量最低' : '血量最高';
        rangeDesc = `周围${shape.manhattan}格范围\n选中${pickLabel}的敌人`;
      } else if (shape.type === 'neighborPickAlly') {
        gridR = shape.manhattan + 1;
        const pickLabel = shape.pick === 'lowestHp' ? '血量最低' : '血量最高';
        rangeDesc = `周围${shape.manhattan}格范围\n选中${pickLabel}的友方`;
      } else if (isLine) {
        gridR = 3;
        rangeDesc = '上下左右四方向\n射线穿透所有敌人';
      }
      const gridD = gridR * 2 + 1;

      type CellKind = 'empty' | 'center' | 'hit' | 'ray';
      const cells: CellKind[][] = [];
      for (let gy2 = 0; gy2 < gridD; gy2++) {
        cells.push([]);
        for (let gx2 = 0; gx2 < gridD; gx2++) cells[gy2]!.push('empty');
      }
      cells[gridR]![gridR] = 'center';

      if (shape.type === 'neighborAoE' || shape.type === 'neighborPickLowest'
          || shape.type === 'neighborPickFoe' || shape.type === 'neighborPickAlly') {
        const md = shape.manhattan;
        for (let dy = -md; dy <= md; dy++) {
          for (let dx = -md; dx <= md; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (Math.abs(dx) + Math.abs(dy) <= md)
              cells[gridR + dy]![gridR + dx] = 'hit';
          }
        }
      } else if (isLine) {
        for (const [ddx, ddy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          for (let s2 = 1; s2 <= gridR; s2++) {
            const gx2 = gridR + ddx! * s2;
            const gy2 = gridR + ddy! * s2;
            if (gx2 >= 0 && gx2 < gridD && gy2 >= 0 && gy2 < gridD)
              cells[gy2]![gx2] = 'ray';
          }
        }
      }

      const gridTotalW = gridD * st2 - gap;
      const rangeRow = new PIXI.Container();
      rangeRow.y = cy;

      const gridContainer = new PIXI.Container();
      const hitCells: PIXI.Graphics[] = [];
      for (let gy2 = 0; gy2 < gridD; gy2++) {
        for (let gx2 = 0; gx2 < gridD; gx2++) {
          const kind = cells[gy2]![gx2]!;
          const px2 = gx2 * st2;
          const py2 = gy2 * st2;
          const cell = new PIXI.Graphics();
          if (kind === 'center') {
            cell.beginFill(0x4488cc, 0.85);
            cell.drawRoundedRect(px2, py2, cs, cs, 2);
            cell.endFill();
            gridContainer.addChild(cell);
          } else if (kind === 'hit' || kind === 'ray') {
            cell.beginFill(kind === 'ray' ? 0xdd6633 : 0xcc3333, 0.7);
            cell.drawRoundedRect(px2, py2, cs, cs, 2);
            cell.endFill();
            gridContainer.addChild(cell);
            hitCells.push(cell);
          } else {
            cell.lineStyle(1, 0xccccbb, 0.25);
            cell.beginFill(0xeeeedd, 0.12);
            cell.drawRoundedRect(px2, py2, cs, cs, 1);
            cell.endFill();
            gridContainer.addChild(cell);
          }
        }
      }

      // 射线技能在四个边缘画箭头，表示延伸
      if (isLine) {
        const arrowStyle = { fill: 0xdd6633, fontSize: 8 };
        const arrowOffsets: [number, number, string][] = [
          [gridR * st2 + cs / 2, -6, '▲'],
          [gridR * st2 + cs / 2, gridD * st2 - gap + 1, '▼'],
          [-6, gridR * st2 + cs / 2, '◀'],
          [gridD * st2 - gap + 2, gridR * st2 + cs / 2, '▶'],
        ];
        for (const [ax, ay, ch] of arrowOffsets) {
          const ar = new PIXI.Text(ch, arrowStyle);
          ar.anchor.set(0.5);
          ar.x = ax;
          ar.y = ay;
          gridContainer.addChild(ar);
        }
      }

      gridContainer.x = 16;
      rangeRow.addChild(gridContainer);

      // 右侧文字说明
      const rangeDescTx = new PIXI.Text(rangeDesc, {
        fill: 0x6a6a5a, fontSize: 10, lineHeight: 15,
        wordWrap: true, wordWrapWidth: panelW - gridTotalW - 48,
      });
      rangeDescTx.x = 16 + gridTotalW + 12;
      rangeDescTx.y = Math.max(0, (gridTotalW - rangeDescTx.height) / 2);
      rangeRow.addChild(rangeDescTx);

      // 图例
      const legendY = Math.max(0, (gridTotalW - rangeDescTx.height) / 2) + rangeDescTx.height + 6;
      const legCenterDot = new PIXI.Graphics();
      legCenterDot.beginFill(0x4488cc, 0.85);
      legCenterDot.drawRoundedRect(0, 0, 8, 8, 2);
      legCenterDot.endFill();
      legCenterDot.x = rangeDescTx.x;
      legCenterDot.y = legendY;
      rangeRow.addChild(legCenterDot);
      const legCenterTx = new PIXI.Text('自身', { fill: 0x888877, fontSize: 9 });
      legCenterTx.x = rangeDescTx.x + 12;
      legCenterTx.y = legendY - 1;
      rangeRow.addChild(legCenterTx);

      const legHitDot = new PIXI.Graphics();
      legHitDot.beginFill(isLine ? 0xdd6633 : 0xcc3333, 0.7);
      legHitDot.drawRoundedRect(0, 0, 8, 8, 2);
      legHitDot.endFill();
      legHitDot.x = legCenterTx.x + legCenterTx.width + 10;
      legHitDot.y = legendY;
      rangeRow.addChild(legHitDot);
      const legHitTx = new PIXI.Text('范围', { fill: 0x888877, fontSize: 9 });
      legHitTx.x = legHitDot.x + 12;
      legHitTx.y = legendY - 1;
      rangeRow.addChild(legHitTx);

      panel.addChild(rangeRow);

      // 脉冲动画
      let pulsePhase = 0;
      const pulseTicker = () => {
        if (!detailOverlay.visible) return;
        pulsePhase += 0.06;
        const a = 0.45 + 0.35 * Math.sin(pulsePhase);
        for (const c of hitCells) c.alpha = a;
      };
      PIXI.Ticker.shared.add(pulseTicker);

      cy += Math.max(gridTotalW, legendY + 14) + 8;
    }

    cy += 12;

    // 面板背景
    const panelBg = new PIXI.Graphics();
    panelBg.beginFill(0xfefef6, 0.97);
    panelBg.drawRoundedRect(0, 0, panelW, cy, 14);
    panelBg.endFill();
    panel.addChildAt(panelBg, 0);

    panel.y = Math.floor((sh2 - cy) / 2);
    detailOverlay.addChild(panel);
  }

  function redrawHand(): void {
    handLayer.removeChildren();
    const bench = benchMercenaries(state);
    const sw = screen.screenWidth;
    const slotH = 80;

    const bgBar = new PIXI.Graphics();
    bgBar.beginFill(0x3a2a1a, 0.75);
    bgBar.drawRoundedRect(-4, -4, sw + 8, slotH + 8, 8);
    bgBar.endFill();
    handLayer.addChild(bgBar);

    if (bench.length === 0) {
      const tx = new PIXI.Text('替补席无人（去商店招募）', { fill: 0xcccccc, fontSize: 11 });
      tx.anchor.set(0.5, 0.5);
      tx.x = sw / 2;
      tx.y = slotH / 2;
      handLayer.addChild(tx);
      return;
    }

    const slotW = Math.min(72, Math.floor((sw - 16) / Math.max(1, bench.length)) - 6);
    const imgSize = Math.min(48, slotW - 8);
    const totalW = bench.length * slotW + (bench.length - 1) * 6;
    let hx = Math.floor((sw - totalW) / 2);

    for (const m of bench) {
      const c = new PIXI.Container();
      c.x = hx;

      const isSelected = selectedRosterId === m.rosterId;
      const g = new PIXI.Graphics();
      if (isSelected) {
        g.lineStyle(2, C.accent, 1);
      }
      g.beginFill(isSelected ? C.accent : 0xffffff, isSelected ? 0.45 : 0.2);
      g.drawRoundedRect(0, 0, slotW, slotH, 6);
      g.endFill();
      c.addChild(g);

      const token = createUnitToken(m.profession, 'player', imgSize);
      token.x = slotW / 2;
      token.y = slotH * 0.38;
      c.addChild(token);

      const nameTx = new PIXI.Text(m.name, {
        fill: 0xffffff,
        fontSize: 10,
        fontWeight: 'bold',
      });
      nameTx.anchor.set(0.5, 0);
      nameTx.x = slotW / 2;
      nameTx.y = slotH - 20;
      c.addChild(nameTx);

      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.hitArea = new PIXI.Rectangle(0, 0, slotW, slotH);
      c.on('pointertap', () => {
        selectedRosterId = m.rosterId;
        deployTool = 'unit';
        potionPickId = null;
        essencePickId = null;
        redrawToolbar();
        redrawHand();
      });

      // 详情按钮（右上角小圆）
      const infoSize = 16;
      const infoBtn = new PIXI.Container();
      const infoBg = new PIXI.Graphics();
      infoBg.beginFill(0x000000, 0.5);
      infoBg.drawCircle(infoSize / 2, infoSize / 2, infoSize / 2);
      infoBg.endFill();
      infoBtn.addChild(infoBg);
      const infoTx = new PIXI.Text('i', { fill: 0xffffff, fontSize: 10, fontWeight: 'bold' });
      infoTx.anchor.set(0.5);
      infoTx.x = infoSize / 2;
      infoTx.y = infoSize / 2;
      infoBtn.addChild(infoTx);
      infoBtn.x = slotW - infoSize - 2;
      infoBtn.y = 2;
      infoBtn.eventMode = 'static';
      infoBtn.cursor = 'pointer';
      infoBtn.hitArea = new PIXI.Circle(infoSize / 2, infoSize / 2, infoSize / 2 + 4);
      infoBtn.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        showMercDetail(m);
      });
      c.addChild(infoBtn);

      handLayer.addChild(c);
      hx += slotW + 6;
    }
  }

  redrawToolbar();
  redrawGrid();
  redrawHand();

  const fh = 46;
  const btnFight = new PIXI.Graphics();
  btnFight.lineStyle(2, 0xcc8020, 1);
  btnFight.beginFill(C.accent, 0.9);
  btnFight.drawRoundedRect(0, 0, fightW, fh, 10);
  btnFight.endFill();
  const ft = new PIXI.Text('开始战斗', { fill: 0xffffff, fontSize: 15, fontWeight: 'bold' });
  ft.anchor.set(0.5);
  ft.x = fightW / 2;
  ft.y = fh / 2;
  const fightC = new PIXI.Container();
  fightC.x = fightX;
  fightC.y = fightY;
  fightC.addChild(btnFight);
  fightC.addChild(ft);
  fightC.eventMode = 'static';
  fightC.cursor = 'pointer';
  fightC.hitArea = new PIXI.Rectangle(0, 0, fightW, fh);
  fightC.on('pointertap', () => callbacks.onStartBattle());
  root.addChild(fightC);

  root.addChild(settingsOverlay);
  root.addChild(detailOverlay);

  return root;
}

