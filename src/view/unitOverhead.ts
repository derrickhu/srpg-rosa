import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { C } from '@/view/mvpTheme';

export interface UnitOverheadOptions {
  maxHp: number;
  currentHp: number;
  faction: 'player' | 'enemy';
  cell: number;
}

export interface UnitOverheadHandle {
  readonly root: PIXI.Container;
  updateHp: (currentHp: number, maxHp?: number) => void;
  destroy: () => void;
}

const HP_BG = 0x1a1410;

const PLAYER_HP_BORDER = 0x1a5a1a;
const PLAYER_HP_FILL = 0x3cb83c;
const ENEMY_HP_BORDER = 0x8c2020;
const ENEMY_HP_FILL = 0xd4453a;

/** 头顶只写当前血量。最大生命看条长，不写成 25/40。 */
export function formatHpLabel(currentHp: number, maxHp: number): string {
  const max = Math.max(1, Math.floor(maxHp));
  const cur = Math.min(max, Math.max(0, Math.floor(currentHp)));
  return `${cur}`;
}

/**
 * 布阵页静态 token 的血条 y。
 *
 * token 锚在格心、高度 `cell-4`，头顶约在 `-tokenH/2`。
 * 战斗用的 `unitHeadLocalY` 按「脚在格心下方 0.2 格」算，套到 token 上会整条悬到格子顶。
 * 往里收几个像素：帧上沿多半是透明，贴死包围盒顶仍会空一截。
 */
export function tokenOverheadLocalY(cell: number, bossScale = 1): number {
  const tokenH = Math.max(24, cell - 4);
  return -tokenH / 2 * bossScale + 8;
}

/**
 * 单位头顶：细血条，数字坐在条上方，不叠进填充里。
 * 本地坐标 y=0 为底边。战斗对齐 `unitHeadLocalY`；布阵对齐 `tokenOverheadLocalY`。
 */
export function createUnitOverhead(opts: UnitOverheadOptions): UnitOverheadHandle {
  const root = new PIXI.Container();
  let maxHp = Math.max(1, opts.maxHp);
  let curHp = Math.min(Math.max(0, opts.currentHp), maxHp);

  const isPlayer = opts.faction === 'player';
  const hpBorder = isPlayer ? PLAYER_HP_BORDER : ENEMY_HP_BORDER;
  const hpFillColor = isPlayer ? PLAYER_HP_FILL : ENEMY_HP_FILL;

  const barW = Math.max(28, Math.floor(opts.cell * 0.78));
  const barH = Math.max(6, Math.floor(opts.cell * 0.15));
  const labelFs = Math.max(9, Math.min(11, Math.floor(opts.cell * 0.22)));

  const hpBg = new PIXI.Graphics();
  const hpFill = new PIXI.Graphics();
  const hpTx = makeText(formatHpLabel(curHp, maxHp), 'uiStrong', {
    fill: C.paper,
    fontSize: labelFs,
    stroke: C.ink,
    strokeThickness: 2,
  });
  hpTx.anchor.set(0.5, 1);

  function redrawBar(): void {
    hpBg.clear();
    hpFill.clear();
    const x0 = -barW / 2;
    const y0 = -barH;
    hpBg.lineStyle(1.5, hpBorder, 1);
    hpBg.beginFill(HP_BG, 0.88);
    hpBg.drawRoundedRect(x0, y0, barW, barH, 3);
    hpBg.endFill();
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, curHp / maxHp)) : 0;
    const pad = 1.5;
    const fillW = Math.max(0, (barW - pad * 2) * ratio);
    hpFill.beginFill(hpFillColor, 1);
    hpFill.drawRoundedRect(x0 + pad, y0 + pad, fillW, barH - pad * 2, 2);
    hpFill.endFill();
    hpTx.text = formatHpLabel(curHp, maxHp);
    hpTx.x = 0;
    hpTx.y = y0 - 1;
  }

  root.addChild(hpBg);
  root.addChild(hpFill);
  root.addChild(hpTx);
  redrawBar();

  return {
    root,
    updateHp(currentHp: number, nextMax?: number): void {
      if (nextMax !== undefined) maxHp = Math.max(1, nextMax);
      curHp = Math.min(Math.max(0, currentHp), maxHp);
      redrawBar();
    },
    destroy(): void {
      root.destroy({ children: true });
    },
  };
}
