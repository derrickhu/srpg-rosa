import * as PIXI from 'pixi.js';
import { makeText, textStyle } from '@/theme/typography';
import type { SkillSpec } from '@/data/skillCatalog';
import { describeReach, describeSkillSpec } from '@/data/skillText';
import { getSkillMod, isExclusiveMod, type SkillModRarity } from '@/data/skillModCatalog';
import { createUiIcon } from '@/view/renderHelpers';

/**
 * 单位信息面板：布阵页和战斗页共用同一块渲染。
 *
 * 两边看的是同一件事——「这个人现在什么状态、带什么招」。做成两份的话，
 * 迟早出现布阵页写着一个数、战斗里点开写着另一个数，而玩家没法判断该信谁。
 * 所以这里只认一个**展示模型**，数值怎么算是调用方（`unitInfoModel.ts`）的事。
 */
export interface UnitInfoStat {
  label: string;
  value: string;
}

export interface UnitInfoSkillSection {
  /** 段标题，如「装备技能」「临时技能（本局）」 */
  title: string;
  name: string;
  nameColor: number;
  iconKey: string;
  /** **折进词条之后**的规格：面板写的必须就是战斗里结算的 */
  spec: SkillSpec;
  /** 原始规格，只用来标出冷却被词条缩短了 */
  baseSpec: SkillSpec;
  /** 冷却行后面的补充，如战斗中的「剩 2 回合」 */
  cooldownNote?: string;
  /** 画范围格子图。临时技能不画，否则面板长到要滚动 */
  showRange: boolean;
  extraDesc?: string[];
  /** 「本局加成」清单挂在这一段的格子图旁边；只给主技能段 */
  modIds?: readonly string[];
}

export interface UnitInfoModel {
  name: string;
  subtitle: string;
  /**
   * 48px 头像的**工厂**，不是画好的对象。
   *
   * 模型要能在没有 DOM 的环境里构造（单测拿它核对面板数值和战斗结算是否一致），
   * 而 `createUnitToken` 会 new Graphics，那一步必须推迟到真要渲染的时候。
   */
  createPortrait: () => PIXI.Container;
  stats: UnitInfoStat[];
  strikeTitle: string;
  strike: UnitInfoStat[];
  skills: UnitInfoSkillSection[];
  /** 战斗中生效的限时状态，如「中毒: 每回合 -6 血（剩 2 回合）」 */
  statuses?: string[];
}

const LABEL_STYLE = textStyle('caption', { fill: 0xaaa088 });
const VALUE_STYLE = textStyle('uiStrong', { fill: 0x3a3a2a, fontSize: 12 });
const SECTION_STYLE = textStyle('uiStrong', { fill: 0x6b4c2a, fontSize: 13 });
const LINE_H = 20;

/** 词条稀有度 → 米色面板上的字色（三选一卡是深底，那套色直接搬过来会发飘） */
const MOD_TEXT_COLOR: Record<SkillModRarity, number> = {
  common: 0x5a6a7a,
  rare: 0x2f6fae,
  epic: 0xa5561f,
};

/**
 * 「本局加成」清单：图标 + 名称×层数 + 这一层的实际效果。
 *
 * 只写名字不够——「锋锐×2」到底是 +25% 还是 +50%，玩家没法从名字里读出来，
 * 而这正是他决定要不要再叠一层的依据，所以每条都带上按层数算好的描述。
 *
 * 挂不上当前技能的词条（比如给纯治疗技挂「淬毒」）也列，压暗并注明原因：
 * 词条是跟着角色走的，换回能用的技能它就活了，直接藏掉会让玩家以为东西丢了。
 */
function buildRunModList(
  modIds: readonly string[],
  spec: SkillSpec,
  width: number,
): PIXI.Container | null {
  if (modIds.length === 0) return null;
  const counted = new Map<string, number>();
  for (const id of modIds) counted.set(id, (counted.get(id) ?? 0) + 1);

  const box = new PIXI.Container();
  const title = makeText('本局加成', 'caption', { fill: 0x6b4c2a, fontSize: 10, fontWeight: 'bold' });
  box.addChild(title);
  let y = title.height + 4;

  for (const [modId, rawN] of counted) {
    const mod = getSkillMod(modId);
    if (!mod) continue;
    const n = Math.min(rawN, mod.maxStacks);
    const live = mod.canApply(spec);

    const row = new PIXI.Container();
    row.y = y;
    row.alpha = live ? 1 : 0.5;

    const icon = createUiIcon(mod.icon, 14);
    if (icon) {
      icon.y = -1;
      row.addChild(icon);
    }
    const textX = icon ? 18 : 0;

    // 专属词条标出来：它换个技能就再也拿不到，玩家换招前得知道自己会丢什么
    const label = isExclusiveMod(mod) ? `${mod.name}（专属）` : n > 1 ? `${mod.name}×${n}` : mod.name;
    const name = makeText(label, 'caption', {
      fill: live ? MOD_TEXT_COLOR[mod.rarity] : 0x8a8a7a,
      fontSize: 10,
      fontWeight: 'bold',
    });
    name.x = textX;
    row.addChild(name);

    const desc = makeText(live ? mod.describe(n) : '当前技能用不到，换回可用技能即恢复', 'micro', {
      fill: 0x7a7a6a,
      lineHeight: 12,
      wordWrap: true,
      wordWrapWidth: Math.max(60, width - textX),
    });
    desc.x = textX;
    desc.y = name.height + 1;
    row.addChild(desc);

    box.addChild(row);
    y += name.height + 1 + desc.height + 5;
  }

  // 一条都挂不上时只剩个标题，不如不画
  return box.children.length > 1 ? box : (box.destroy({ children: true }), null);
}

type CellKind = 'empty' | 'center' | 'hit' | 'ray';

/** 技能范围示意格 + 右侧的本局加成 + 下方的范围说明与图例 */
function buildRangeRow(
  spec: SkillSpec,
  modIds: readonly string[] | undefined,
  panelW: number,
  onTick: (cells: PIXI.Graphics[]) => void,
): { view: PIXI.Container; height: number } {
  const shape = spec.shape;
  const cs = 12;
  const gap = 1;
  const st2 = cs + gap;

  let gridR = 2;
  let rangeDesc = '';
  const isLine = shape.type === 'lineBestRayAllFoes';
  if (shape.type === 'neighborAoE') {
    gridR = shape.manhattan + 1;
    rangeDesc = `周围${shape.manhattan}格范围\n命中所有敌人`;
  } else if (shape.type === 'discAoE') {
    // 「横扫」「势不可挡」把环摊成整片圆，格子图必须跟着变——
    // 词条改了形状却画老图的话，玩家会照着错的范围走位。
    gridR = shape.radius + 1;
    rangeDesc = `周围${shape.radius}格全覆盖\n命中所有敌人`;
  } else if (shape.type === 'neighborPickLowest') {
    gridR = shape.manhattan + 1;
    rangeDesc = `${describeReach(shape.manhattan, 'exact')}\n选中血量最低的敌人`;
  } else if (shape.type === 'neighborPickFoe') {
    gridR = shape.manhattan + 1;
    const pickLabel = shape.pick === 'lowestHp' ? '血量最低' : '血量最高';
    rangeDesc = `${describeReach(shape.manhattan, shape.reach)}\n选中${pickLabel}的敌人`;
  } else if (shape.type === 'neighborPickAlly') {
    gridR = shape.manhattan + 1;
    const pickLabel = shape.pick === 'lowestHp' ? '血量最低' : '血量最高';
    rangeDesc = `周围${shape.manhattan}格范围\n选中${pickLabel}的友方`;
  } else if (shape.type === 'selfCast') {
    gridR = 1;
    rangeDesc = '对自己释放\n无需选择目标';
  } else if (isLine) {
    gridR = 3;
    rangeDesc = '上下左右四方向\n射线穿透所有敌人';
  }
  const gridD = gridR * 2 + 1;

  const cells: CellKind[][] = [];
  for (let gy = 0; gy < gridD; gy++) {
    cells.push([]);
    for (let gx = 0; gx < gridD; gx++) cells[gy]!.push('empty');
  }
  cells[gridR]![gridR] = 'center';

  if (shape.type === 'neighborAoE' || shape.type === 'neighborPickLowest'
      || shape.type === 'neighborPickFoe' || shape.type === 'neighborPickAlly'
      || shape.type === 'discAoE') {
    const md = shape.type === 'discAoE' ? shape.radius : shape.manhattan;
    /*
     * 整片（曼哈顿 <= md）还是一圈环（正好 = md）。
     *
     * 这里原先无条件按整片画，而除 `discAoE` 和 `reach: 'within'` 以外的形状都是环：
     * 「长驱突刺」（正好 2 格）的图因此多画了 4 个贴脸格，玩家照图走到敌人旁边，
     * 技能却点不出来。md 为 1 时环和整片恰好一样，所以这个错一直被邻格技能盖着，
     * 只有 2 格以上的技能会露出来。
     */
    const solid = shape.type === 'discAoE'
      || (shape.type === 'neighborPickFoe' && shape.reach === 'within');
    for (let dy = -md; dy <= md; dy++) {
      for (let dx = -md; dx <= md; dx++) {
        if (dx === 0 && dy === 0) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (solid ? d <= md : d === md) cells[gridR + dy]![gridR + dx] = 'hit';
      }
    }
  } else if (isLine) {
    for (const [ddx, ddy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      for (let s = 1; s <= gridR; s++) {
        const gx = gridR + ddx! * s;
        const gy = gridR + ddy! * s;
        if (gx >= 0 && gx < gridD && gy >= 0 && gy < gridD) cells[gy]![gx] = 'ray';
      }
    }
  }

  const gridTotalW = gridD * st2 - gap;
  const row = new PIXI.Container();

  const gridContainer = new PIXI.Container();
  const hitCells: PIXI.Graphics[] = [];
  for (let gy = 0; gy < gridD; gy++) {
    for (let gx = 0; gx < gridD; gx++) {
      const kind = cells[gy]![gx]!;
      const px = gx * st2;
      const py = gy * st2;
      const cell = new PIXI.Graphics();
      if (kind === 'center') {
        cell.beginFill(0x4488cc, 0.85);
        cell.drawRoundedRect(px, py, cs, cs, 2);
        cell.endFill();
      } else if (kind === 'hit' || kind === 'ray') {
        cell.beginFill(kind === 'ray' ? 0xdd6633 : 0xcc3333, 0.7);
        cell.drawRoundedRect(px, py, cs, cs, 2);
        cell.endFill();
        hitCells.push(cell);
      } else {
        cell.lineStyle(1, 0xccccbb, 0.25);
        cell.beginFill(0xeeeedd, 0.12);
        cell.drawRoundedRect(px, py, cs, cs, 1);
        cell.endFill();
      }
      gridContainer.addChild(cell);
    }
  }

  // 射线技能在四个边缘画箭头，表示延伸
  if (isLine) {
    const arrowStyle = textStyle('micro', { fill: 0xdd6633, fontSize: 8 });
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
  row.addChild(gridContainer);

  const colX = 16 + gridTotalW + 12;
  const colW = panelW - 12 - colX;

  // 本局词条：占掉格子图右边那块空地。
  //
  // 之前只有背包里能翻到，而玩家真正想核对「这一局攒了什么」的时机，恰恰是开打前
  // 对着这个面板看阵容。摆在技能格子旁边还顺带说清了归属：改的就是上面那一招。
  const modsBlock = modIds ? buildRunModList(modIds, spec, colW) : null;

  // 词条把右列占了的话，范围说明和图例挪到格子下面排成一行。
  // 反过来把词条压到下面是不行的：右列只剩说明文字下面那几像素，
  // 一条「技能伤害提升 50%」就要折三行。
  const descBelow = modsBlock !== null;
  const rangeDescTx = makeText(descBelow ? rangeDesc.replace(/\n/g, ' · ') : rangeDesc, 'caption', {
    fill: 0x6a6a5a, fontSize: 10, lineHeight: 15,
    wordWrap: true, wordWrapWidth: descBelow ? panelW - 32 : colW,
  });
  if (descBelow) {
    rangeDescTx.x = 16;
    // 让到词条那一列的下面，而不是只让过格子图：词条攒多了会比格子高，
    // 按格子高度排会直接压在最后一条词条上。
    rangeDescTx.y = Math.max(gridTotalW, modsBlock?.height ?? 0) + 8;
  } else {
    rangeDescTx.x = colX;
    rangeDescTx.y = Math.max(0, (gridTotalW - rangeDescTx.height) / 2);
  }
  row.addChild(rangeDescTx);

  if (modsBlock) {
    modsBlock.x = colX;
    row.addChild(modsBlock);
  }

  // 图例。跟着说明走：在右列时排在它下面，在下方时右对齐到同一行
  const legendY = descBelow
    ? rangeDescTx.y + Math.max(0, rangeDescTx.height - 12)
    : rangeDescTx.y + rangeDescTx.height + 6;
  const legendX = descBelow
    ? Math.max(rangeDescTx.x + rangeDescTx.width + 12, panelW - 12 - 78)
    : colX;

  const legCenterDot = new PIXI.Graphics();
  legCenterDot.beginFill(0x4488cc, 0.85);
  legCenterDot.drawRoundedRect(0, 0, 8, 8, 2);
  legCenterDot.endFill();
  legCenterDot.x = legendX;
  legCenterDot.y = legendY;
  row.addChild(legCenterDot);
  const legCenterTx = makeText('自身', 'micro', { fill: 0x888877 });
  legCenterTx.x = legendX + 12;
  legCenterTx.y = legendY - 1;
  row.addChild(legCenterTx);

  const legHitDot = new PIXI.Graphics();
  legHitDot.beginFill(isLine ? 0xdd6633 : 0xcc3333, 0.7);
  legHitDot.drawRoundedRect(0, 0, 8, 8, 2);
  legHitDot.endFill();
  legHitDot.x = legCenterTx.x + legCenterTx.width + 10;
  legHitDot.y = legendY;
  row.addChild(legHitDot);
  const legHitTx = makeText('范围', 'micro', { fill: 0x888877 });
  legHitTx.x = legHitDot.x + 12;
  legHitTx.y = legendY - 1;
  row.addChild(legHitTx);

  onTick(hitCells);

  const height = Math.max(
    gridTotalW,
    legendY + 14,
    rangeDescTx.y + rangeDescTx.height,
    modsBlock ? modsBlock.height : 0,
  );
  return { view: row, height };
}

function separator(panelW: number, y: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.lineStyle(1, 0xd0c8b8, 0.6);
  g.moveTo(12, y);
  g.lineTo(panelW - 12, y);
  return g;
}

/** 两列键值区，返回占用高度 */
function addStatGrid(
  panel: PIXI.Container,
  items: UnitInfoStat[],
  panelW: number,
  top: number,
): number {
  const colW = Math.floor((panelW - 24) / 2);
  for (let i = 0; i < items.length; i++) {
    const s = items[i]!;
    const sx = 16 + (i % 2) * colW;
    const sy = top + Math.floor(i / 2) * LINE_H;
    const lb = new PIXI.Text(s.label, LABEL_STYLE);
    lb.x = sx;
    lb.y = sy;
    panel.addChild(lb);
    const vl = new PIXI.Text(s.value, VALUE_STYLE);
    vl.x = sx + 36;
    vl.y = sy;
    panel.addChild(vl);
  }
  return Math.ceil(items.length / 2) * LINE_H;
}

export interface UnitInfoPanel {
  view: PIXI.Container;
  height: number;
  /** 范围格子的呼吸动画；面板销毁时要调 */
  stop(): void;
}

export function createUnitInfoPanel(model: UnitInfoModel, panelW: number): UnitInfoPanel {
  const panel = new PIXI.Container();
  panel.eventMode = 'static';

  const tickers: (() => void)[] = [];
  let cy = 16;

  const portrait = model.createPortrait();
  portrait.x = 30;
  portrait.y = cy + 24;
  panel.addChild(portrait);

  const nameTx = makeText(model.name, 'title', { fill: 0x3a3a2a, fontSize: 16 });
  nameTx.x = 62;
  nameTx.y = cy + 6;
  panel.addChild(nameTx);

  const subTx = makeText(model.subtitle, 'body', { fill: 0x8a7a5a });
  subTx.x = 62;
  subTx.y = cy + 28;
  panel.addChild(subTx);

  cy += 56;

  panel.addChild(separator(panelW, cy));
  cy += 8;

  const secBase = new PIXI.Text('基础属性', SECTION_STYLE);
  secBase.x = 12;
  secBase.y = cy;
  panel.addChild(secBase);
  cy += LINE_H + 2;
  cy += addStatGrid(panel, model.stats, panelW, cy) + 8;

  // 限时状态。战斗中点开才有内容——「他为什么突然打这么疼」只能在这里回答。
  if (model.statuses?.length) {
    panel.addChild(separator(panelW, cy));
    cy += 8;
    const secSt = new PIXI.Text('当前状态', SECTION_STYLE);
    secSt.x = 12;
    secSt.y = cy;
    panel.addChild(secSt);
    cy += LINE_H + 2;
    const tx = makeText(model.statuses.join('\n'), 'caption', {
      fill: 0x555544, fontSize: 10, lineHeight: 16,
      wordWrap: true, wordWrapWidth: panelW - 32,
    });
    tx.x = 16;
    tx.y = cy;
    panel.addChild(tx);
    cy += tx.height + 8;
  }

  panel.addChild(separator(panelW, cy));
  cy += 8;

  const secStrike = new PIXI.Text(model.strikeTitle, SECTION_STYLE);
  secStrike.x = 12;
  secStrike.y = cy;
  panel.addChild(secStrike);
  cy += LINE_H + 2;
  cy += addStatGrid(panel, model.strike, panelW, cy) + 8;

  for (const sk of model.skills) {
    panel.addChild(separator(panelW, cy));
    cy += 8;

    const sec = new PIXI.Text(sk.title, SECTION_STYLE);
    sec.x = 12;
    sec.y = cy;
    panel.addChild(sec);
    cy += LINE_H + 2;

    // 技能图标：战斗操作条、三选一卡片、这里用的是同一张图。
    // 玩家在这三处认的是同一个符号，换到战斗里那排无字圆钮才不用重新学。
    const icon = createUiIcon(sk.iconKey, 22);
    if (icon) {
      icon.x = 16;
      icon.y = cy - 3;
      panel.addChild(icon);
    }
    const nameX = icon ? 42 : 16;

    const skName = makeText(sk.name, 'uiStrong', { fill: sk.nameColor, fontSize: 13 });
    skName.x = nameX;
    skName.y = cy;
    panel.addChild(skName);

    const cdText = `CD: ${sk.spec.cooldown}回合${sk.cooldownNote ?? ''}`;
    const cdTx = makeText(cdText, 'caption', {
      fill: sk.spec.cooldown < sk.baseSpec.cooldown ? 0x3a8a5a : 0x888888,
    });
    cdTx.x = nameX + skName.width + 10;
    cdTx.y = cy + 2;
    panel.addChild(cdTx);
    cy += LINE_H;

    const descTx = makeText([...describeSkillSpec(sk.spec), ...(sk.extraDesc ?? [])].join('\n'), 'body', {
      fill: 0x555544, fontSize: 10, lineHeight: 16,
      wordWrap: true, wordWrapWidth: panelW - 32,
    });
    descTx.x = 16;
    descTx.y = cy;
    panel.addChild(descTx);
    cy += descTx.height + 8;

    if (sk.showRange) {
      const { view, height } = buildRangeRow(sk.spec, sk.modIds, panelW, (hitCells) => {
        let phase = 0;
        tickers.push(() => {
          phase += 0.06;
          const a = 0.45 + 0.35 * Math.sin(phase);
          for (const c of hitCells) c.alpha = a;
        });
      });
      view.y = cy;
      panel.addChild(view);
      cy += height + 8;
    }
  }

  cy += 12;

  const bg = new PIXI.Graphics();
  bg.beginFill(0xfefef6, 0.97);
  bg.drawRoundedRect(0, 0, panelW, cy, 14);
  bg.endFill();
  panel.addChildAt(bg, 0);

  // 场景可能被 SceneManager 整棵拆掉而不经过 `stop()`（战斗结束时面板还开着），
  // 所以 ticker 自己也要能发现容器没了并摘掉自己，否则它会一直抓着这棵树不放。
  const tick = (): void => {
    if (panel.destroyed) {
      PIXI.Ticker.shared.remove(tick);
      return;
    }
    for (const t of tickers) t();
  };
  if (tickers.length > 0) PIXI.Ticker.shared.add(tick);

  return {
    view: panel,
    height: cy,
    stop: () => PIXI.Ticker.shared.remove(tick),
  };
}

/**
 * 遮罩 + 居中面板 + 点遮罩关闭。两个页面都要这一套，别各写一遍。
 *
 * 面板自己吃掉点击（`eventMode: 'static'`），否则点面板正文也会把它关掉。
 */
export function createUnitInfoOverlay(
  model: UnitInfoModel,
  screenW: number,
  screenH: number,
  onClose: () => void,
): { view: PIXI.Container; stop(): void } {
  const root = new PIXI.Container();

  const dim = new PIXI.Graphics();
  dim.beginFill(0x000000, 0.5);
  dim.drawRect(0, 0, screenW, screenH);
  dim.endFill();
  dim.eventMode = 'static';
  dim.on('pointertap', onClose);
  root.addChild(dim);

  const panelW = Math.min(300, screenW - 32);
  const panel = createUnitInfoPanel(model, panelW);
  panel.view.x = Math.floor((screenW - panelW) / 2);
  // 面板可能比屏幕高（词条攒满 + 长技能说明），那就贴顶而不是居中溢出到看不见
  panel.view.y = Math.max(8, Math.floor((screenH - panel.height) / 2));
  root.addChild(panel.view);

  return { view: root, stop: panel.stop };
}
