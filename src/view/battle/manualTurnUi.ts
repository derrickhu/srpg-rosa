import * as PIXI from 'pixi.js';
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
  | { kind: 'cancelAim' }
  | { kind: 'undo' }
  | { kind: 'wait' }
  /** 视图销毁，用来解开正在等输入的那个 await */
  | { kind: 'abort' };

export type ManualPhase = 'act' | 'aim';

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

export interface ManualUiState {
  pending: PendingTurn;
  phase: ManualPhase;
  /** 行动者脚下那格，画选中环 */
  activeCell: Vec2;
  moveCells: Vec2[];
  attackCells: Vec2[];
  /** 技能瞄准范围（phase = 'aim' 时才画） */
  skillRangeCells: Vec2[];
  /** 需要点选的技能目标所在格 */
  skillCandidateCells: Vec2[];
  /**
   * 每个技能槽一个按钮。空数组 = 这个单位一招都没有。
   *
   * 冷却中的槽也留在列表里（`enabled: false`）：按钮消失了，玩家看不到
   * 「还有几回合能再放」，而这恰恰是决定这回合要不要保守走位的依据。
   */
  skillButtons: SkillButtonSpec[];
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

/** 可移动格 */
const MOVE_COLOR = 0x52c4dc;
/** 可攻击目标 */
const ATTACK_COLOR = 0xe8564a;
/** 技能范围 / 可选目标 */
const SKILL_COLOR = 0xe8c866;
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
    const tx = new PIXI.Text(o.fallback, {
      fill: o.dim ? 0x8a8a8a : 0xfff4dd, fontSize: 12, fontWeight: 'bold',
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
      const cd = new PIXI.Text(String(o.badge), {
        fill: 0xffffff, fontSize: 13, fontWeight: 'bold',
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
  destroy(): void;
}

export function createManualTurnUi(opts: ManualTurnUiOptions): ManualTurnUi {
  const { geo, hudLayer, highlightLayer, inputLayer } = opts;

  const highlight = new PIXI.Graphics();
  highlightLayer.addChild(highlight);
  /** 行动者脚下的环，单独一层因为它要每帧呼吸 */
  const activeRing = new PIXI.Graphics();
  highlightLayer.addChild(activeRing);

  const bar = new PIXI.Container();
  hudLayer.addChild(bar);

  const hint = new PIXI.Text('', {
    fill: 0xffffff, fontSize: 11, fontWeight: 'bold',
    stroke: 0x000000, strokeThickness: 3,
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
  const toast = new PIXI.Text('', {
    fill: 0xffe9a8, fontSize: 12, fontWeight: 'bold',
    stroke: 0x000000, strokeThickness: 4,
  });
  toast.anchor.set(0.5, 1);
  toast.visible = false;
  hudLayer.addChild(toast);
  let toastUntil = 0;

  /** 可释放技能按钮外面那圈呼吸光环，每帧改 alpha */
  const glow = new PIXI.Graphics();
  // 光环画在按钮**上面**（要盖住按钮边缘那圈），所以必须显式退出命中测试，
  // 否则它会把技能按钮的点击吃掉。
  glow.eventMode = 'none';
  hudLayer.addChild(glow);
  /** 本次布局里要发光的按钮圆心（HUD 局部坐标） */
  let glowSpots: Vec2[] = [];

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
    const k = 0.6 + 0.4 * Math.sin(now / 260);

    if (toast.visible) {
      const left = toastUntil - now;
      if (left <= 0) toast.visible = false;
      else if (left < 400) toast.alpha = left / 400;
    }

    glow.clear();
    if (glow.visible) {
      for (const c of glowSpots) {
        glow.lineStyle(3, 0xffe9a8, 0.22 + 0.5 * k);
        glow.drawCircle(c.x, c.y, BAR_H / 2 + 2 + 1.5 * k);
        glow.lineStyle(2, 0xffffff, 0.1 + 0.22 * k);
        glow.drawCircle(c.x, c.y, BAR_H / 2 + 6 + 3 * k);
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

  /**
   * 只在**额度格说不清**的时候出文字。
   *
   * 常规回合里「移动/技能/普攻」三个格已经把能做什么讲完了，再叠一行
   * 「点蓝格移动」就是同一件事说两遍，而这行字还要占棋盘。
   * 剩下两种情况格子表达不了：瞄准态（要点哪儿）、以及无路可走（该点待机）。
   */
  function hintText(s: ManualUiState): string {
    if (s.phase === 'aim') {
      return s.skillCandidateCells.length > 0 ? '点高亮目标释放' : '点任意处确认释放';
    }
    const stuck = !s.pending.canMove && !s.pending.canSkill && !s.pending.canAttack;
    return stuck ? '无可用行动，点待机结束' : '';
  }

  /** 三个额度格；返回整体宽度供居中 */
  function rebuildBudget(s: ManualUiState): number {
    budget.removeChildren().forEach((c) => c.destroy({ children: true }));
    const slots: { label: string; done: boolean; open: boolean }[] = [
      { label: '移动', done: s.pending.didMove, open: s.pending.canMove },
      { label: '技能', done: s.pending.didSkill, open: s.pending.canSkill },
      { label: '普攻', done: s.pending.didAttack, open: s.pending.canAttack },
    ];
    const h = 15;
    const gap = 3;
    let x = 0;
    for (const sl of slots) {
      const tx = new PIXI.Text(sl.label, {
        fill: sl.done ? 0x9fe08a : (sl.open ? 0xfff0c0 : 0x9a9a9a),
        fontSize: 9,
        fontWeight: 'bold',
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
    if (s.phase === 'aim') {
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
      if (s.pending.canUndoMove) {
        btns.push(createRoundIconButton({
          iconKey: 'act_undo', fallback: '撤销', tone: ACTION_TONE, dim: false,
          onTap: () => emit({ kind: 'undo' }),
        }));
      }
      btns.push(createRoundIconButton({
        iconKey: 'act_wait', fallback: '待机', tone: ACTION_TONE, dim: false,
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
        drawCells(s.skillRangeCells, SKILL_COLOR, 0.2);
        drawCells(s.skillCandidateCells, SKILL_COLOR, 0.45);
      } else {
        if (s.pending.canMove) drawCells(s.moveCells, MOVE_COLOR, 0.22);
        if (s.pending.canAttack) drawCells(s.attackCells, ATTACK_COLOR, 0.3);
      }
      active = s.activeCell;
      highlight.visible = true;
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

    hide(): void {
      if (destroyed) return;
      highlight.clear();
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

