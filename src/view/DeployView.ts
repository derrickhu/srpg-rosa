import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import type { TerrainId } from '@/battle/types';
import { UNIT_DEFS } from '@/data/unitDefs';
import { skillDefForId } from '@/data/skillCatalog';
import { dungeonBattleBgKey, PLACEABLE_TERRAIN_IDS, terrainTicketName } from '@/data/dungeonCatalog';
import { isSandboxDungeon } from '@/data/sandboxLab';
import { characterArtKey } from '@/data/characterCatalog';
import type { Character } from '@/game/characterTypes';
import { characterEffectiveStats } from '@/game/characterFactory';
import type { BattleMode } from '@/battle/engine';
import { enemySpawnToUnitState } from '@/game/state/DeployManager';
import {
  activeSkillIdForRun,
  benchCharacters,
  currentDungeon,
  currentNode,
  currentEnemyScale,
  currentStage,
  cycleSkillForRoster,
  cycleTempSkillForRoster,
  effectiveOwnedSkillIds,
  tempSkillIdForRoster,
  getMaxDeploy,
  getCharacter,
  placeCharacter,
  placeTerrainCell,
  removePlacement,
  terrainChargesTotal,
  type MvpGameState,
} from '@/game/MvpState';
import { C } from '@/view/mvpTheme';
import { createUnitOverhead, tokenOverheadLocalY } from '@/view/unitOverhead';
import { battleUnitInfoModel, characterInfoModel } from '@/view/unitInfoModel';
import { createUnitInfoOverlay, type UnitInfoModel } from '@/view/unitInfoPanel';
import { createTerrainInfoOverlay } from '@/view/terrainInfoPanel';
import {
  createTerrainBadge,
  terrainBadge,
  createTerrainCell,
  createUnitToken,
  createBackground,
  createUiIcon,
  RUN_GOLD_X,
  runGoldYBelow,
} from '@/view/renderHelpers';
import { ENDLESS_MAX_WAVES, isEndlessDungeon } from '@/data/endlessCatalog';
import { createNodeStrip } from '@/view/NodeStrip';
import { AssetManager } from '@/core/AssetManager';
import { makeButton } from '@/ui/Button';
import { AudioManager, muteButtonLabel } from '@/core/AudioManager';
import { attachPress } from '@/ui/press';
import { attachGlowRing } from '@/view/fx/celebration';
export interface DeployLayoutScreen {
  screenWidth: number;
  screenHeight: number;
}

/**
 * 棋盘上已部署单位右上角的「i」角标。
 *
 * 我方格的整格点击是「取消部署」，那是主操作，不能被查看信息抢走；
 * 所以查看信息退到一个小角标上，和替补席卡片用的是同一个记号。
 */
function makeInfoBadge(cell: number, onTap: () => void): PIXI.Container {
  const r = 7;
  const c = new PIXI.Container();
  c.x = cell / 2 - r - 1;
  c.y = -cell / 2 + r + 1;
  const g = new PIXI.Graphics();
  g.beginFill(0x2a2118, 0.82);
  g.drawCircle(0, 0, r);
  g.endFill();
  g.lineStyle(1, 0xf0e0c0, 0.85);
  g.drawCircle(0, 0, r);
  c.addChild(g);
  const tx = makeText('i', 'caption', { fill: 0xf0e0c0, fontSize: 10, fontWeight: 'bold' });
  tx.anchor.set(0.5);
  c.addChild(tx);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  // 判定区比画出来的圆大一圈：格子只有 40px 上下，按视觉尺寸给判定必然点不中
  c.hitArea = new PIXI.Rectangle(-r - 3, -r - 3, (r + 3) * 2, (r + 3) * 2);
  c.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
    e.stopPropagation();
    onTap();
  });
  return c;
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
  onStartBattle: (mode: BattleMode) => void;
  onReset: () => void;
  onHome: () => void;
  /** 刷新部署界面（不重置状态） */
  onRefresh?: () => void;
  /** 提示（走 GameFlow 的 toast，DeployView 不自己造弹窗） */
  onWarn?: (msg: string) => void;
}

export function createDeployView(
  state: MvpGameState,
  callbacks: DeployCallbacks,
  screen: DeployLayoutScreen,
): PIXI.Container {
  const run = state.run!;
  const endless = isEndlessDungeon(run.dungeonId);
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

  const bgLayer = createBackground(
    screen.screenWidth,
    screen.screenHeight,
    dungeonBattleBgKey(currentDungeon(state)),
  );
  root.addChild(bgLayer);

  // --- 设置按钮（左上角齿轮） ---
  const settingsBtnSize = 36;
  const settingsBtn = new PIXI.Container();
  const settingsBg = new PIXI.Graphics();
  settingsBg.beginFill(0x000000, 0.35);
  settingsBg.drawRoundedRect(0, 0, settingsBtnSize, settingsBtnSize, 8);
  settingsBg.endFill();
  settingsBtn.addChild(settingsBg);
  // 用图标而不是 ⚙ emoji：emoji 字形由系统字体决定，微信真机上各家画得都不一样，
  // 有的机型甚至渲染成方框。
  const gearSize = 22;
  const gear = createUiIcon('icon_gear', gearSize);
  if (gear) {
    gear.x = (settingsBtnSize - gearSize) / 2;
    gear.y = (settingsBtnSize - gearSize) / 2;
    settingsBtn.addChild(gear);
  }
  settingsBtn.x = 8;
  settingsBtn.y = 6;
  settingsBtn.eventMode = 'static';
  settingsBtn.cursor = 'pointer';
  settingsBtn.hitArea = new PIXI.Rectangle(0, 0, settingsBtnSize, settingsBtnSize);
  settingsBtn.on('pointertap', () => toggleSettingsPanel());
  root.addChild(settingsBtn);

  // --- 金币（设置按钮下方，带遮罩底板和图标） ---
  const goldIconSize = 22;
  const goldValueTx = makeText(`${run.gold}`, 'uiStrong', { fill: 0xffffff });
  const goldPadX = 6;
  const goldPadY = 4;
  const goldBgW = goldIconSize + 4 + goldValueTx.width + goldPadX * 2;
  const goldBgH = Math.max(goldIconSize, goldValueTx.height) + goldPadY * 2;

  const goldContainer = new PIXI.Container();
  goldContainer.x = RUN_GOLD_X;
  goldContainer.y = runGoldYBelow(settingsBtn.y, settingsBtnSize);

  const goldBg = new PIXI.Graphics();
  goldBg.beginFill(0x000000, 0.4);
  goldBg.drawRoundedRect(0, 0, goldBgW, goldBgH, 8);
  goldBg.endFill();
  goldContainer.addChild(goldBg);

  const goldIcon = createUiIcon('icon_gold', goldIconSize);
  if (goldIcon) {
    goldIcon.x = goldPadX;
    goldIcon.y = (goldBgH - goldIconSize) / 2;
    goldContainer.addChild(goldIcon);
  }
  goldValueTx.x = goldPadX + goldIconSize + 4;
  goldValueTx.y = (goldBgH - goldValueTx.height) / 2;
  goldContainer.addChild(goldValueTx);
  root.addChild(goldContainer);

  // --- 副本名（与金币同一行，居中显示）+ 节点进度链 ---
  const dungeon0 = currentDungeon(state);
  const sandbox = isSandboxDungeon(run.dungeonId);
  const stageText = sandbox ? '特效试炼 · 点角色切技能' : dungeon0.name;
  const stageTx = makeText(stageText, 'uiStrong', { fill: 0xffffff });
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
  const deployedCount = run.placements.length;
  const deployInfoTx = makeText(`${deployedCount}/${maxDeployCount}`, 'uiStrong', { fill: 0xffffff, fontSize: 12 });
  const deployInfoPadX = 8;
  const deployInfoPadY = 4;

  const adBtnW = 20;
  const adBtnGap = 6;
  const hasAdSlot = run.adExtraSlot === 0;
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

  const personIcon = makeText('⚔', 'ui', { fill: 0xffdd88, fontSize: 12 });
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
    const adTx = makeText('+1', 'caption', { fill: 0xffffff, fontSize: 10, fontWeight: 'bold' });
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
      run.adExtraSlot = 1;
      callbacks.onRefresh?.();
    });
    deployInfoContainer.addChild(adBtn);
  }

  root.addChild(deployInfoContainer);

  // --- 节点进度链（代替「2/9」数字） ---
  // 无尽没有章节节点，只显示当前波次
  if (endless) {
    const wave = run.endless?.wave ?? 1;
    const waveTx = makeText(`第 ${wave} / ${ENDLESS_MAX_WAVES} 波`, 'uiStrong', { fill: 0xffffff, fontSize: 13 });
    waveTx.anchor.set(0.5, 0);
    waveTx.x = Math.floor(screen.screenWidth / 2);
    waveTx.y = deployInfoContainer.y + deployInfoH + 10;
    root.addChild(waveTx);
  } else {
    const stripW = Math.min(screen.screenWidth - 32, 360);
    const strip = createNodeStrip(dungeon0, { currentIndex: run.nodeIndex, width: stripW });
    strip.x = Math.floor((screen.screenWidth - stripW) / 2);
    // 30 而不是 18：当前节点上方要留出「你在这」标记的高度，否则它会压到上面的信息条
    strip.y = deployInfoContainer.y + deployInfoH + 30;
    root.addChild(strip);
  }

  // --- 设置面板 ---
  const settingsOverlay = new PIXI.Container();
  settingsOverlay.visible = false;
  function toggleSettingsPanel(): void {
    const next = !settingsOverlay.visible;
    settingsOverlay.visible = next;
    if (next) {
      AudioManager.playSfx('ui_open');
      buildSettingsPanel();
    }
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
    const panelH = 272;
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

    const titleTx = makeText('设置', 'title', { fill: 0x3a3a2a });
    titleTx.anchor.set(0.5, 0);
    titleTx.x = panelW / 2;
    titleTx.y = 16;
    panel.addChild(titleTx);

    const btnW = panelW - 32;
    let by = 50;

    const btnContinue = makeButton('继续游戏', () => {
      settingsOverlay.visible = false;
    }, { variant: 'primary', width: btnW, height: 42, fontSize: 15 });
    btnContinue.x = 16;
    btnContinue.y = by;
    panel.addChild(btnContinue);
    by += 52;

    const btnRestart = makeButton('放弃副本', () => {
      settingsOverlay.visible = false;
      callbacks.onReset();
    }, { variant: 'danger', width: btnW, height: 42, fontSize: 15 });
    btnRestart.x = 16;
    btnRestart.y = by;
    panel.addChild(btnRestart);
    by += 52;

    const btnHome = makeButton('返回大厅', () => {
      settingsOverlay.visible = false;
      callbacks.onHome();
    }, { variant: 'ghost', width: btnW, height: 42, fontSize: 15 });
    btnHome.x = 16;
    btnHome.y = by;
    panel.addChild(btnHome);
    by += 52;

    const btnMute = makeButton(muteButtonLabel(), () => {
      AudioManager.toggleMute();
      buildSettingsPanel();
    }, { variant: 'secondary', width: btnW, height: 42, fontSize: 15 });
    btnMute.x = 16;
    btnMute.y = by;
    panel.addChild(btnMute);

    settingsOverlay.addChild(panel);
  }
  buildSettingsPanel();

  let selectedRosterId: string | null = null;
  type DeployTool = 'unit' | 'terrain';
  let deployTool: DeployTool = 'unit';
  /** 地形子类：选好后点空格放置 */
  let terrainPickId: TerrainId | null = null;

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
    deployInfoTx.text = `${run.placements.length}/${maxDeployCount}`;
  };

  function redrawGrid(): void {
    gridLayer.removeChildren();
    const st = currentStage(state);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const px = ORIGIN_X + x * CELL;
        const py = ORIGIN_Y + y * CELL;
        const ov = run.terrainOverlay.find((o) => o.x === x && o.y === y);
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

        // 地形效果角标。布阵是唯一能改变站位的时刻，效果必须在**这里**可读——
        // 只在战斗里飘字等于告诉玩家「你刚才那步走错了」，太晚了。
        const badge = createTerrainBadge(ter, CELL);
        if (badge) {
          badge.x += px;
          badge.y += py;
          if (!isDeployRow(y)) badge.alpha = 0.7;
          gridLayer.addChild(badge);
        }

        if (isDeployRow(y)) {
          const highlight = new PIXI.Graphics();
          highlight.lineStyle(1.5, 0x44bb44, 0.7);
          highlight.beginFill(0x44bb44, 0.12);
          highlight.drawRoundedRect(px + 1, py + 1, CELL - 4, CELL - 4, 3);
          highlight.endFill();
          gridLayer.addChild(highlight);
        }

        const placed = run.placements.find((p) => p.pos.x === x && p.pos.y === y);
        // 无尽开战才抽落点，布阵页不能画第一章那批预设敌人
        const enemy = endless ? undefined : st.enemies.find((e) => e.x === x && e.y === y);
        if (enemy) {
          const d = UNIT_DEFS[enemy.defId];
          const scale = currentEnemyScale(state);
          const baseHp = enemy.stats?.maxHp ?? d.base.maxHp;
          const showHp = Math.round(baseHp * scale);
          const wrap = new PIXI.Container();
          wrap.x = px + (CELL - 2) / 2;
          wrap.y = py + (CELL - 2) / 2;
          // 与战斗里同一条取用规则（BattlePlaybackView）：有专属外观就用它，
          // 否则退回兵种贴图。不跟着 animSet 走的话，布阵预览是人形新兵、
          // 一进战斗变成魔物，等于白给了一次布阵参考。
          const artKey = enemy.animSet ?? enemy.defId;
          const token = createUnitToken(artKey, 'enemy', CELL);
          const bossScale = enemy.boss ? 1.3 : 1;
          if (enemy.boss) token.scale.set(bossScale);
          wrap.addChild(token);
          const oh = createUnitOverhead({
            maxHp: showHp,
            currentHp: showHp,
            faction: 'enemy',
            cell: CELL,
          });
          oh.root.y = tokenOverheadLocalY(CELL, bossScale);
          wrap.addChild(oh.root);
          // 敌人格没有别的操作，整格都可以点开信息（我方格的点击已经被「取消部署」占了，
          // 那边只能挂一个小「i」角标）。开打前能读到敌人的攻/移/技能，
          // 站位才是决策而不是猜。
          wrap.eventMode = 'static';
          wrap.cursor = 'pointer';
          wrap.hitArea = new PIXI.Rectangle(-CELL / 2, -CELL / 2, CELL, CELL);
          wrap.on('pointertap', () => showUnitInfo(
            battleUnitInfoModel(enemySpawnToUnitState(enemy, scale), { showCooldown: false }),
          ));
          gridLayer.addChild(wrap);
        } else if (placed) {
          const m = getCharacter(state, placed.rosterId);
          const wrap = new PIXI.Container();
          wrap.x = px + (CELL - 2) / 2;
          wrap.y = py + (CELL - 2) / 2;
          if (m) {
            const token = createUnitToken(characterArtKey(m), 'player', CELL);
            wrap.addChild(token);
            const effHp = characterEffectiveStats(m).maxHp;
            const oh = createUnitOverhead({
              maxHp: effHp,
              currentHp: effHp,
              faction: 'player',
              cell: CELL,
            });
            oh.root.y = tokenOverheadLocalY(CELL);
            wrap.addChild(oh.root);
            // 上了场的人会从替补席消失，替补席那个「i」也就跟着没了。
            // 不补一个入口的话，恰恰是**已经决定要带上场**的角色反而查不了词条。
            wrap.addChild(makeInfoBadge(CELL, () => showUnitInfo(characterInfoModel(state, m))));
          } else {
            const t = makeText('?', 'micro', { fill: 0x5566aa, fontSize: labelFs });
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
    if (deployTool === 'terrain' && terrainPickId) {
      if (placeTerrainCell(state, pos, terrainPickId)) {
        deployTool = 'unit';
        terrainPickId = null;
        redrawToolbar();
        redrawGrid();
        redrawHand();
      }
      return;
    }
    const placed = run.placements.find((p) => p.pos.x === x && p.pos.y === y);
    if (placed) {
      removePlacement(state, pos);
      redrawGrid();
      redrawHand();
      redrawToolbar();
      return;
    }
    if (selectedRosterId && placeCharacter(state, selectedRosterId, pos)) {
      AudioManager.playSfx('sfx_deploy');
      redrawGrid();
      redrawHand();
      return;
    }
    // 走到这里说明这一格没有可做的操作（非部署行、或还没选人）。
    // 在此之前点这些格子是**完全没有反馈**的，玩家分不清是「点歪了」还是「不能放」；
    // 顺手把地形说明给出来，既回答了「这格怎么了」，也是唯一能读到移动消耗的地方。
    const ter = currentStage(state).terrain[y]?.[x];
    if (ter) showTerrainInfo(ter);
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
    if (iconKey) {
      const iconSize = chipH - 6;
      const icon = createUiIcon(iconKey, iconSize);
      if (icon) {
        icon.x = 4;
        icon.y = 3;
        if (!enabled) icon.alpha = 0.4;
        c.addChild(icon);
        textOffsetX = iconSize + 8;
      }
    }

    const t = makeText(label, 'caption', { fill: enabled ? C.text : C.muted, fontSize: 10 });
    t.x = textOffsetX;
    t.y = 7;
    c.addChild(t);

    c.eventMode = 'static';
    c.cursor = enabled ? 'pointer' : 'default';
    c.hitArea = new PIXI.Rectangle(0, 0, chipW, chipH);
    if (enabled) {
      attachPress(c);
      c.on('pointertap', onPress);
    }
    if (active) attachGlowRing(c, chipW, chipH).setActive(true);
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
        terrainPickId = null;
        redrawToolbar();
        redrawHand();
      },
      true,
      'icon_deploy',
    );
    tUnit.x = tx;
    tx += 82;
    const terTotal = terrainChargesTotal(run);
    const tTer = makeToolChip(
      `地形×${terTotal}`,
      deployTool === 'terrain',
      () => {
        if (terTotal <= 0) return;
        deployTool = 'terrain';
        selectedRosterId = null;
        const inStock = PLACEABLE_TERRAIN_IDS.filter((id) => (run.terrainCharges[id] ?? 0) > 0);
        terrainPickId = inStock.length === 1 ? inStock[0]! : null;
        redrawToolbar();
        redrawHand();
      },
      terTotal > 0,
      'icon_terrain',
    );
    tTer.x = tx;
    row.addChild(tUnit);
    row.addChild(tTer);
    toolbarLayer.addChild(row);

    let sx = 0;
    const sy = 34;
    if (deployTool === 'terrain') {
      for (const id of PLACEABLE_TERRAIN_IDS) {
        const cnt = run.terrainCharges[id] ?? 0;
        const chip = makeToolChip(
          `${terrainTicketName(id).replace('券', '')}×${cnt}`,
          terrainPickId === id,
          () => {
            if (cnt <= 0) return;
            terrainPickId = id;
            redrawToolbar();
          },
          cnt > 0,
        );
        chip.x = sx;
        chip.y = sy;
        sx += 82;
        toolbarLayer.addChild(chip);
      }
      // 选中某种地形券后，提示语换成它到底干什么。
      // 「河流券×2」这个名字本身讲不出任何效果，玩家买它只能靠猜。
      const pickedBadge = terrainPickId ? terrainBadge(terrainPickId) : null;
      const terHint = makeText(
        terrainPickId
          ? `👆 点击地图上任意空格放置${
            pickedBadge ? `（站上去：${pickedBadge.text}）` : '（不可通行，用来堵路）'
          }`
          : '先选择要放置的地形类型',
        'caption',
        { fill: 0xffdd88, fontSize: 10 },
      );
      terHint.x = 0;
      terHint.y = sy + 32;
      toolbarLayer.addChild(terHint);
    } else if (selectedRosterId) {
      const m = getCharacter(state, selectedRosterId);
      if (m && effectiveOwnedSkillIds(state, m).length > 1) {
        const sid = activeSkillIdForRun(state, m);
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
        if (sandbox) {
          const tid = tempSkillIdForRoster(state, m.rosterId);
          const tn = tid ? (skillDefForId(tid)?.name ?? tid) : '无';
          const tempChip = makeToolChip(
            `临时:${tn}`,
            false,
            () => {
              cycleTempSkillForRoster(state, selectedRosterId!);
              redrawToolbar();
            },
          );
          tempChip.x = sx;
          tempChip.y = sy;
          sx += 82;
          toolbarLayer.addChild(tempChip);
        }
      }
    }
  }

  // --- 人物详情弹窗 ---
  const detailOverlay = new PIXI.Container();
  detailOverlay.visible = false;

  /** 当前弹层的动画句柄，关闭时要停掉，否则范围格会一直在后台跳 */
  let detailStop: (() => void) | null = null;

  function hideUnitInfo(): void {
    detailStop?.();
    detailStop = null;
    detailOverlay.removeChildren().forEach((c) => c.destroy({ children: true }));
    detailOverlay.visible = false;
  }

  /** 弹出单位信息。我方角色、棋盘上的敌人预览走的是同一块面板 */
  function showUnitInfo(model: UnitInfoModel): void {
    hideUnitInfo();
    const { view, stop } = createUnitInfoOverlay(
      model, screen.screenWidth, screen.screenHeight, hideUnitInfo,
    );
    detailStop = stop;
    detailOverlay.addChild(view);
    detailOverlay.visible = true;
  }

  function showMercDetail(m: Character): void {
    showUnitInfo(characterInfoModel(state, m));
  }

  /** 地形信息卡走的是同一个弹层槽位，所以复用 `hideUnitInfo` 收尾 */
  function showTerrainInfo(terrainId: TerrainId): void {
    hideUnitInfo();
    detailOverlay.addChild(createTerrainInfoOverlay(
      terrainId, screen.screenWidth, screen.screenHeight, hideUnitInfo,
    ));
    detailOverlay.visible = true;
  }

  function redrawHand(): void {
    handLayer.removeChildren();
    const bench = benchCharacters(state);
    const sw = screen.screenWidth;
    const slotH = 80;

    const bgBar = new PIXI.Graphics();
    bgBar.beginFill(0x3a2a1a, 0.75);
    bgBar.drawRoundedRect(-4, -4, sw + 8, slotH + 8, 8);
    bgBar.endFill();
    handLayer.addChild(bgBar);

    if (bench.length === 0) {
      const tx = makeText('全部角色已上阵', 'caption', { fill: 0xcccccc });
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

      const token = createUnitToken(characterArtKey(m), 'player', imgSize);
      token.x = slotW / 2;
      token.y = slotH * 0.38;
      c.addChild(token);

      const nameTx = makeText(m.name, 'caption', {
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
      attachPress(c);
      if (isSelected) attachGlowRing(c, slotW, slotH).setActive(true);
      c.on('pointertap', () => {
        selectedRosterId = m.rosterId;
        deployTool = 'unit';
        terrainPickId = null;
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
      const infoTx = makeText('i', 'caption', { fill: 0xffffff, fontSize: 10, fontWeight: 'bold' });
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

  // ---- 开打按钮 ----
  // 扫荡改到冒险页整章入口，布阵页只负责开打。
  const fh = 46;
  const btnW = fightW;

  /**
   * Boss 空手上阵要二次确认。
   *
   * 模拟里 Boss 裸打胜率 2.3%——这基本是必输。改成纯人工之后，一局 Boss 要打 2~3 分钟，
   * 发现「原来我该在商店买药」的代价从一分钟涨到三分钟，而这个信息在开打前是完全可得的。
   * 不改数值：自动代打的 2.3% 是下限而非玩家的真实水平，人工模式下会走位、会集火，
   * 现在按自动代打胜率去削 Boss，等玩家真的上手就削过头了。缺的只是一句话，不是数字。
   */
  const bossNodeNow = currentNode(state).kind === 'boss';
  const potionCount = Object.values(run.potions).reduce((a, b) => a + b, 0);
  const needsPotionWarning = bossNodeNow && potionCount === 0;
  let warned = false;

  const fightC = makeButton(needsPotionWarning ? '开始战斗（无药剂）' : '开始战斗', () => {
    if (needsPotionWarning && !warned) {
      warned = true;
      callbacks.onWarn?.('Boss 战没带药剂，胜算极低。再点一次仍要开打');
      return;
    }
    callbacks.onStartBattle('manual');
  }, {
    variant: 'primary',
    width: btnW,
    height: fh,
    fontSize: needsPotionWarning ? 13 : 15,
    radius: 10,
  });
  fightC.x = fightX;
  fightC.y = fightY;
  root.addChild(fightC);

  root.addChild(settingsOverlay);
  root.addChild(detailOverlay);

  return root;
}

