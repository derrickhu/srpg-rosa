import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import type { PixiHost } from '@/boot/createPixiApp';
import type { BattleEvent, Faction, SkillKind, UnitKind, UnitState, Vec2 } from '@/battle/types';
import type { BattleSim, BattleStep } from '@/battle/engine';
import { effectiveUnitDef } from '@/battle/effectiveUnit';
import { gridSize } from '@/battle/grid';
import type { TerrainGrid } from '@/battle/grid';
import { computeBoardLayout } from '@/view/boardLayout';
import { UNIT_DEFS } from '@/data/unitDefs';
import { POTION_DEFS } from '@/data/potionCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import {
  ATTACK_VFX,
  CHARGE_VFX,
  SKILL_VFX,
  recipeAnimSets,
  vfxSetsForKinds,
  type FlashDef,
  type PropBurstDef,
  type VfxRecipe,
} from '@/data/vfxCatalog';
import { emitSparks } from '@/view/battle/vfxSparks';
import { flyProjectile } from '@/view/battle/vfxProjectile';
import {
  spawnCombatFloat,
  spawnRoundBanner,
  spawnSkillNameTag,
  type CombatFloatHost,
} from '@/view/battle/combatFloatText';
import { C } from '@/view/mvpTheme';
import { createUnitOverhead, type UnitOverheadHandle } from '@/view/unitOverhead';
import {
  createTerrainBadge,
  createTerrainCell,
  createUnitToken,
  createBackground,
  createUiIcon,
} from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';
import { AssetManager } from '@/core/AssetManager';
import {
  createAnimatedUnit,
  playFxAnimation,
  unitHeadLocalY,
  type AnimatedUnitHandle,
} from '@/view/AnimatedUnit';
import { hasAnimSet } from '@/view/animSets';
import {
  createManualTurnUi,
  type AttackButtonState,
  type ManualPhase,
  type ManualTurnUi,
  type SkillButtonSpec,
  type SkillButtonState,
} from '@/view/battle/manualTurnUi';
import type { SkillSlot } from '@/battle/skills';
import type { PendingTurn } from '@/battle/engine';
import {
  dangerMoveCellsForMover,
  enemiesThreateningCell,
} from '@/battle/threatMap';
import { battleUnitInfoModel } from '@/view/unitInfoModel';
import { createUnitInfoOverlay } from '@/view/unitInfoPanel';
import type { SkillDef } from '@/battle/types';

export interface PlaybackScreen {
  screenWidth: number;
  screenHeight: number;
}

export interface PlaybackState {
  nodeLabel: string;
  gold: number;
  /** 本局药剂库存（战斗中可用） */
  potions: Record<string, number>;
  /** 使用药剂后同步扣减 run 库存 */
  onConsumePotion: (potionId: string) => void;
  /** 无尽：待机拾取后写入 run 库存。有这个回调时药剂栏会把 0 库存的瓶子也画出来 */
  onPickupPotion?: (potionId: string) => void;
  /** 无尽第二波起不能回布阵：站位已经带过来了，回去等于拆掉这一局 */
  allowReturnDeploy?: boolean;
}

export interface PlaybackCallbacks {
  onComplete: (winner: Faction) => void;
  onHome: () => void;
  onReturnDeploy: () => void;
}

function cellCenter(originX: number, originY: number, cell: number, p: Vec2): { x: number; y: number } {
  return {
    x: originX + p.x * cell + (cell - 2) / 2,
    y: originY + p.y * cell + (cell - 2) / 2,
  };
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
 * 按技能 id 指定的序列帧特效（add 混合，见 src/view/animSets.ts）。
 * 本场战斗会用到的动画集 id：单位外观（Boss 用 animSet 覆盖 defId）+ 特效序列帧。
 * 供进战前 ensureAnimSets 预取，避免特效因图集未就绪而回退静态贴图。
 *
 * 技能特效要按**两条**线收集：显式配的 `battleSkill`，以及兵种默认技能——
 * 敌方杂兵的 battleSkill 是空的，AI 却会通过 effectiveUnitDef 回退到默认技能真的放出来。
 * 只扫 battleSkill 的话，杂兵放旋风斩时图集还没下载，特效就静默降级了。
 */
export function animSetsForUnits(units: readonly UnitState[]): string[] {
  const ids = new Set<string>();
  for (const u of units) {
    ids.add(u.animSet ?? u.defId);
    // 普攻特效按兵种原型预取（近战斩/箭命中等）
    for (const id of recipeAnimSets(ATTACK_VFX[u.defId] ?? ATTACK_VFX.sword)) ids.add(id);
    if (u.faction === 'player') {
      // 我方还要预取职业默认技能 + 冲锋光环
      for (const id of vfxSetsForKinds([u.defId])) ids.add(id);
    }
    // 主槽 / 临时槽 / 敌方皮肤：按实际挂上的技能预取（漏掉临时技能会静默退回静态贴图）
    for (const sk of [u.battleSkill, u.tempSkill]) {
      if (!sk) continue;
      const vfxKey = sk.vfxId ?? sk.id;
      const recipe = SKILL_VFX[vfxKey] ?? SKILL_VFX[sk.id];
      if (recipe) for (const id of recipeAnimSets(recipe)) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * 战斗回放（边模拟边播）：
 * - 人工模式下轮到玩家单位就停下等指令，交互层见 `battle/manualTurnUi`；
 * - 自动模式全程播 AI 的行动；
 * - 两种模式共有：倍速 x1/x2、跳过、战斗中用药。
 */
export function createBattlePlaybackView(
  app: PixiHost,
  sim: BattleSim,
  initialUnits: UnitState[],
  terrain: TerrainGrid,
  screen: PlaybackScreen,
  callbacks: PlaybackCallbacks,
  gameState: PlaybackState,
): PIXI.Container {
  const root = new PIXI.Container();
  const { w: GW, h: GH } = gridSize(terrain);
  const { cell, originX, originY } = computeBoardLayout(screen, GW, GH);
  const sw = screen.screenWidth;
  const sh = screen.screenHeight;

  // --- 回放控制状态 ---
  let speedMul = 1;
  let skipping = false;
  let completed = false;
  /** 人工操作 UI，自动模式下为 null */
  let manualUi: ManualTurnUi | null = null;
  /**
   * 切托管时 AI 当场接手打完的那一步，等主循环来播。
   *
   * 不在按钮回调里直接 await 播放：那会和主循环并发跑同一套动画（同一个单位可能
   * 一边被接手协程移动、一边被主循环播下一个事件），画面会串。事件产生的时机由
   * 引擎决定，播放的时机只归主循环——单一播放者是这套回放能保持顺序的前提。
   */
  let takeOverStep: BattleStep | null = null;

  function dur(ms: number): number {
    return ms / speedMul;
  }

  function awaitEase(ms: number, onProgress: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      if (skipping) {
        onProgress(1);
        resolve();
        return;
      }
      let acc = 0;
      const step = (): void => {
        acc += app.ticker.deltaMS;
        const k = skipping ? 1 : Math.min(1, acc / ms);
        const e = 1 - (1 - k) ** 2;
        onProgress(e);
        if (k >= 1) {
          app.ticker.remove(step);
          resolve();
        }
      };
      app.ticker.add(step);
    });
  }

  const bgLayer = createBackground(sw, sh);
  const gridLayer = new PIXI.Container();
  const dropLayer = new PIXI.Container();
  const rangeLayer = new PIXI.Container();
  const tokenLayer = new PIXI.Container();
  /** 棋盘点击接收层，夹在棋子和特效之间（见 manualTurnUi 的 inputLayer 说明） */
  const inputLayer = new PIXI.Container();
  const fxLayer = new PIXI.Container();
  root.addChild(bgLayer);
  root.addChild(gridLayer);
  root.addChild(dropLayer);
  root.addChild(rangeLayer);
  root.addChild(tokenLayer);
  root.addChild(inputLayer);
  root.addChild(fxLayer);

  // --- 设置按钮（左上角齿轮） ---
  const settingsBtnSize = 36;
  const settingsBtn = new PIXI.Container();
  const settingsBg = new PIXI.Graphics();
  settingsBg.beginFill(0x000000, 0.35);
  settingsBg.drawRoundedRect(0, 0, settingsBtnSize, settingsBtnSize, 8);
  settingsBg.endFill();
  settingsBtn.addChild(settingsBg);
  const gear = createUiIcon('icon_gear', settingsBtnSize - 8);
  if (gear) {
    gear.x = 4;
    gear.y = 4;
    settingsBtn.addChild(gear);
  }
  settingsBtn.x = 8;
  settingsBtn.y = 6;
  settingsBtn.eventMode = 'static';
  settingsBtn.cursor = 'pointer';
  settingsBtn.hitArea = new PIXI.Rectangle(0, 0, settingsBtnSize, settingsBtnSize);

  // --- 顶部：回合数 ---
  const roundTx = makeText('准备战斗', 'combatLabel', { fill: 0xffffff });
  roundTx.anchor.set(0.5, 0.5);
  const roundBg = new PIXI.Graphics();
  const roundLabelW = 120;
  const roundLabelH = 28;
  roundBg.beginFill(0x000000, 0.4);
  roundBg.drawRoundedRect(0, 0, roundLabelW, roundLabelH, 8);
  roundBg.endFill();
  roundBg.x = Math.floor((sw - roundLabelW) / 2);
  roundBg.y = 8;
  root.addChild(roundBg);
  roundTx.x = roundBg.x + roundLabelW / 2;
  roundTx.y = roundBg.y + roundLabelH / 2;
  root.addChild(roundTx);

  function setRoundLabel(): void {
    roundTx.text = `${gameState.nodeLabel} · 第 ${Math.max(1, sim.getRound())} 回合`;
  }

  // 开场提示（几秒后淡出）。两种开局说两句不同的话：手动要说清一回合能做几件事，
  // 托管要让玩家知道方向盘随时拿得回来，否则他只会盯着一场自己插不上手的战斗。
  {
    const openingHint = sim.isAuto()
      ? 'AI 代打中 · 右上角「接手」随时接管'
      : '移动 / 技能 / 普攻各一次 · 右上角可切托管';
    const hintTx = makeText(openingHint, 'combatLabel', {
      fill: 0xffe08a, fontSize: 13,
      stroke: 0x000000, strokeThickness: 3,
    });
    hintTx.anchor.set(0.5, 0);
    hintTx.x = sw / 2;
    hintTx.y = roundBg.y + roundLabelH + 6;
    root.addChild(hintTx);
    void (async () => {
      await awaitEase(3500, () => {});
      await awaitEase(500, (k) => { hintTx.alpha = 1 - k; });
      if (!hintTx.destroyed) {
        root.removeChild(hintTx);
        hintTx.destroy();
      }
    })();
  }

  // --- 金币（设置按钮下方） ---
  {
    const goldIconSize = 22;
    const goldValueTx = makeText(`${gameState.gold}`, 'uiStrong', { fill: 0xffffff });
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
  }

  // --- 右上角：倍速 + 跳过 ---
  const speedBtnW = 46;
  const ctrlH = 30;
  const speedBtn = new PIXI.Container();
  const speedBg = new PIXI.Graphics();
  const speedLbl = makeText('x1', 'uiStrong', { fill: 0xffffff });
  speedLbl.anchor.set(0.5);
  speedLbl.x = speedBtnW / 2;
  speedLbl.y = ctrlH / 2;
  function drawSpeedBtn(): void {
    speedBg.clear();
    speedBg.lineStyle(1.5, speedMul > 1 ? 0x52c4dc : 0x888888, 1);
    speedBg.beginFill(speedMul > 1 ? 0x2a7a8c : 0x000000, speedMul > 1 ? 0.85 : 0.4);
    speedBg.drawRoundedRect(0, 0, speedBtnW, ctrlH, 10);
    speedBg.endFill();
    speedLbl.text = `x${speedMul}`;
  }
  drawSpeedBtn();
  speedBtn.addChild(speedBg);
  speedBtn.addChild(speedLbl);
  speedBtn.x = sw - speedBtnW - 66;
  speedBtn.y = 8;
  speedBtn.eventMode = 'static';
  speedBtn.cursor = 'pointer';
  speedBtn.hitArea = new PIXI.Rectangle(0, 0, speedBtnW, ctrlH);
  speedBtn.on('pointertap', () => {
    speedMul = speedMul >= 2 ? 1 : 2;
    drawSpeedBtn();
  });
  root.addChild(speedBtn);

  const skipBtnW = 54;
  const skipBtn = new PIXI.Container();
  const skipBg = new PIXI.Graphics();
  skipBg.lineStyle(1.5, 0x888888, 1);
  skipBg.beginFill(0x000000, 0.4);
  skipBg.drawRoundedRect(0, 0, skipBtnW, ctrlH, 10);
  skipBg.endFill();
  skipBtn.addChild(skipBg);
  const skipLbl = makeText('跳过', 'ui', { fill: 0xffffff, fontSize: 13 });
  skipLbl.anchor.set(0.5);
  skipLbl.x = skipBtnW / 2;
  skipLbl.y = ctrlH / 2;
  skipBtn.addChild(skipLbl);
  skipBtn.x = sw - skipBtnW - 8;
  skipBtn.y = 8;
  skipBtn.eventMode = 'static';
  skipBtn.cursor = 'pointer';
  skipBtn.hitArea = new PIXI.Rectangle(0, 0, skipBtnW, ctrlH);
  // 跳过 = 把剩下的交给 AI 打完（含当前正在等指令的那个单位，见 sim.runToEnd）。
  // 人工模式下这也是「这局我不想打了，让它自己跑完」的出口。
  skipBtn.on('pointertap', () => {
    if (skipping || completed) return;
    skipping = true;
    manualUi?.hide();
    // 正在等指令时必须解开那个 await，否则协程挂死、战场彻底不动（见 abortWait）
    manualUi?.abortWait();
  });
  root.addChild(skipBtn);

  // --- 托管开关：战斗中随时在「自己打」和「AI 代打」之间来回切 ---
  //
  // 摆在这里而不是只在开局选一次，是因为这两种玩法解决的是**同一局里不同段落**的问题：
  // 前半场清杂兵没有任何决策，让 AI 走；Boss 起手或残局需要走位和集火时收回来自己打。
  // 逼玩家开局二选一的话，他为了那三回合的关键操作，得把前面十几回合也一步步点完。
  //
  // 标签用动词写「点下去会发生什么」而不是当前状态：状态由配色表达（托管中高亮），
  // 而写「自动/手动」时玩家永远要先猜这是当前值还是切换目标。
  const pilotBtnW = 68;
  const pilotBtn = new PIXI.Container();
  const pilotBg = new PIXI.Graphics();
  const pilotLbl = makeText('托管', 'ui', { fill: 0xffffff, fontSize: 13 });
  pilotLbl.anchor.set(0.5);
  pilotLbl.x = pilotBtnW / 2;
  pilotLbl.y = ctrlH / 2;
  function drawPilotBtn(): void {
    const auto = sim.isAuto();
    pilotBg.clear();
    pilotBg.lineStyle(1.5, auto ? 0x52c4dc : 0x888888, 1);
    pilotBg.beginFill(auto ? 0x2a7a8c : 0x000000, auto ? 0.85 : 0.4);
    pilotBg.drawRoundedRect(0, 0, pilotBtnW, ctrlH, 10);
    pilotBg.endFill();
    pilotLbl.text = auto ? '接手' : '托管';
  }
  drawPilotBtn();
  pilotBtn.addChild(pilotBg);
  pilotBtn.addChild(pilotLbl);
  pilotBtn.x = sw - pilotBtnW - 8;
  pilotBtn.y = skipBtn.y + ctrlH + 6;
  pilotBtn.eventMode = 'static';
  pilotBtn.cursor = 'pointer';
  pilotBtn.hitArea = new PIXI.Rectangle(0, 0, pilotBtnW, ctrlH);
  pilotBtn.on('pointertap', () => {
    if (skipping || completed) return;
    const toAuto = !sim.isAuto();
    // 切到托管时引擎会当场把手上这个单位打完，事件交给主循环去播（见 run）。
    // 已经结算的动作不回滚：玩家从下一个该他动的单位开始接手。
    const step = sim.setAuto(toAuto);
    if (step.events.length > 0) takeOverStep = step;
    drawPilotBtn();
    if (toAuto) {
      manualUi?.hide();
      manualUi?.abortWait();
    }
  });
  root.addChild(pilotBtn);

  // --- 单位信息面板 ---
  //
  // 和布阵页点开的是同一块面板（`unitInfoPanel`）。战斗里最需要它：
  // 「这个怪还剩多少血、攻击多高、带什么招、身上挂着什么」决定了这一步走哪，
  // 而这些原来只能靠头顶血条猜。看面板不改变任何战局状态，所以两种模式都允许，
  // 自动战斗时也能点开——那时候玩家正是在旁观学习。
  const infoOverlay = new PIXI.Container();
  infoOverlay.visible = false;
  let infoStop: (() => void) | null = null;

  function hideUnitInfo(): void {
    infoStop?.();
    infoStop = null;
    infoOverlay.removeChildren().forEach((c) => c.destroy({ children: true }));
    infoOverlay.visible = false;
  }

  function showUnitInfoAt(cell: Vec2): void {
    const hitUid = unitUidAtCell(cell);
    const u = hitUid ? sim.getUnit(hitUid) : null;
    if (!u) return;
    hideUnitInfo();
    const { view, stop } = createUnitInfoOverlay(
      battleUnitInfoModel(u, { showCooldown: true }), sw, sh, hideUnitInfo,
    );
    infoStop = stop;
    infoOverlay.addChild(view);
    infoOverlay.visible = true;
  }

  // --- 设置面板 ---
  const settingsOverlay = new PIXI.Container();
  settingsOverlay.visible = false;
  settingsBtn.on('pointertap', () => { settingsOverlay.visible = !settingsOverlay.visible; });

  {
    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.5);
    dim.drawRect(0, 0, sw, sh);
    dim.endFill();
    dim.eventMode = 'static';
    dim.on('pointertap', () => { settingsOverlay.visible = false; });
    settingsOverlay.addChild(dim);

    const panelW = Math.min(280, sw - 40);
    const allowDeploy = gameState.allowReturnDeploy !== false;
    const panelH = allowDeploy ? 220 : 168;
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

    const titleTx = makeText('设置', 'title', { fill: 0x3a3a2a });
    titleTx.anchor.set(0.5, 0);
    titleTx.x = panelW / 2;
    titleTx.y = 16;
    panel.addChild(titleTx);

    const btnW = panelW - 32;
    let by = 50;

    const btnContinue = makeButton('继续战斗', () => { settingsOverlay.visible = false; },
      { variant: 'primary', width: btnW, height: 42, fontSize: 15 });
    btnContinue.x = 16; btnContinue.y = by; panel.addChild(btnContinue); by += 52;

    if (allowDeploy) {
      const btnDeploy = makeButton('返回布阵', () => { settingsOverlay.visible = false; callbacks.onReturnDeploy(); },
        { variant: 'secondary', width: btnW, height: 42, fontSize: 15 });
      btnDeploy.x = 16; btnDeploy.y = by; panel.addChild(btnDeploy); by += 52;
    }

    const btnHome = makeButton('回到首页', () => { settingsOverlay.visible = false; callbacks.onHome(); },
      { variant: 'ghost', width: btnW, height: 42, fontSize: 15 });
    btnHome.x = 16; btnHome.y = by; panel.addChild(btnHome);

    settingsOverlay.addChild(panel);
  }

  // --- 棋盘 ---
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const px = originX + x * cell;
      const py = originY + y * cell;
      const ter = terrain[y]![x]!;
      const tc = createTerrainCell(ter, cell);
      tc.x = px;
      tc.y = py;
      gridLayer.addChild(tc);

      // 战斗中也挂角标：伤害飘字说「森林 -25%」，玩家要能立刻在棋盘上找到那一格，
      // 两者对上了这条规则才真的学会。角标在左上角，单位居中，不打架。
      const badge = createTerrainBadge(ter, cell);
      if (badge) {
        badge.x += px;
        badge.y += py;
        badge.alpha = 0.85;
        gridLayer.addChild(badge);
      }
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
  /** 普攻特效按兵种原型取（见 vfxCatalog.ATTACK_VFX），所以要记住谁是什么兵种 */
  const defIdByUid = new Map<string, UnitKind>();
  /**
   * 敌方技能皮肤：结算 id（如 savage_roar）→ 专属特效键（bloodfang_roar）。
   * 键是 `${uid}:${skillId}`，不能按 uid 一把梭——否则放临时技能也会误播主技能特效。
   */
  const skillVfxOverride = new Map<string, string>();
  for (const u of initialUnits) {
    posByUid.set(u.uid, { ...u.pos });
    defIdByUid.set(u.uid, u.defId);
    for (const sk of [u.battleSkill, u.tempSkill]) {
      if (sk?.vfxId) skillVfxOverride.set(`${u.uid}:${sk.id}`, sk.vfxId);
    }
  }

  /**
   * 离施法者最远的那个命中目标。射线特效要拉到这里——拉到第一个目标的话，
   * 光束会在队列中间断掉，而技能明明打穿了后面那几个。
   */
  function farthestHitUid(
    casterUid: string,
    hits: readonly { target: string }[],
  ): string | undefined {
    const from = posByUid.get(casterUid);
    if (!from || hits.length === 0) return hits[0]?.target;
    let best: string | undefined;
    let bestD = -1;
    for (const h of hits) {
      const p = posByUid.get(h.target);
      if (!p) continue;
      const d = Math.abs(p.x - from.x) + Math.abs(p.y - from.y);
      if (d > bestD) {
        bestD = d;
        best = h.target;
      }
    }
    return best ?? hits[0]?.target;
  }

  const tokens = new Map<string, PIXI.Container>();
  const tokenOverheads = new Map<string, UnitOverheadHandle>();
  const animByUid = new Map<string, AnimatedUnitHandle>();
  const dropMarkers = new Map<string, PIXI.Container>();

  function dropKey(p: Vec2): string {
    return `${p.x},${p.y}`;
  }

  function showDropMarker(pos: Vec2, potionId: string): void {
    const key = dropKey(pos);
    if (dropMarkers.has(key)) return;
    const marker = new PIXI.Container();
    const at = cellCenter(originX, originY, cell, pos);
    marker.x = at.x;
    marker.y = at.y;
    const size = Math.max(18, Math.floor(cell * 0.55));
    const icon = createUiIcon(`icon_potion_${potionId}`, size);
    if (icon) {
      icon.x = -size / 2;
      icon.y = -size / 2;
      marker.addChild(icon);
    } else {
      const fallback = new PIXI.Graphics();
      fallback.beginFill(0xc86ad4, 0.9);
      fallback.drawCircle(0, 0, size / 2);
      fallback.endFill();
      marker.addChild(fallback);
    }
    dropLayer.addChild(marker);
    dropMarkers.set(key, marker);
  }

  function hideDropMarker(pos: Vec2): void {
    const key = dropKey(pos);
    const marker = dropMarkers.get(key);
    if (!marker) return;
    dropLayer.removeChild(marker);
    marker.destroy({ children: true });
    dropMarkers.delete(key);
  }

  for (const u of initialUnits) {
    const ed = effectiveUnitDef(u, UNIT_DEFS);
    const c = new PIXI.Container();
    const setId = u.animSet ?? u.defId;
    const animHandle = hasAnimSet(setId) ? createAnimatedUnit(setId, u.faction, cell) : null;
    if (animHandle) animByUid.set(u.uid, animHandle);
    const body = animHandle ? animHandle.view : createUnitToken(setId, u.faction, cell);
    body.y = Math.max(6, cell * 0.07);
    const bossScale = u.boss ? 1.3 : 1;
    if (u.boss) body.scale.set(bossScale);
    const oh = createUnitOverhead({
      maxHp: ed.maxHp,
      currentHp: u.hp,
      professionName: u.faction === 'enemy' ? (u.displayName ?? UNIT_DEFS[u.defId].name) : UNIT_DEFS[u.defId].name,
      faction: u.faction,
      cell,
    });
    // 血条底边贴在身体头顶上方；body.scale 会把头顶一起放大，所以 headY 也要乘。
    // 空隙用固定像素而不是再乘 cell——小格子上多留一点反而更干净。
    oh.root.y = body.y + unitHeadLocalY(setId, cell) * bossScale - 4;
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
    if (cells.length === 0 || skipping) return;
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
    await awaitEase(dur(durationMs), (k) => {
      rangeG.alpha = 0.42 + Math.sin(k * Math.PI) * 0.48;
    });
    rangeLayer.removeChild(rangeG);
    rangeG.destroy();
  }

  const floatHost = (): CombatFloatHost => ({
    layer: fxLayer,
    skipping: () => skipping,
    dur,
    awaitEase,
  });

  /** 伤害 / 治疗 / 用药 —— 样式见 combatFloatText */
  function floatDamage(x: number, y: number, dmg: number): void {
    spawnCombatFloat(floatHost(), x, y, `-${dmg}`, 'damage');
  }
  function floatHeal(x: number, y: number, amount: number): void {
    spawnCombatFloat(floatHost(), x, y, `+${amount}`, 'heal');
  }
  function floatDot(x: number, y: number, dmg: number, source: 'poison' | 'terrain'): void {
    spawnCombatFloat(floatHost(), x, y, source === 'poison' ? `毒-${dmg}` : `-${dmg}`, 'poison');
  }
  /**
   * 目标所站地形对这一下的影响，飘在伤害数字**下方**。
   * 森林 -25% 必须显式说出来，否则只是一个玩家无从比较的数字。
   */
  /** 目标侧承伤地形（森林 -25% 等） */
  function floatTerrainNote(x: number, y: number, note: string | undefined): void {
    if (!note) return;
    spawnCombatFloat(floatHost(), x, y, note, 'terrain');
  }
  /** 出手侧攻击地形（高地 +25%）：和技能名分开飘，不拼进同一串字 */
  function floatAtkTerrain(x: number, y: number, note: string | undefined): void {
    if (!note) return;
    spawnCombatFloat(floatHost(), x, y, note, 'terrainBuff');
  }
  /**
   * 条件触发的词条（处决）：飘在伤害数字上方。
   *
   * 用 `buff` 的亮金而不是地形那档小字——地形是「站位造成的常态修正」，
   * 词条触发是「这一下发生了别的事」，两者混同一档的话玩家学不会区分。
   */
  function floatModNote(x: number, y: number, note: string | undefined): void {
    if (!note) return;
    spawnCombatFloat(floatHost(), x, y - 26, note, 'buff');
  }
  function floatUtility(x: number, y: number, msg: string): void {
    spawnCombatFloat(floatHost(), x, y, msg, 'utility');
  }
  function showSkillLabel(x: number, y: number, name: string): void {
    spawnSkillNameTag(floatHost(), x, y, name);
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
    if (skipping) return;
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
      await awaitEase(dur(400), (k) => {
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

  /**
   * 播一段闪光（施放或命中）。序列帧 + 代码火花，两者都缺才回退静态贴图。
   *
   * `from`/`to` 是格子中心的屏幕坐标：`aimed` 用它们求朝向，`beam` 还要用它们求长度。
   */
  function playFlash(
    def: FlashDef,
    from: { x: number; y: number },
    to: { x: number; y: number } | undefined,
  ): void {
    if (skipping) return;
    const at = def.anchor === 'caster' ? from : (to ?? from);
    // 朝向永远是「攻击者 → 目标」，与锚点无关。素材一律画成朝右，所以这个角度就是 rotation。
    // 按「锚点 → 另一端」算过一版，锚在目标身上时方向正好翻转，表现是矛尖朝着自己人扎。
    const dx = (to?.x ?? from.x) - from.x;
    const dy = (to?.y ?? from.y) - from.y;
    const aimRad = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
    const size = Math.max(cell * def.cells, 56);

    let played = 0;
    if (def.mode === 'beam') {
      // 射线至少拉一格，否则贴脸的单体命中会缩成一个点
      const len = Math.max(cell, Math.hypot(dx, dy) + cell * 0.5);
      played = playFxAnimation(fxLayer, at.x, at.y, def.set, def.set, size, {
        rotation: aimRad,
        lengthPx: len,
        alpha: def.alpha,
      });
    } else {
      played = playFxAnimation(fxLayer, at.x, at.y, def.set, def.set, size, {
        rotation: def.mode === 'aimed' ? aimRad : 0,
        alpha: def.alpha,
      });
    }

    if (def.sparks) {
      // 火花从「挨打的那一端」冒出来，哪怕特效本体锚在施法者身上（自身 AoE 除外）
      const sp = def.anchor === 'caster' && def.mode === 'burst' ? at : (to ?? at);
      emitSparks(fxLayer, sp.x, sp.y, def.sparks, aimRad);
    }

    // 图集还没下载完（首启进战、CDN 慢）时序列帧会返回 0，那就用老的静态贴图兜底，
    // 至少还有个东西在闪。火花是代码画的，这条路上照样有。
    if (played <= 0) showFxSprite(at.x, at.y, 'slash', size);
  }

  /** 实体道具 / 光效放大淡出（号角头顶光、药草十字） */
  async function playPropBurst(
    def: PropBurstDef,
    from: { x: number; y: number },
    to: { x: number; y: number } | undefined,
  ): Promise<void> {
    if (skipping) return;
    const at = def.anchor === 'target' ? (to ?? from) : from;
    const y = at.y + cell * (def.yOffsetCells ?? 0);
    if (def.sparks) emitSparks(fxLayer, at.x, y, def.sparks, 0);
    if (!AssetManager.isBundleLoaded('fx')) return;
    const tex = AssetManager.texture('fx', def.sprite);
    if (!tex || tex === PIXI.Texture.WHITE) return;
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    if (def.blend === 'add') sp.blendMode = PIXI.BLEND_MODES.ADD;
    const base = Math.max(cell * def.cells, 48);
    const unit = base / Math.max(tex.width, tex.height);
    sp.scale.set(unit * def.scaleFrom);
    sp.position.set(at.x, y);
    sp.alpha = 1;
    fxLayer.addChild(sp);
    await awaitEase(dur(def.durationMs), (k) => {
      if (sp.destroyed) return;
      const s = def.scaleFrom + (def.scaleTo - def.scaleFrom) * k;
      sp.scale.set(unit * s);
      sp.alpha = k < 0.72 ? 1 : 1 - (k - 0.72) / 0.28;
    });
    if (!sp.destroyed) {
      fxLayer.removeChild(sp);
      sp.destroy();
    }
  }

  /**
   * 播一份特效配方：施放闪光 → 飞行弹体 → 命中闪光 / 道具放大。
   *
   * 有飞行段时会 **await 抵达**，调用方据此把伤害数字排到箭落到之后——
   * 这一点是「射中了」和「同时闪一下」的全部区别。
   *
   * `onPass` 给贯穿技能用：弹体飞过某个目标时触发一次（通常是飘伤害 + 命中闪光）。
   * `onTargets` 给「分头扑」技能（蜂群）：每个目标各飞一发。
   */
  async function playRecipe(
    recipe: VfxRecipe,
    from: { x: number; y: number },
    to: { x: number; y: number } | undefined,
    opts: {
      onPass?: { at: { x: number; y: number }; run: () => void }[];
      onTargets?: { at: { x: number; y: number }; run: () => void }[];
    } = {},
  ): Promise<void> {
    if (skipping) return;
    if (recipe.cast) playFlash(recipe.cast, from, to);

    if (recipe.propBurst) {
      await playPropBurst(recipe.propBurst, from, to);
    }

    if (recipe.travel && recipe.travelPerTarget && (opts.onTargets?.length ?? 0) > 0) {
      const size = Math.max(cell * recipe.travel.cells, 40);
      await Promise.all(
        (opts.onTargets ?? []).map(async (p, i) => {
          if (i > 0) await awaitEase(dur(40 * i), () => {});
          if (root.destroyed || skipping) return;
          await flyProjectile(fxLayer, from, p.at, recipe.travel!, size, {
            speedScale: speedMul,
            onArrive: () => {
              if (recipe.impact) playFlash(recipe.impact, from, p.at);
              p.run();
            },
          }).done;
        }),
      );
      return;
    }

    if (recipe.travel && to) {
      const size = Math.max(cell * recipe.travel.cells, 40);
      const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const waypoints = (opts.onPass ?? []).map((p) => ({
        atFraction: Math.min(0.98, Math.hypot(p.at.x - from.x, p.at.y - from.y) / dist),
        run: () => {
          if (recipe.impactPerHit && recipe.impact) playFlash(recipe.impact, from, p.at);
          p.run();
        },
      }));
      await flyProjectile(fxLayer, from, to, recipe.travel, size, {
        speedScale: speedMul,
        waypoints,
      }).done;
      // 普攻那种「只有一个落点」：抵达后播命中。贯穿的命中已经在途经时播过了
      if (!recipe.impactPerHit && recipe.impact) playFlash(recipe.impact, from, to);
      // 贯穿但没命中任何人（空放）时，仍在终点闪一下，否则玩家会以为技能没出去
      if (recipe.impactPerHit && (opts.onPass?.length ?? 0) === 0 && recipe.impact) {
        playFlash(recipe.impact, from, to);
      }
      return;
    }

    if (recipe.impact) playFlash(recipe.impact, from, to);
  }

  function hitShake(target: PIXI.Container): void {
    if (skipping) return;
    const origX = target.x;
    void (async () => {
      await awaitEase(dur(120), (k) => {
        const shake = Math.sin(k * Math.PI * 4) * 3 * (1 - k);
        target.x = origX + shake;
      });
      target.x = origX;
    })();
  }

  // ============ 底部 HUD：药剂栏（人工操作条由 manualTurnUi 挂在同一层） ============
  const hudLayer = new PIXI.Container();
  root.addChild(hudLayer);

  const potionBtns = new Map<string, { count: number; countLbl: PIXI.Text; container: PIXI.Container }>();
  /** 药剂栏顶边，人工操作条排在它上面 */
  let potionTopY = sh - 16;

  {
    const btnR = 26;
    const gapX = 12;
    const hudH = btnR * 2 + 26;
    const hudY = sh - hudH - 8;
    const potionIds = Object.keys(POTION_DEFS).filter((id) =>
      (gameState.potions[id] ?? 0) > 0 || !!gameState.onPickupPotion,
    );

    if (potionIds.length > 0) {
      potionTopY = hudY - 6;
      const totalW = potionIds.length * (btnR * 2 + gapX) - gapX;
      let bx = Math.max(8, Math.floor((sw - totalW) / 2));

      const hudBg = new PIXI.Graphics();
      hudBg.beginFill(0x000000, 0.4);
      hudBg.drawRoundedRect(bx - 10, hudY - 6, totalW + 20, hudH + 8, 14);
      hudBg.endFill();
      hudLayer.addChild(hudBg);

      for (const pid of potionIds) {
        const def = POTION_DEFS[pid]!;
        const c = new PIXI.Container();
        c.x = bx + btnR;
        c.y = hudY + btnR;

        const base = new PIXI.Graphics();
        base.lineStyle(2, C.ink, 1, 0);
        base.beginFill(C.panel, 0.94);
        base.drawRoundedRect(-btnR, -btnR, btnR * 2, btnR * 2, 10);
        base.endFill();
        c.addChild(base);

        // 三种药剂共用同一个瓶型、只有液体颜色不同，键名直接由 id 拼出来。
        // 之前这里是 emoji，不同机型画出来的瓶子形状不一，玩家没法把它和商店里的药剂对上号。
        const iconSize = btnR * 1.5;
        const icon = createUiIcon(`icon_potion_${pid}`, iconSize);
        if (icon) {
          icon.x = -iconSize / 2;
          icon.y = -iconSize / 2 - 4;
          c.addChild(icon);
        }

        const nameLbl = makeText(def.name, 'micro', { fill: 0xffffff });
        nameLbl.anchor.set(0.5, 0);
        nameLbl.y = btnR + 2;
        c.addChild(nameLbl);

        const countLbl = makeText(`×${gameState.potions[pid] ?? 0}`, 'caption', {
          fill: 0xffe08a, fontWeight: 'bold',
        });
        countLbl.anchor.set(0.5, 1);
        countLbl.y = btnR - 2;
        countLbl.x = btnR - 10;
        c.addChild(countLbl);

        c.eventMode = 'static';
        c.cursor = 'pointer';
        c.hitArea = new PIXI.Rectangle(-btnR, -btnR, btnR * 2, btnR * 2);
        c.on('pointertap', () => {
          const h = potionBtns.get(pid);
          if (!h || h.count <= 0 || completed || sim.isDone()) return;
          h.count -= 1;
          h.countLbl.text = `×${h.count}`;
          if (h.count <= 0) h.container.alpha = 0.45;
          gameState.onConsumePotion(pid);
          const evs = sim.usePotion(pid);
          renderPotionEvents(evs);
        });

        const startCount = gameState.potions[pid] ?? 0;
        if (startCount <= 0) c.alpha = 0.45;
        hudLayer.addChild(c);
        potionBtns.set(pid, { count: startCount, countLbl, container: c });
        bx += btnR * 2 + gapX;
      }

    }
  }

  // ============ 行动顺序条 ============
  /**
   * 跨回合出手预览：当前 + 本回合剩余 + 按速度估的下一回合……
   *
   * 只显示「本回合还没动的」时，回合末尾条子会缩成一两格，后面谁先动完全看不见，
   * 走进射程的决策就只能猜。预估段略降透明度，和本回合剩余区分开。
   */
  const orderStrip = new PIXI.Container();
  hudLayer.addChild(orderStrip);

  const ORDER_CARD_W = 40;
  const ORDER_CARD_H = 50;
  /** 顺序条整体高度，供人工操作条让位 */
  const ORDER_STRIP_H = ORDER_CARD_H + 8;
  /** 一屏最多几格；含跨回合预估 */
  const ORDER_SHOW = 8;
  orderStrip.y = potionTopY - ORDER_STRIP_H;

  function updateOrderStrip(currentUid: string | null): void {
    orderStrip.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (skipping || completed) return;
    const queue = sim.upcomingOrder(ORDER_SHOW, currentUid);
    if (queue.length === 0) return;

    // 本回合还剩几格（含当前）：之后的是下一回合预估
    const thisRoundCount = (currentUid ? 1 : 0) + sim.roundOrder().filter((id) => id !== currentUid).length;

    const gap = 4;
    const cards: PIXI.Container[] = [];
    queue.forEach((uid, idx) => {
      const u = sim.getUnit(uid);
      if (!u || u.hp <= 0) return;
      const isNow = uid === currentUid && idx === 0;
      const nextRound = idx >= thisRoundCount;
      const card = new PIXI.Container();

      // 当前行动者金底，其余按阵营深蓝 / 深红——要能一眼数出「接下来轮到几个敌人」
      const fill = isNow ? 0xffdd44 : (u.faction === 'player' ? 0x1e4c6e : 0x6e2420);
      const bg = new PIXI.Graphics();
      bg.lineStyle(isNow ? 2 : 1, isNow ? 0xfff4c0 : 0x000000, isNow ? 1 : 0.5);
      bg.beginFill(fill, isNow ? 1 : 0.85);
      bg.drawRoundedRect(0, 0, ORDER_CARD_W, ORDER_CARD_H, 7);
      bg.endFill();
      card.addChild(bg);

      // 头像用棋盘同一套 token，玩家不用在两种画法之间做二次对应
      const portrait = createUnitToken(u.animSet ?? u.defId, u.faction, ORDER_CARD_W - 4);
      portrait.x = ORDER_CARD_W / 2;
      portrait.y = ORDER_CARD_H / 2 - 6;
      card.addChild(portrait);

      // 名字优先用角色名（`displayName`），职业名只是兜底。
      // 一队里两个剑士时，「剑士 / 剑士」根本指不出是谁该动。
      const label = u.displayName ?? UNIT_DEFS[u.defId].name;
      const tx = makeText(label.slice(0, 4), 'combatLabel', {
        fill: isNow ? 0x2a2010 : 0xffffff,
        fontSize: 9,
      });
      tx.anchor.set(0.5, 1);
      tx.x = ORDER_CARD_W / 2;
      tx.y = ORDER_CARD_H - 2;
      card.addChild(tx);

      // 跨回合预估略淡，并在回合分界加一条细缝
      if (nextRound) card.alpha = 0.62;
      if (nextRound && idx === thisRoundCount && cards.length > 0) {
        const sep = new PIXI.Graphics();
        sep.beginFill(0xfff4c0, 0.55);
        sep.drawRoundedRect(-3, 6, 2, ORDER_CARD_H - 12, 1);
        sep.endFill();
        card.addChild(sep);
      }

      cards.push(card);
    });
    if (cards.length === 0) return;

    const totalW = cards.length * (ORDER_CARD_W + gap) - gap;
    let x = Math.floor((sw - totalW) / 2);
    for (const c of cards) {
      c.x = x;
      orderStrip.addChild(c);
      x += ORDER_CARD_W + gap;
    }
  }

  // ============ 人工回合 ============

  function unitUidAtCell(cell: Vec2): string | null {
    for (const u of sim.getUnits()) {
      if (u.hp > 0 && u.pos.x === cell.x && u.pos.y === cell.y) return u.uid;
    }
    return null;
  }

  function cellsOfUids(uids: readonly string[]): Vec2[] {
    const out: Vec2[] = [];
    for (const uid of uids) {
      const u = sim.getUnit(uid);
      if (u && u.hp > 0) out.push({ ...u.pos });
    }
    return out;
  }

  /**
   * 两个技能槽各一个按钮。
   *
   * 点不动的槽也留在条上：按钮消失了，玩家看不到「还有几回合能再放」，
   * 而这恰恰是决定这回合要不要保守走位的依据。状态交给按钮自己画。
   */
  function skillButtonSpecs(uid: string, pending: PendingTurn): SkillButtonSpec[] {
    const u = sim.getUnit(uid);
    if (!u) return [];
    const out: SkillButtonSpec[] = [];
    const slots: { slot: SkillSlot; def?: SkillDef; cd: number }[] = [
      { slot: 'main', def: u.battleSkill, cd: u.skillCd ?? 0 },
      { slot: 'temp', def: u.tempSkill, cd: u.tempSkillCd ?? 0 },
    ];
    for (const { slot, def, cd } of slots) {
      const spec = def ? getSkillSpec(def.id) : undefined;
      if (!spec || spec.timing === 'passive') continue;
      const state: SkillButtonState = pending.didSkill ? 'spent'
        : cd > 0 ? 'cooldown'
          : !sim.skillAiming(uid, slot) ? 'noTarget'
            : 'ready';
      out.push({ slot, iconKey: `skill_${spec.id}`, name: spec.name, state, cooldown: cd });
    }
    return out;
  }

  /**
   * 让玩家操作一个单位直到它的回合结束。
   *
   * 循环每轮都重新问引擎「现在还能做什么」，而不是自己推算状态。移动会改变可攻击目标、
   * 技能会改变存活单位，任何本地缓存的可选项都会在某一步之后变成谎言，
   * 而这类谎言的表现是「点了没反应」——玩家只会认为游戏卡了。
   */
  async function runPlayerTurn(uid: string): Promise<void> {
    const ui = manualUi;
    if (!ui) return;
    let phase: ManualPhase = 'act';
    /** 正在瞄准的是哪个槽；`phase === 'aim'` 时必定非空 */
    let aimSlot: SkillSlot | null = null;
    while (!root.destroyed && !skipping) {
      const pending = sim.pending();
      if (!pending || pending.uid !== uid) break;
      const self = sim.getUnit(uid);
      if (!self || self.hp <= 0) break;

      const aiming = phase === 'aim' && aimSlot ? sim.skillAiming(uid, aimSlot) : null;
      if (phase === 'aim' && !aiming) phase = 'act';
      // 普攻瞄准时目标没了（被别人打死等）就退回行动态
      const attackables = sim.legalAttackTargets(uid);
      if (phase === 'attackAim' && (pending.didAttack || attackables.length === 0)) {
        phase = 'act';
      }
      const moveCells = pending.canMove ? sim.legalMoveCells(uid) : [];
      const units = sim.getUnits();
      // 危险格按「站到该格之后」算，和落地后威胁箭头同一口径（见 dangerMoveCellsForMover）
      const dangerMoveCells = pending.canMove
        ? dangerMoveCellsForMover(units, UNIT_DEFS, terrain, uid, moveCells)
        : [];
      // 威胁箭头只在「已经走位、还没出手」时画：选移动格阶段不画；
      // 移动后放了技能 / 普攻 / 待机（回合结束）也不再画。
      const showThreatArrows =
        phase === 'act' && pending.didMove && !pending.didSkill && !pending.didAttack;
      const threatFrom = showThreatArrows
        ? enemiesThreateningCell(
          units,
          UNIT_DEFS,
          terrain,
          self.pos,
          self.faction,
        ).map((e) => ({ ...e.pos }))
        : [];
      const attackButton: AttackButtonState = pending.didAttack
        ? 'spent'
        : (pending.canAttack ? 'ready' : 'noTarget');
      ui.update({
        pending,
        phase,
        activeCell: { ...self.pos },
        moveCells,
        dangerMoveCells,
        attackCells: cellsOfUids(attackables),
        skillRangeCells: aiming?.rangeCells ?? [],
        skillCandidateCells: cellsOfUids(aiming?.candidates ?? []),
        skillAimCells: aiming?.aimCells ?? [],
        threatFrom,
        skillButtons: skillButtonSpecs(uid, pending),
        attackButton,
      });
      updateOrderStrip(uid);

      const input = await ui.next();
      if (input.kind === 'abort' || root.destroyed || skipping) break;

      switch (input.kind) {
        case 'wait':
          sim.commandWait(uid);
          break;
        case 'undo':
          await playEvents(sim.commandUndoMove(uid).events);
          phase = 'act';
          aimSlot = null;
          break;
        case 'cancelAim':
          phase = 'act';
          aimSlot = null;
          break;
        case 'skill': {
          if (!pending.castableSlots.includes(input.slot)) break;
          const aim = sim.skillAiming(uid, input.slot);
          if (!aim) break;
          // 要选单位或选范围格 → 进瞄准；否则点按钮直接放
          const needsAim = aim.candidates.length > 0 || aim.aimCells.length > 0;
          if (!needsAim) {
            await playEvents(sim.commandSkill(uid, undefined, input.slot).events);
          } else {
            phase = 'aim';
            aimSlot = input.slot;
          }
          break;
        }
        case 'attack': {
          if (!pending.canAttack || attackables.length === 0) break;
          // 只有一个目标：点按钮就砍，少一次确认
          if (attackables.length === 1) {
            await playEvents(sim.commandAttack(uid, attackables[0]!).events);
            phase = 'act';
            aimSlot = null;
          } else {
            phase = 'attackAim';
            aimSlot = null;
          }
          break;
        }
        case 'cell': {
          const hitUid = unitUidAtCell(input.cell);
          if (phase === 'aim') {
            if (!aimSlot || !aiming) break;
            // 单体点名
            if (hitUid && aiming.candidates.includes(hitUid)) {
              await playEvents(sim.commandSkill(uid, hitUid, aimSlot).events);
              phase = 'act';
              aimSlot = null;
              break;
            }
            // 直线/AoE：点高亮范围格确认方向（穿透打整条线，不是点哪个敌人打哪个）
            const onAimCell = aiming.aimCells.some(
              (c) => c.x === input.cell.x && c.y === input.cell.y,
            );
            if (onAimCell) {
              await playEvents(
                sim.commandSkill(uid, undefined, aimSlot, { ...input.cell }).events,
              );
              phase = 'act';
              aimSlot = null;
            }
            break;
          }
          if (phase === 'attackAim') {
            if (hitUid && attackables.includes(hitUid)) {
              await playEvents(sim.commandAttack(uid, hitUid).events);
              phase = 'act';
            }
            break;
          }
          // 行动态仍可直接点敌人普攻（老手捷径）；按钮是防忘的主路径
          if (hitUid && pending.canAttack && attackables.includes(hitUid)) {
            await playEvents(sim.commandAttack(uid, hitUid).events);
            break;
          }
          // 点在人身上但打不着（自己人、已经出过手、够不到），
          // 那这一下的意图只能是「我想看看他」。原来这里会掉进 commandMove
          // 然后因为格子被占静默失败，等于点了没反应。
          if (hitUid) {
            showUnitInfoAt(input.cell);
            break;
          }
          if (pending.canMove) await playEvents(sim.commandMove(uid, input.cell).events);
          break;
        }
      }
    }
    ui.hide();
  }

  function floatStatusNote(x: number, y: number, text: string, tone: 'buff' | 'debuff'): void {
    spawnCombatFloat(floatHost(), x, y, text, tone);
  }

  function renderPotionEvents(evs: BattleEvent[]): void {
    for (const ev of evs) {
      if (ev.type === 'potion') {
        floatUtility(sw / 2, originY + 30, `使用 ${ev.name}`);
      } else if (ev.type === 'heal') {
        const tok = tokens.get(ev.target);
        if (tok) {
          floatHeal(tok.x, tok.y, ev.amount);
          tokenOverheads.get(ev.target)?.updateHp(ev.hpLeft);
        }
      } else if (ev.type === 'statusNote') {
        const tok = tokens.get(ev.target);
        if (tok) floatStatusNote(tok.x, tok.y, ev.text, ev.tone);
      }
    }
  }

  // ============ 事件回放 ============

  async function playEvent(ev: BattleEvent): Promise<void> {
    switch (ev.type) {
      case 'round': {
        setRoundLabel();
        await spawnRoundBanner(floatHost(), sw / 2, 56, `第 ${ev.round} 回合`);
        break;
      }
      case 'dot': {
        const tok = tokens.get(ev.uid);
        if (tok) {
          floatDot(tok.x, tok.y, ev.damage, ev.source);
          tokenOverheads.get(ev.uid)?.updateHp(ev.hpLeft);
          await awaitEase(dur(280), () => {});
        }
        break;
      }
      case 'moveRange': {
        await flashRangeCells(ev.cells, MOVE_RANGE_COLOR, 400);
        break;
      }
      case 'moveStep': {
        const tok = tokens.get(ev.uid);
        if (tok) {
          const dx = ev.to.x - ev.from.x;
          const dy = ev.to.y - ev.from.y;
          animByUid.get(ev.uid)?.playWalk(dx, dy);
          const fromC = cellCenter(originX, originY, cell, ev.from);
          const toC = cellCenter(originX, originY, cell, ev.to);
          tok.x = fromC.x;
          tok.y = fromC.y;
          await awaitEase(dur(150), (k) => {
            tok.x = fromC.x + (toC.x - fromC.x) * k;
            tok.y = fromC.y + (toC.y - fromC.y) * k;
          });
          posByUid.set(ev.uid, { ...ev.to });
        }
        break;
      }
      case 'skillCast': {
        await flashRangeCells(ev.rangeCells, skillRangeColor(ev.kind), 460);
        const caster = tokens.get(ev.uid);
        const cx = caster?.x ?? sw / 2;
        const cy = caster?.y ?? 120;
        const casterPos = posByUid.get(ev.uid);
        const firstTargetPos = ev.hits.length > 0 ? posByUid.get(ev.hits[0]!.target) : undefined;
        if (casterPos && firstTargetPos) {
          animByUid.get(ev.uid)?.playAttack(
            firstTargetPos.x - casterPos.x,
            firstTargetPos.y - casterPos.y,
          );
        }
        showSkillLabel(cx, cy - Math.max(42, cell * 0.6), ev.skillName);
        floatAtkTerrain(cx, cy - Math.max(22, cell * 0.32), ev.atkTerrainNote);

        const vfxKey = skillVfxOverride.get(`${ev.uid}:${ev.skillId}`) ?? ev.skillId;
        const recipe = SKILL_VFX[vfxKey] ?? SKILL_VFX[ev.skillId];
        const applyHitFx = (h: (typeof ev.hits)[number]): void => {
          tokenOverheads.get(h.target)?.updateHp(h.hpLeft);
          const tt = tokens.get(h.target);
          if (tt) {
            // 纯 buff/debuff（damage:0）不飘「0」、不抖——那是号角/缠足一类，不是失手
            if (h.damage > 0) {
              hitShake(tt);
              floatDamage(tt.x, tt.y, h.damage);
              floatTerrainNote(tt.x, tt.y, h.defTerrainNote);
              floatModNote(tt.x, tt.y, h.modNote);
            }
          }
        };

        if (recipe?.travel && recipe.travelPerTarget) {
          // 蜂群：每个敌人各飞一发蜜蜂团，落到才飘伤害
          const targets = ev.hits.map((h) => {
            const tok = tokens.get(h.target);
            return {
              at: tok ? { x: tok.x, y: tok.y } : { x: cx, y: cy },
              run: () => applyHitFx(h),
            };
          });
          await playRecipe(recipe, { x: cx, y: cy }, targets[0]?.at, { onTargets: targets });
          await awaitEase(dur(180), () => {});
        } else if (recipe?.travel) {
          // 远程弹道：箭飞到才结算。贯穿技能沿途依次中招，否则穿透就读成「一起爆了」
          const endUid = farthestHitUid(ev.uid, ev.hits) ?? ev.hits[0]?.target;
          const endTok = endUid ? tokens.get(endUid) : undefined;
          const endAt = endTok
            ? { x: endTok.x, y: endTok.y }
            : firstTargetPos
              ? cellCenter(originX, originY, cell, firstTargetPos)
              : { x: cx + cell * 3, y: cy };
          // 按离施法者的距离排序，途经顺序才是「先近后远」
          const ordered = [...ev.hits].sort((a, b) => {
            const pa = posByUid.get(a.target);
            const pb = posByUid.get(b.target);
            if (!pa || !pb || !casterPos) return 0;
            const da = Math.abs(pa.x - casterPos.x) + Math.abs(pa.y - casterPos.y);
            const db = Math.abs(pb.x - casterPos.x) + Math.abs(pb.y - casterPos.y);
            return da - db;
          });
          await playRecipe(recipe, { x: cx, y: cy }, endAt, {
            onPass: ordered.map((h) => {
              const tok = tokens.get(h.target);
              return {
                at: tok ? { x: tok.x, y: tok.y } : endAt,
                run: () => applyHitFx(h),
              };
            }),
          });
          await awaitEase(dur(180), () => {});
        } else if (recipe) {
          const aimTok = ev.hits[0] ? tokens.get(ev.hits[0].target) : undefined;
          await playRecipe(
            recipe,
            { x: cx, y: cy },
            aimTok ? { x: aimTok.x, y: aimTok.y } : undefined,
          );
          await awaitEase(dur(180), () => {});
          for (const h of ev.hits) applyHitFx(h);
          await awaitEase(dur(320), () => {});
        } else {
          // 没登记专属特效的技能仍走 displayKind 的静态贴图
          const firstHitToken = ev.hits.length > 0 ? tokens.get(ev.hits[0]!.target) : undefined;
          const fxKey = skillFxKey(ev.kind);
          const at = firstHitToken ?? { x: cx, y: cy };
          if (fxKey) showFxSprite(at.x, at.y, fxKey, Math.max(cell * 1.8, 64));
          await awaitEase(dur(180), () => {});
          for (const h of ev.hits) applyHitFx(h);
          await awaitEase(dur(320), () => {});
        }
        break;
      }
      case 'attack': {
        const a = tokens.get(ev.attacker);
        const t = tokens.get(ev.target);
        if (a && t) {
          const ap = posByUid.get(ev.attacker);
          const tp = posByUid.get(ev.target);
          if (ap && tp) animByUid.get(ev.attacker)?.playAttack(tp.x - ap.x, tp.y - ap.y);
          // 技能名胶囊与高地加成分开：一个讲「出了哪招」，一个讲「站位加成」
          showSkillLabel(a.x, a.y - Math.max(42, cell * 0.6), ev.attackLabel ?? '普攻');
          floatAtkTerrain(a.x, a.y - Math.max(22, cell * 0.32), ev.atkTerrainNote);
          // 普攻按兵种原型取配方：近战只有命中闪光，弓手是飞箭 → 命中。
          // 有飞行段时 await 抵达再飘伤害，否则读成「敌人自己爆了」
          const kind = defIdByUid.get(ev.attacker);
          // 冲锋光环挂在出手端，和飞/砍并行，不挡伤害时机
          if (ev.charged) void playRecipe(CHARGE_VFX, { x: a.x, y: a.y }, undefined);
          await playRecipe(ATTACK_VFX[kind ?? 'sword'], { x: a.x, y: a.y }, { x: t.x, y: t.y });
          hitShake(t);
          floatDamage(t.x, t.y, ev.damage);
          floatTerrainNote(t.x, t.y, ev.defTerrainNote);
          tokenOverheads.get(ev.target)?.updateHp(ev.hpLeft);
          await awaitEase(dur(260), () => {});
        } else if (t) {
          floatDamage(t.x, t.y, ev.damage);
          tokenOverheads.get(ev.target)?.updateHp(ev.hpLeft);
          await awaitEase(dur(260), () => {});
        }
        break;
      }
      case 'heal': {
        const tok = tokens.get(ev.target);
        if (tok) {
          floatHeal(tok.x, tok.y, ev.amount);
          tokenOverheads.get(ev.target)?.updateHp(ev.hpLeft);
        }
        break;
      }
      case 'statusNote': {
        const tok = tokens.get(ev.target);
        if (tok) floatStatusNote(tok.x, tok.y, ev.text, ev.tone);
        await awaitEase(dur(220), () => {});
        break;
      }
      case 'potion': {
        floatUtility(sw / 2, originY + 30, `使用 ${ev.name}`);
        break;
      }
      case 'death': {
        const tok = tokens.get(ev.uid);
        if (tok) {
          await awaitEase(dur(260), (k) => {
            tok.alpha = 1 - k;
          });
          animByUid.get(ev.uid)?.destroy();
          animByUid.delete(ev.uid);
          tokenLayer.removeChild(tok);
          tok.destroy({ children: true });
          tokens.delete(ev.uid);
          tokenOverheads.delete(ev.uid);
        }
        break;
      }
      case 'drop': {
        showDropMarker(ev.pos, ev.potionId);
        const at = cellCenter(originX, originY, cell, ev.pos);
        const name = POTION_DEFS[ev.potionId]?.name ?? '药剂';
        floatUtility(at.x, at.y - cell * 0.35, `掉落 ${name}`);
        break;
      }
      case 'pickup': {
        hideDropMarker(ev.pos);
        gameState.potions[ev.potionId] = (gameState.potions[ev.potionId] ?? 0) + 1;
        gameState.onPickupPotion?.(ev.potionId);
        const h = potionBtns.get(ev.potionId);
        if (h) {
          h.count += 1;
          h.countLbl.text = `×${h.count}`;
          h.container.alpha = 1;
        }
        const at = cellCenter(originX, originY, cell, ev.pos);
        const name = POTION_DEFS[ev.potionId]?.name ?? '药剂';
        floatUtility(at.x, at.y - cell * 0.35, `拾取 ${name}`);
        break;
      }
      case 'turnStart': {
        // 敌方回合把人工 UI 收掉：高亮和操作条留在屏幕上会让玩家以为还能点
        if (ev.faction === 'enemy') manualUi?.hide();
        updateOrderStrip(ev.uid);
        break;
      }
      case 'end':
        break;
    }
  }

  /** 播一串事件；走完路要主动切回静止，否则单位会站在原地一直迈腿 */
  async function playEvents(events: readonly BattleEvent[]): Promise<void> {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (root.destroyed) return;
      if (ev.type === 'end') return;
      await playEvent(ev);
      if (ev.type === 'moveStep') {
        const next = events[i + 1];
        const stillWalking = next?.type === 'moveStep' && next.uid === ev.uid;
        if (!stillWalking) animByUid.get(ev.uid)?.playIdle();
      }
    }
  }

  /** 主循环：AI 单位边模拟边播，玩家单位停下来等指令 */
  async function run(): Promise<void> {
    while (!root.destroyed) {
      // 中途切托管时，引擎已经把手上那个单位打完了（见 pilotBtn），先把它的动作播出来。
      // 走同一条 playEvents 是有意的：托管接手看起来必须和 AI 平时行动一模一样，
      // 否则玩家会以为自己那一下点出了别的效果。
      const step = takeOverStep ?? sim.stepTurn();
      takeOverStep = null;
      await playEvents(step.events);
      if (root.destroyed) return;
      if (step.done) {
        finishPlayback(step.winner ?? 'enemy');
        return;
      }
      // 轮到玩家单位：交互直到它的回合结束。跳过 / 托管时 pending 由 AI 接管
      const pending = sim.pending();
      if (pending && !skipping && !sim.isAuto()) {
        await runPlayerTurn(pending.uid);
        if (root.destroyed) return;
      }
      if (skipping && !sim.isDone()) {
        const report = sim.runToEnd();
        manualUi?.hide();
        updateOrderStrip(null);
        finishPlayback(report.winner);
        return;
      }
      // 跳过模式下让出一帧，避免长战斗卡死渲染线程
      if (skipping) await new Promise((r) => requestAnimationFrame?.(r as () => void) ?? setTimeout(r, 0));
    }
  }

  function finishPlayback(winner: Faction): void {
    completed = true;
    manualUi?.hide();
    updateOrderStrip(null);
    void (async () => {
      if (!skipping) await awaitEase(dur(250), () => {});
      if (!root.destroyed) callbacks.onComplete(winner);
    })();
  }

  // 人工 UI 一律创建。它只在 `sim.pending()` 非空时才显示，而那只发生在人工模式下——
  // 与其再传一个「是不是人工」的开关（它可能和 sim 的实际模式不一致），不如让 sim 单一说话。
  manualUi = createManualTurnUi({
    app,
    geo: { cell, originX, originY, gridW: GW, gridH: GH },
    screenW: sw,
    barBottomY: orderStrip.y - 10,
    highlightLayer: rangeLayer,
    threatLayer: fxLayer,
    inputLayer,
    hudLayer,
    onIdleTap: showUnitInfoAt,
  });
  manualUi.hide();

  root.addChild(settingsBtn);
  root.addChild(settingsOverlay);
  // 信息面板压在设置之上：它是从棋盘点出来的，谁最后打开谁在上面
  root.addChild(infoOverlay);

  void run();

  return root;
}
