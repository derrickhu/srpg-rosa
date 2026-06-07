import * as PIXI from 'pixi.js';

export interface UnitOverheadOptions {
  maxHp: number;
  currentHp: number;
  professionName: string;
  faction: 'player' | 'enemy';
  cell: number;
}

export interface UnitOverheadHandle {
  readonly root: PIXI.Container;
  updateHp: (currentHp: number, maxHp?: number) => void;
  destroy: () => void;
}

const HP_BG = 0x1a0505;

const PLAYER_HP_BORDER = 0x2d8a2d;
const PLAYER_HP_FILL = 0x44bb44;
const ENEMY_HP_BORDER = 0xcc3333;
const ENEMY_HP_FILL = 0xb82a2a;

/**
 * 单位头顶：血条 + 职业名（同一行，职业在血条右侧）。
 * 整体在角色上方，本地坐标 y=0 为底边。
 */
export function createUnitOverhead(opts: UnitOverheadOptions): UnitOverheadHandle {
  const root = new PIXI.Container();
  let maxHp = Math.max(1, opts.maxHp);
  let curHp = Math.min(Math.max(0, opts.currentHp), maxHp);

  const isPlayer = opts.faction === 'player';
  const hpBorder = isPlayer ? PLAYER_HP_BORDER : ENEMY_HP_BORDER;
  const hpFillColor = isPlayer ? PLAYER_HP_FILL : ENEMY_HP_FILL;

  const barW = Math.max(18, Math.floor(opts.cell * 0.52));
  const barH = Math.max(3, Math.floor(opts.cell * 0.09));
  const labelFs = Math.max(7, Math.min(10, Math.floor(opts.cell * 0.18)));

  const label = new PIXI.Text(opts.professionName, {
    fill: 0xffffff,
    fontSize: labelFs,
    fontWeight: 'bold',
  });
  label.anchor.set(0, 0.5);

  const totalW = barW + 3 + label.width;

  const hpBg = new PIXI.Graphics();
  const hpFill = new PIXI.Graphics();

  function redrawBar(): void {
    hpBg.clear();
    hpFill.clear();
    const x0 = -totalW / 2;
    const y0 = -barH;
    hpBg.lineStyle(1, hpBorder, 1);
    hpBg.beginFill(HP_BG, 0.95);
    hpBg.drawRoundedRect(x0, y0, barW, barH, 2);
    hpBg.endFill();
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, curHp / maxHp)) : 0;
    const innerW = barW - 4;
    const fillW = Math.max(0, innerW * ratio);
    hpFill.beginFill(hpFillColor, 1);
    hpFill.drawRoundedRect(x0 + 2, y0 + 1, fillW, barH - 2, 1);
    hpFill.endFill();
  }

  label.x = -totalW / 2 + barW + 3;
  label.y = -barH / 2;

  root.addChild(hpBg);
  root.addChild(hpFill);
  root.addChild(label);

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
