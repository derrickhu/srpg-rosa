import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import type { PendingTurn } from '@/battle/engine';
import type { SkillSlot } from '@/battle/skills';
import type { Vec2 } from '@/battle/types';
import { createUiIcon, drawCheck } from '@/view/renderHelpers';

/** 人工回合里玩家能给出的一次输入 */
export type ManualInput =
  /** 点了棋盘上某一格（可能是要走过去，也可能是那格上站着要打的目标） */
  | { kind: 'cell'; cell: Vec2 }
  /** 进入 / 退出技能瞄准；`slot` 指向主槽还是临时槽 */
  | { kind: 'skill'; slot: SkillSlot }
  /** 点普攻按钮：进瞄准，或唯一目标时直接出手 */
  | { kind: 'attack' }
  | { kind: 'cancelAim' }
  | { kind: 'undo' }
  | { kind: 'wait' }
  /** 视图销毁，用来解开正在等输入的那个 await */
  | { kind: 'abort' };

export type ManualPhase = 'act' | 'aim' | 'attackAim';

/**
 * 技能按钮的四种状态。**点不动的三种也要画出来**，而且要能点：
 * 灰按钮不说明理由的话，玩家只会反复戳它，然后认为是 bug。
 */
export type SkillButtonState =
  /** 现在就能放 */
  | 'ready'
  /** 冷却好了、额度也在，但范围里一个目标都没有 */
  | 'noTarget'
  /** 冷却中 */
  | 'cooldown'
  /** 这回合的技能额度已经用掉了 */
  | 'spent';

export interface SkillButtonSpec {
  slot: SkillSlot;
  /** UI bundle 里的图标 key（`skill_<id>`） */
  iconKey: string;
  /** 只在点不动时弹提示用，正常态不显示 */
  name: string;
  state: SkillButtonState;
  /** `state === 'cooldown'` 时还差几回合 */
  cooldown: number;
}

/** 普攻按钮状态（和技能按钮同套视觉语义） */
export type AttackButtonState = 'ready' | 'noTarget' | 'spent';

export interface ManualUiState {
  pending: PendingTurn;
  phase: ManualPhase;
  /** 行动者脚下那格，画选中环 */
  activeCell: Vec2;
  moveCells: Vec2[];
  /**
   * `moveCells` 里敌方下一行动普攻能覆盖的危险落点。
   * 用红高亮；其余移动格仍是青色。
   */
  dangerMoveCells: Vec2[];
  attackCells: Vec2[];
  /** 技能瞄准范围（phase = 'aim' 时才画） */
  skillRangeCells: Vec2[];
  /** 需要点选的技能目标所在格（单体点名） */
  skillCandidateCells: Vec2[];
  /** 需要点选的范围格（直线方向 / AoE 确认）；与候选单位互斥 */
  skillAimCells: Vec2[];
  /**
   * 能威胁到 `activeCell` 的敌人脚下格；画贴地虚线敌人 → 行动者。
   * 由回放层决定时机：仅「已移动、尚未出手」时非空。
   */
  threatFrom: Vec2[];
  /**
   * 每个技能槽一个按钮。空数组 = 这个单位一招都没有。
   *
   * 冷却中的槽也留在列表里（`enabled: false`）：按钮消失了，玩家看不到
   * 「还有几回合能再放」，而这恰恰是决定这回合要不要保守走位的依据。
   */
  skillButtons: SkillButtonSpec[];
  /** 普攻按钮：可打时点亮，逼玩家意识到还有一刀 */
  attackButton: AttackButtonState;
}

export interface BoardGeometry {
  cell: number;
  originX: number;
  originY: number;
  gridW: number;
  gridH: number;
}

export interface ManualTurnUiOptions {
  app: { ticker: PIXI.Ticker };
  geo: BoardGeometry;
  screenW: number;
  /** 操作区可占用的下边界（顺序条上沿）；按钮贴着它往上排 */
  barBottomY: number;
  /** 高亮层：在棋子**之下**，否则色块会糊住角色 */
  highlightLayer: PIXI.Container;
  /**
   * 威胁箭头层：应在棋子之上（如 fxLayer），读成空中连线。
   * 不传则挂在 highlightLayer（会被棋子挡住一段）。
   */
  threatLayer?: PIXI.Container;
  /**
   * 输入层：在棋子**之上**、HUD 之下。
   *
   * 所有棋盘点击都由这一层统一接（不给每个棋子挂监听）。棋子的 hitArea 比格子高
   * （头顶要留给血条），相邻两个棋子的判定区是重叠的——挂在棋子上的话，想走到某格
   * 却点中了站在它北边那个单位的脚下，这种误触在小格子上几乎必然发生。
   * 单位和格子是一一对应的，所以「点格子」这一个动词足够表达全部意图。
   */
  inputLayer: PIXI.Container;
  hudLayer: PIXI.Container;
  /**
   * 没人在等输入时的棋盘点击（自动战斗全程、人工模式下播放动画的间隙）。
   *
   * 这些时刻本来是点了完全没反应的死区。交给调用方去弹单位信息面板：
   * 看敌人面板不改变任何战局状态，没有理由非等到自己回合才允许。
   */
  onIdleTap?: (cell: Vec2) => void;
}

/** 可移动格（安全） */
const MOVE_COLOR = 0x52c4dc;
/** 可移动但敌方下回合能打到 */
const DANGER_MOVE_COLOR = 0xe8564a;
/** 可攻击目标 */
const ATTACK_COLOR = 0xe8564a;
/** 技能范围 / 可选目标 */
const SKILL_COLOR = 0xe8c866;
/** 威胁贴地虚线：描边跟角色一样偏厚，暖珊瑚配草地 */
const THREAT_OUTLINE = 0x3a1810;
const THREAT_CORE = 0xff6a4a;
const THREAT_CORE_HI = 0xffb08a;
/** 操作条按钮直径 */
const BAR_H = 46;
/** 按钮里图标的边长 */
const ICON_S = 30;
/** 行动额度格高度 */
const BUDGET_H = 15;
/** 主技能槽的描边色 */
const MAIN_TONE = 0xf2b21c;
/** 临时技能槽的描边色：这一局买来的，颜色上要和看家本领分得开 */
const TEMP_TONE = 0x5ad07a;
/** 待机 / 撤销 / 取消这类非技能动作 */
const ACTION_TONE = 0xcfd6dd;
/** 只能待机时：沙漏描边提亮，和「可放技能」同级注意力 */
const WAIT_READY_TONE = 0xffd27a;
/** 普攻按钮描边：偏红，和金技能 / 绿临时技分开 */
const ATTACK_TONE = 0xe8564a;

interface RoundIconButtonOpts {
  iconKey: string;
  /** 图标没加载出来时的兜底文字（两个字以内） */
  fallback: string;
  tone: number;
  /** 点不动：压暗 + 去色，做成「按下去」的凹陷片 */
  dim: boolean;
  /** 冷却回合数，压在图标上 */
  badge?: number;
  /** 额度已用完的打勾 */
  check?: boolean;
  onTap: () => void;
}

/**
 * 圆形图标按钮。
 *
 * 战斗里每回合都要看这一排，写字太吵：技能名两到四个字，加上「·无目标」「·已用」
 * 之后一行摆不下两个技能槽，而且玩家真正要认的是「这一招长什么样」——
 * 三选一卡片、部署面板、这里用的是同一张图标，认图比认字快得多。
 * 状态全部走视觉：亮 = 现在能点，暗 = 点不动（点了会弹一行字说明为什么）。
 */
function createRoundIconButton(o: RoundIconButtonOpts): PIXI.Container {
  const node = new PIXI.Container();
  const r = BAR_H / 2;

  const plate = new PIXI.Graphics();
  // 凹陷片和凸起片的区别只在描边亮度和底色深浅，别用阴影：小圆上看不出来
  plate.beginFill(0x14100c, o.dim ? 0.72 : 0.8);
  plate.drawCircle(r, r, r);
  plate.endFill();
  plate.lineStyle(2.5, o.tone, o.dim ? 0.28 : 1);
  plate.drawCircle(r, r, r - 1.25);
  node.addChild(plate);

  const icon = createUiIcon(o.iconKey, ICON_S);
  if (icon) {
    icon.x = r - ICON_S / 2;
    icon.y = r - ICON_S / 2;
    if (o.dim) {
      // 只压暗、不抽透明度：图标本身是深描边的贴纸，再掉 alpha 就和黑底糊成一团，
      // 玩家连「这个位置是什么招」都认不出来，而冷却中恰恰最需要认出它。
      for (const ch of icon.children) {
        if (ch instanceof PIXI.Sprite) ch.tint = 0xbdbdbd;
      }
    }
    node.addChild(icon);
  } else {
    const tx = makeText(o.fallback, 'uiStrong', {
      fill: o.dim ? 0x8a8a8a : 0xfff4dd, fontSize: 12,
    });
    tx.anchor.set(0.5);
    tx.x = r;
    tx.y = r;
    node.addChild(tx);
  }

  // 冷却回合数 / 已用过的勾都挂在右下角当角标，不压在图标中间：
  // 中间那块要留给图标本身。「这是哪一招」和「现在能不能放」是两件事，
  // 一个大数字盖住图标，玩家就得靠位置记忆去认技能了。
  if (o.badge != null || o.check) {
    const bx = BAR_H - 11;
    const badge = new PIXI.Graphics();
    badge.beginFill(0x14100c, 0.92);
    badge.drawCircle(bx, bx, 10);
    badge.endFill();
    badge.lineStyle(1.5, o.tone, 0.55);
    badge.drawCircle(bx, bx, 10);
    node.addChild(badge);

    if (o.badge != null) {
      const cd = makeText(String(o.badge), 'uiStrong', {
        fill: 0xffffff, fontSize: 13,
      });
      cd.anchor.set(0.5);
      cd.x = bx;
      cd.y = bx;
      node.addChild(cd);
    } else {
      const tick = drawCheck(5, 0x9fe08a);
      tick.x = bx;
      tick.y = bx;
      node.addChild(tick);
    }
  }

  node.eventMode = 'static';
  node.cursor = 'pointer';
  node.hitArea = new PIXI.Rectangle(0, 0, BAR_H, BAR_H);
  node.on('pointerdown', () => { node.alpha = 0.75; });
  node.on('pointerupoutside', () => { node.alpha = 1; });
  node.on('pointertap', () => {
    node.alpha = 1;
    o.onTap();
  });
  return node;
}

function cellRect(geo: BoardGeometry, p: Vec2): { x: number; y: number; s: number } {
  return {
    x: geo.originX + p.x * geo.cell,
    y: geo.originY + p.y * geo.cell,
    s: geo.cell - 2,
  };
}

export interface ManualTurnUi {
  update(s: ManualUiState): void;
  next(): Promise<ManualInput>;
  hide(): void;
  /**
   * 解开正在等的那个 `next()`（切托管 / 跳过时用），但不销毁 UI——之后还要用。
   *
   * `hide()` 只是把界面擦掉，它不会让 `await next()` 返回。玩家在自己回合中途按下
   * 「托管」或「跳过」时，如果只 hide，回放协程会永远挂在那个 await 上：屏幕上是一张
   * 空战场，谁也不动。控制权要交出去，就得先把等待解开。
   */
  abortWait(): void;
  destroy(): void;
}

export function createManualTurnUi(opts: ManualTurnUiOptions): ManualTurnUi {
  const { geo, hudLayer, highlightLayer, inputLayer } = opts;
  const threatParent = opts.threatLayer ?? highlightLayer;

  const highlight = new PIXI.Graphics();
  highlightLayer.addChild(highlight);
  /**
   * 威胁箭头单独一层：格子高亮每次 `clear()`，箭头不能并进同一张 Graphics，
   * 否则选技能/重绘移动格时会把连线一起擦掉再难管生命周期。
   */
  const threatArrows = new PIXI.Graphics();
  // 挂在 fxLayer 时绝不能抢点击，否则盖住整条连线的区域都点不到棋盘
  threatArrows.eventMode = 'none';
  threatParent.addChild(threatArrows);
  /** 当前要画的威胁连线；pulse 里按时间重绘做呼吸/流动 */
  let threatLinks: { from: Vec2; to: Vec2; bow: number }[] = [];
  /** 行动者脚下的环，单独一层因为它要每帧呼吸 */
  const activeRing = new PIXI.Graphics();
  highlightLayer.addChild(activeRing);

  const bar = new PIXI.Container();
  hudLayer.addChild(bar);

  const hint = makeText('', 'combatLabel', {
    fill: 0xfff4dd, fontSize: 13,
    stroke: 0x000000, strokeThickness: 4,
  });
  hint.anchor.set(0.5, 1);
  hudLayer.addChild(hint);

  /**
   * 行动额度指示器：移动 / 技能 / 普攻 三格。
   *
   * 一个单位一回合能移动一次、放一次技能、再普攻一次（和 AI 同口径）。
   * 不画出来的话玩家根本不知道自己还剩什么——最常见的误解是以为出过手就该结束了，
   * 于是白白丢掉一次普攻。三种状态要分开：可用（亮）/ 已用（打勾）/ 用不了（暗）。
   */
  const budget = new PIXI.Container();
  hudLayer.addChild(budget);

  /**
   * 点了点不动的按钮时弹的一行字。
   *
   * 这条不能并进 `hint`：`hint` 是 `update()` 算出来的稳定态，而这里是一次点击的回执，
   * 点击又不产生输入（不会触发下一次 `update()`），只能自己活一会儿再淡出。
   */
  const toast = makeText('', 'combatLabel', {
    fill: 0xffe9a8, fontSize: 13,
    stroke: 0x000000, strokeThickness: 4,
  });
  toast.anchor.set(0.5, 1);
  toast.visible = false;
  hudLayer.addChild(toast);
  let toastUntil = 0;

  /** 可点击按钮外圈：鲜艳描边 + 旋转短弧，每帧重画 */
  const glow = new PIXI.Graphics();
  // 光环画在按钮**上面**（要盖住按钮边缘那圈），所以必须显式退出命中测试，
  // 否则它会把技能按钮的点击吃掉。
  glow.eventMode = 'none';
  hudLayer.addChild(glow);
  /** 本次布局里要发光的按钮圆心（HUD 局部坐标） */
  let glowSpots: Vec2[] = [];
  /**
   * 可点特效色：技能/普攻暖金；只能待机时用更抢眼的琥珀黄，
   * 别和技能就绪抢同一套语义。
   */
  let glowTone: number = 0xffe08a;
  /** 待机强制点亮时转得更快、颜色更冲 */
  let glowUrgent = false;

  let resolver: ((i: ManualInput) => void) | null = null;
  let active: Vec2 | null = null;
  let destroyed = false;

  function showToast(msg: string): void {
    if (destroyed) return;
    toast.text = msg;
    toast.alpha = 1;
    toast.visible = true;
    toastUntil = Date.now() + 1500;
  }

  function emit(i: ManualInput): void {
    const r = resolver;
    resolver = null;
    r?.(i);
  }

  function teardown(): void {
    if (destroyed) return;
    destroyed = true;
    // 先解开正在等输入的那个 await，否则回放协程会永远挂在那里
    emit({ kind: 'abort' });
    opts.app.ticker.remove(pulse);
    inputLayer.off('pointertap', onBoardTap);
    if (!highlight.destroyed) highlight.destroy();
    if (!threatArrows.destroyed) threatArrows.destroy();
    if (!activeRing.destroyed) activeRing.destroy();
    if (!bar.destroyed) bar.destroy({ children: true });
    if (!budget.destroyed) budget.destroy({ children: true });
    if (!hint.destroyed) hint.destroy();
    if (!toast.destroyed) toast.destroy();
    if (!glow.destroyed) glow.destroy();
  }

  // --- 棋盘输入 ---
  inputLayer.eventMode = 'static';
  inputLayer.hitArea = new PIXI.Rectangle(
    geo.originX,
    geo.originY,
    geo.gridW * geo.cell,
    geo.gridH * geo.cell,
  );
  const onBoardTap = (e: PIXI.FederatedPointerEvent): void => {
    if (destroyed) return;
    const local = inputLayer.toLocal(e.global);
    const cx = Math.floor((local.x - geo.originX) / geo.cell);
    const cy = Math.floor((local.y - geo.originY) / geo.cell);
    if (cx < 0 || cy < 0 || cx >= geo.gridW || cy >= geo.gridH) return;
    if (!resolver) {
      opts.onIdleTap?.({ x: cx, y: cy });
      return;
    }
    emit({ kind: 'cell', cell: { x: cx, y: cy } });
  };
  inputLayer.on('pointertap', onBoardTap);

  /**
   * 可点击环：实心鲜艳描边 + 外圈旋转短弧。
   * 呼吸透明度不够显眼；旋转是「现在该点这个」的强信号。
   */
  function paintClickableRing(cx: number, cy: number, now: number, breathe: number): void {
    const baseR = BAR_H / 2 + 3;
    const core = glowUrgent ? 0xfff23a : glowTone;
    const accent = glowUrgent ? 0xff6a18 : 0xffffff;
    const spinMs = glowUrgent ? 900 : 1400;
    const rot = ((now % spinMs) / spinMs) * Math.PI * 2;
    const pulseW = 3.2 + 0.8 * breathe;

    // 内圈：高饱和实线描边，始终很亮
    glow.lineStyle(pulseW + 1.5, 0x2a1408, 0.55);
    glow.drawCircle(cx, cy, baseR);
    glow.lineStyle(pulseW, core, 0.95);
    glow.drawCircle(cx, cy, baseR);

    // 外圈：反向旋转的短弧（虚线感），读成「在转、可点」
    // 每段 arc 前必须 moveTo：Pixi Graphics 会从当前笔尖连线到弧起点，
    // 两个按钮同时点亮时就会在按钮之间拉出一条「莫名直线」。
    const dashR = baseR + 5.5;
    const slots = glowUrgent ? 10 : 8;
    const dashSpan = (Math.PI * 2) / slots;
    const dashLen = dashSpan * 0.42;
    for (let i = 0; i < slots; i++) {
      const a0 = -rot + i * dashSpan;
      const a1 = a0 + dashLen;
      glow.lineStyle(glowUrgent ? 3.4 : 2.8, accent, 0.9);
      glow.moveTo(cx + Math.cos(a0) * dashR, cy + Math.sin(a0) * dashR);
      glow.arc(cx, cy, dashR, a0, a1);
    }
    // 最外一圈淡色轨道，托住短弧，草地上也站得住
    glow.lineStyle(1.5, core, 0.35 + 0.25 * breathe);
    glow.drawCircle(cx, cy, dashR + 2.5);
  }

  const pulse = (): void => {
    if (destroyed) return;
    // 场景是被 SceneManager 用 destroy({children:true}) 整棵拆掉的，这个模块拿不到通知。
    // 不自己发现的话：每帧都会去 clear 一个已销毁的 Graphics，而且 `next()` 那个
    // 挂起的 Promise 永远不 resolve，把整条回放协程连着单位状态一起留在内存里。
    if (activeRing.destroyed) {
      teardown();
      return;
    }
    const now = Date.now();
    if (threatLinks.length > 0 && !threatArrows.destroyed) {
      paintThreatArrows(now);
    }
    const k = 0.6 + 0.4 * Math.sin(now / 260);

    if (toast.visible) {
      const left = toastUntil - now;
      if (left <= 0) toast.visible = false;
      else if (left < 400) toast.alpha = left / 400;
    }

    glow.clear();
    if (glow.visible) {
      for (const c of glowSpots) {
        paintClickableRing(c.x, c.y, now, k);
      }
    }

    activeRing.clear();
    if (!active) return;
    const r = cellRect(geo, active);
    activeRing.lineStyle(3, 0xffffff, 0.35 + 0.45 * k);
    activeRing.drawRoundedRect(r.x + 1, r.y + 1, r.s - 2, r.s - 2, 4);
  };
  opts.app.ticker.add(pulse);

  function drawCells(cells: Vec2[], color: number, fillAlpha: number): void {
    for (const p of cells) {
      const r = cellRect(geo, p);
      highlight.lineStyle(2, color, 0.95);
      highlight.beginFill(color, fillAlpha);
      highlight.drawRoundedRect(r.x, r.y, r.s, r.s, 4);
      highlight.endFill();
    }
  }

  function cellCenterPx(p: Vec2): { x: number; y: number } {
    const r = cellRect(geo, p);
    return { x: r.x + r.s / 2, y: r.y + r.s / 2 };
  }

  function setThreatArrows(fromCells: Vec2[], toCell: Vec2): void {
    // 多条贴地虚线轻微左右错开，避免完全叠成一根
    threatLinks = fromCells.map((from, i) => {
      const sign = i % 2 === 0 ? 1 : -1;
      const mag = 0.06 + 0.04 * Math.floor(i / 2);
      return { from: { ...from }, to: { ...toCell }, bow: sign * mag };
    });
    paintThreatArrows(Date.now());
  }

  /** 一段圆角虚线胶囊：深描边 + 亮芯，跟角色厚描边同一套味道 */
  function drawDashCapsule(
    cx: number, cy: number, ux: number, uy: number,
    length: number, halfW: number, fill: number, outline: number, alpha: number,
  ): void {
    const hx = ux * (length / 2);
    const hy = uy * (length / 2);
    const px = -uy * halfW;
    const py = ux * halfW;
    const corners = [
      { x: cx - hx + px, y: cy - hy + py },
      { x: cx + hx + px, y: cy + hy + py },
      { x: cx + hx - px, y: cy + hy - py },
      { x: cx - hx - px, y: cy - hy - py },
    ];
    const drawPoly = (pad: number, color: number, a: number): void => {
      const ox = -uy * pad;
      const oy = ux * pad;
      const fx = ux * pad;
      const fy = uy * pad;
      const p = [
        { x: corners[0]!.x - fx + ox, y: corners[0]!.y - fy + oy },
        { x: corners[1]!.x + fx + ox, y: corners[1]!.y + fy + oy },
        { x: corners[2]!.x + fx - ox, y: corners[2]!.y + fy - oy },
        { x: corners[3]!.x - fx - ox, y: corners[3]!.y - fy - oy },
      ];
      threatArrows.beginFill(color, a);
      threatArrows.lineStyle(0);
      threatArrows.moveTo(p[0]!.x, p[0]!.y);
      for (let i = 1; i < p.length; i++) threatArrows.lineTo(p[i]!.x, p[i]!.y);
      threatArrows.lineTo(p[0]!.x, p[0]!.y);
      threatArrows.endFill();
    };
    drawPoly(1.6, outline, alpha);
    drawPoly(0, fill, alpha);
  }

  function fillArrowHead(
    tipX: number, tipY: number, ux: number, uy: number,
    len: number, half: number, fill: number, outline: number, alpha: number,
  ): void {
    const bx = tipX - ux * len;
    const by = tipY - uy * len;
    const px = -uy * half;
    const py = ux * half;
    const tip = { x: tipX, y: tipY };
    const l = { x: bx + px, y: by + py };
    const r = { x: bx - px, y: by - py };
    // 外描边三角形稍放大一点
    const grow = 2.2;
    const ox = -ux * grow;
    const oy = -uy * grow;
    const opx = -uy * grow;
    const opy = ux * grow;
    threatArrows.beginFill(outline, alpha);
    threatArrows.lineStyle(0);
    threatArrows.moveTo(tip.x + ox, tip.y + oy);
    threatArrows.lineTo(l.x - ox + opx, l.y - oy + opy);
    threatArrows.lineTo(r.x - ox - opx, r.y - oy - opy);
    threatArrows.lineTo(tip.x + ox, tip.y + oy);
    threatArrows.endFill();
    threatArrows.beginFill(fill, alpha);
    threatArrows.moveTo(tip.x, tip.y);
    threatArrows.lineTo(l.x, l.y);
    threatArrows.lineTo(r.x, r.y);
    threatArrows.lineTo(tip.x, tip.y);
    threatArrows.endFill();
    // 尖端一小块高光，避免整块珊瑚糊成贴纸
    threatArrows.beginFill(THREAT_CORE_HI, alpha * 0.55);
    threatArrows.moveTo(tip.x, tip.y);
    threatArrows.lineTo(
      tip.x - ux * len * 0.42 + px * 0.35,
      tip.y - uy * len * 0.42 + py * 0.35,
    );
    threatArrows.lineTo(
      tip.x - ux * len * 0.42 - px * 0.35,
      tip.y - uy * len * 0.42 - py * 0.35,
    );
    threatArrows.lineTo(tip.x, tip.y);
    threatArrows.endFill();
  }

  /** 贴地虚线威胁箭：粗、有描边、指向己方，跟草地卡通风搭 */
  function paintThreatArrows(now: number): void {
    threatArrows.clear();
    if (threatLinks.length === 0) return;
    const breathe = 0.78 + 0.22 * Math.sin(now / 380);
    const flow = (now / 520) % 1;

    for (const link of threatLinks) {
      const from = cellCenterPx(link.from);
      const to = cellCenterPx(link.to);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 8) continue;

      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const lateral = link.bow * geo.cell * 0.55;

      const headLen = Math.max(10, geo.cell * 0.34);
      const headHalf = headLen * 0.52;
      const insetFrom = Math.min(geo.cell * 0.32, len * 0.2);
      const insetTo = Math.min(geo.cell * 0.38 + headLen * 0.15, len * 0.28);
      const x0 = from.x + ux * insetFrom + px * lateral;
      const y0 = from.y + uy * insetFrom + py * lateral;
      const x1 = to.x - ux * insetTo + px * lateral;
      const y1 = to.y - uy * insetTo + py * lateral;
      const shaft = Math.hypot(x1 - x0, y1 - y0);
      if (shaft < 8) continue;

      const sux = (x1 - x0) / shaft;
      const suy = (y1 - y0) / shaft;
      const dashLen = Math.max(9, geo.cell * 0.3);
      const gapLen = Math.max(5, geo.cell * 0.16);
      const pitch = dashLen + gapLen;
      const halfW = Math.max(2.6, geo.cell * 0.085);
      const alpha = 0.88 * breathe;

      // 虚线从敌人走向己方，整体相位缓慢前移，读成「压力压过来」
      for (let d = flow * pitch; d + dashLen * 0.35 < shaft - 2; d += pitch) {
        const mid = d + dashLen / 2;
        if (mid > shaft - 1) break;
        drawDashCapsule(
          x0 + sux * mid, y0 + suy * mid, sux, suy,
          dashLen, halfW, THREAT_CORE, THREAT_OUTLINE, alpha,
        );
      }

      fillArrowHead(x1, y1, sux, suy, headLen, headHalf, THREAT_CORE, THREAT_OUTLINE, alpha);
    }
  }

  /**
   * 只在**额度格说不清**的时候出文字。
   *
   * 常规回合里「移动/技能/普攻」三个格已经把能做什么讲完了，再叠一行
   * 「点蓝格移动」就是同一件事说两遍，而这行字还要占棋盘。
   * 剩下两种情况格子表达不了：瞄准态（要点哪儿）、以及无路可走（该点待机）。
   */
  function hintText(s: ManualUiState): string {
    if (s.phase === 'aim') {
      if (s.skillCandidateCells.length > 0) return '点高亮目标释放';
      if (s.skillAimCells.length > 0) return '点高亮范围确认方向';
      return '点任意处确认释放';
    }
    if (s.phase === 'attackAim') {
      return '点高亮敌人普攻';
    }
    const stuck = !s.pending.canMove && !s.pending.canSkill && !s.pending.canAttack;
    return stuck ? '无可用行动，点待机结束' : '';
  }

  /** 额度格：移动 / 攻击（技能+普攻都算攻击侧） */
  function rebuildBudget(s: ManualUiState): number {
    budget.removeChildren().forEach((c) => c.destroy({ children: true }));
    const attackOpen = s.pending.canSkill || s.pending.canAttack;
    const attackDone = !attackOpen && (s.pending.didSkill || s.pending.didAttack);
    const slots: { label: string; done: boolean; open: boolean }[] = [
      { label: '移动', done: s.pending.didMove, open: s.pending.canMove },
      { label: '攻击', done: attackDone, open: attackOpen },
    ];
    const h = 15;
    const gap = 3;
    let x = 0;
    for (const sl of slots) {
      const tx = makeText(sl.label, 'combatLabel', {
        fill: sl.done ? 0x9fe08a : (sl.open ? 0xfff0c0 : 0x9a9a9a),
        fontSize: 9,
      });
      tx.anchor.set(0.5);
      // 已用的额度画一个几何对勾，不写 `✓`：游戏字体是裁过的子集，缺这个字形，
      // 真机上会变成豆腐块（见 renderHelpers.drawCheck 的注释）。
      const w = tx.width + 8 + (sl.done ? 10 : 0);
      const g = new PIXI.Graphics();
      g.beginFill(0x000000, sl.open ? 0.62 : 0.4);
      g.drawRoundedRect(0, 0, w, h, 4);
      g.endFill();
      const chip = new PIXI.Container();
      chip.x = x;
      chip.addChild(g);
      tx.x = sl.done ? (w - 10) / 2 : w / 2;
      tx.y = h / 2;
      chip.addChild(tx);
      if (sl.done) {
        const tick = drawCheck(5, 0x9fe08a);
        tick.x = w - 9;
        tick.y = h / 2;
        chip.addChild(tick);
      }
      budget.addChild(chip);
      x += w + gap;
    }
    return Math.max(0, x - gap);
  }

  /**
   * 操作区固定在棋盘下方那条空带里，居中排。
   *
   * 试过让它贴着当前单位浮动（想省掉「看单位 → 视线移到底部 → 点 → 移回来」这段来回），
   * 但小格子上按钮必然压住可走格，等于用**看不见棋盘**换视线距离，得不偿失。
   * 位置固定还有个附带好处：连点几个单位时手不用重新找按钮。
   *
   * 从 `barBottomY` 往上堆：按钮 → 额度格 → 提示。
   */
  function layoutBar(s: ManualUiState, btns: PIXI.Container[], glowIdx: number[]): void {
    const gap = 12;
    const totalW = Math.max(0, btns.length * BAR_H + (btns.length - 1) * gap);

    const cx = opts.screenW / 2;
    const barTop = opts.barBottomY - BAR_H;
    const barLeft = Math.floor(cx - totalW / 2);

    let x = 0;
    for (const b of btns) {
      b.x = x;
      b.y = 0;
      bar.addChild(b);
      x += BAR_H + gap;
    }

    // 光环挂在 bar 之外的一层：它要画到按钮圆外面去，塞进按钮里会被相邻按钮盖住
    glowSpots = glowIdx.map((i) => ({
      x: barLeft + i * (BAR_H + gap) + BAR_H / 2,
      y: barTop + BAR_H / 2,
    }));

    const budgetW = rebuildBudget(s);
    const budgetTop = barTop - BUDGET_H - 4;

    bar.x = barLeft;
    bar.y = Math.floor(barTop);
    budget.x = Math.floor(cx - budgetW / 2);
    budget.y = Math.floor(budgetTop);
    hint.x = Math.floor(cx);
    hint.y = Math.floor(budgetTop - 3);
    toast.x = Math.floor(cx);
    toast.y = Math.floor(budgetTop - 3 - (hint.visible ? 16 : 0));
  }

  /** 点不动的按钮点下去时，把「为什么不能点」说清楚 */
  function blockedReason(sb: SkillButtonSpec): string {
    switch (sb.state) {
      case 'noTarget': return `${sb.name}：范围内没有目标`;
      case 'cooldown': return `${sb.name}：冷却中，还要 ${sb.cooldown} 回合`;
      default: return '这回合的技能已经放过了';
    }
  }

  function rebuildBar(s: ManualUiState): void {
    bar.removeChildren().forEach((c) => c.destroy({ children: true }));

    const btns: PIXI.Container[] = [];
    const glowIdx: number[] = [];
    // 与 hint「无可用行动」同口径：移动/技能/普攻都没了，唯一该点的就是待机
    const mustWait = s.phase === 'act'
      && !s.pending.canMove && !s.pending.canSkill && !s.pending.canAttack;
    glowUrgent = mustWait;
    glowTone = mustWait ? 0xfff23a : 0xffe08a;

    if (s.phase === 'aim' || s.phase === 'attackAim') {
      btns.push(createRoundIconButton({
        iconKey: 'act_cancel', fallback: '取消', tone: ACTION_TONE, dim: false,
        onTap: () => emit({ kind: 'cancelAim' }),
      }));
    } else {
      for (const sb of s.skillButtons) {
        if (sb.state === 'ready') glowIdx.push(btns.length);
        btns.push(createRoundIconButton({
          iconKey: sb.iconKey,
          fallback: sb.name.slice(0, 2),
          // 临时技能换一档描边色，和主技能一眼分得开：它是这一局买来的，
          // 下一局就没了，不该和角色的看家本领长得一样。
          tone: sb.slot === 'temp' ? TEMP_TONE : MAIN_TONE,
          // 「没目标」不压暗：它和冷却是两回事——冷却是这几回合都别想了，
          // 没目标只差走两步就能放。压成一样的灰会让玩家放弃这一招。
          dim: sb.state === 'cooldown' || sb.state === 'spent',
          badge: sb.state === 'cooldown' ? sb.cooldown : undefined,
          check: sb.state === 'spent',
          onTap: () => {
            if (sb.state === 'ready') emit({ kind: 'skill', slot: sb.slot });
            else showToast(blockedReason(sb));
          },
        }));
      }
      // 普攻固定占一格：可打时呼吸点亮，别再只靠棋盘红格暗示
      if (s.attackButton === 'ready') glowIdx.push(btns.length);
      btns.push(createRoundIconButton({
        iconKey: 'act_attack',
        fallback: '普攻',
        tone: ATTACK_TONE,
        dim: s.attackButton === 'spent',
        check: s.attackButton === 'spent',
        onTap: () => {
          if (s.attackButton === 'ready') emit({ kind: 'attack' });
          else if (s.attackButton === 'noTarget') showToast('普攻：范围内没有敌人');
          else showToast('这回合已经普攻过了');
        },
      }));
      if (s.pending.canUndoMove) {
        btns.push(createRoundIconButton({
          iconKey: 'act_undo', fallback: '撤销', tone: ACTION_TONE, dim: false,
          onTap: () => emit({ kind: 'undo' }),
        }));
      }
      if (mustWait) glowIdx.push(btns.length);
      btns.push(createRoundIconButton({
        iconKey: 'act_wait',
        fallback: '待机',
        tone: mustWait ? WAIT_READY_TONE : ACTION_TONE,
        dim: false,
        onTap: () => emit({ kind: 'wait' }),
      }));
    }

    layoutBar(s, btns, glowIdx);
  }

  return {
    update(s: ManualUiState): void {
      if (destroyed) return;
      highlight.clear();
      if (s.phase === 'aim') {
        drawCells(s.skillRangeCells, SKILL_COLOR, 0.18);
        // 可点的范围格比底亮一档；单体目标格同亮度
        drawCells(s.skillAimCells, SKILL_COLOR, 0.4);
        drawCells(s.skillCandidateCells, SKILL_COLOR, 0.45);
      } else if (s.phase === 'attackAim') {
        drawCells(s.attackCells, ATTACK_COLOR, 0.45);
      } else if (s.pending.canMove) {
        const dangerKeys = new Set(s.dangerMoveCells.map((c) => `${c.x},${c.y}`));
        const safe = s.moveCells.filter((c) => !dangerKeys.has(`${c.x},${c.y}`));
        drawCells(safe, MOVE_COLOR, 0.22);
        // fill 略低于普攻目标格，避免和「可点攻击的敌人脚下」糊成一块
        drawCells(s.dangerMoveCells, DANGER_MOVE_COLOR, 0.2);
      }
      // 行动态也淡淡标出可普攻敌人，和点亮的普攻按钮互相印证
      if (s.phase === 'act' && s.pending.canAttack) {
        drawCells(s.attackCells, ATTACK_COLOR, 0.22);
      }
      setThreatArrows(s.threatFrom, s.activeCell);
      active = s.activeCell;
      highlight.visible = true;
      threatArrows.visible = true;
      bar.visible = true;
      budget.visible = true;
      glow.visible = true;
      hint.text = hintText(s);
      hint.visible = hint.text !== '';
      rebuildBar(s);
    },

    next(): Promise<ManualInput> {
      if (destroyed) return Promise.resolve({ kind: 'abort' });
      return new Promise((res) => { resolver = res; });
    },

    abortWait(): void {
      if (destroyed) return;
      emit({ kind: 'abort' });
    },

    hide(): void {
      if (destroyed) return;
      highlight.clear();
      threatLinks = [];
      threatArrows.clear();
      active = null;
      activeRing.clear();
      bar.visible = false;
      budget.visible = false;
      hint.visible = false;
      toast.visible = false;
      glow.visible = false;
      glow.clear();
    },

    destroy: teardown,
  };
}

