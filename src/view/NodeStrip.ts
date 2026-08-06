import * as PIXI from 'pixi.js';
import type { DungeonDef } from '@/data/dungeonCatalog';
import { createUiIcon, drawCheck } from '@/view/renderHelpers';
import { C } from '@/view/mvpTheme';

export interface NodeStripOptions {
  /**
   * 当前节点下标。**未开打的章节传 0 而不是 -1**：传 -1 十个点全是「未到达」的同一个灰紫，
   * 玩家看不出这一章从哪儿开始；传 0 则第一个点带上「你在这」标记，读作「从这里出发」，
   * 这也是事实。已通关的章节传 `nodes.length`，全部标成已过。
   */
  currentIndex: number;
  width: number;
  /** 点击节点（仅冒险页预览用，可选） */
  onTapNode?: (index: number) => void;
}

const DONE_COLOR = 0x5a9e3a;
const CURRENT_COLOR = 0x7ee24a;
const FUTURE_COLOR = 0x6a5f80;
const LINE_COLOR = 0x8a7fa0;

function nodeIcon(kind: string): string | null {
  if (kind === 'shop') return 'node_supply';
  if (kind === 'boss') return 'node_boss';
  return null;
}

/**
 * 当前节点上方的「你在这」倒三角。
 *
 * 光靠圆点变大变亮不够——十个点排成一排，尺寸和色相的差别在扫一眼时读不出来。
 * 一个指下来的标记是唯一一眼就能定位的形式。
 */
function drawHereMarker(): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.lineStyle(2, C.ink, 1, 0);
  g.beginFill(C.paper, 1);
  g.moveTo(-6, -9);
  g.lineTo(6, -9);
  g.lineTo(0, -1);
  g.closePath();
  g.endFill();
  return g;
}

/**
 * 横向节点进度条：已过/当前/未来节点，商店与 Boss 图标。
 * 冒险页章节卡与 Run 内布阵页共用。
 */
export function createNodeStrip(dungeon: DungeonDef, opts: NodeStripOptions): PIXI.Container {
  const root = new PIXI.Container();
  const nodes = dungeon.nodes;
  const n = nodes.length;
  const rBase = 10;
  const pad = rBase + 8;
  const usable = opts.width - pad * 2;
  const stepX = n > 1 ? usable / (n - 1) : 0;

  // 连线
  const line = new PIXI.Graphics();
  line.lineStyle(3, LINE_COLOR, 0.7);
  line.moveTo(pad, 0);
  line.lineTo(pad + usable, 0);
  root.addChild(line);
  if (opts.currentIndex > 0) {
    const doneLine = new PIXI.Graphics();
    doneLine.lineStyle(3, DONE_COLOR, 0.95);
    doneLine.moveTo(pad, 0);
    doneLine.lineTo(pad + stepX * Math.min(opts.currentIndex, n - 1), 0);
    root.addChild(doneLine);
  }

  let battleNo = 0;
  nodes.forEach((node, i) => {
    if (node.kind !== 'shop') battleNo += 1;
    const isCurrent = i === opts.currentIndex;
    const isDone = i < opts.currentIndex;
    const r = isCurrent ? rBase + 4 : rBase;
    const cx = pad + stepX * i;

    const c = new PIXI.Container();
    c.x = cx;

    const g = new PIXI.Graphics();
    if (isCurrent) {
      g.lineStyle(3, 0xffffff, 0.95);
      g.beginFill(CURRENT_COLOR, 1);
    } else {
      g.lineStyle(2, 0xffffff, 0.5);
      g.beginFill(isDone ? DONE_COLOR : FUTURE_COLOR, 1);
    }
    if (node.kind === 'boss') {
      g.clear();
      g.lineStyle(isCurrent ? 3 : 2, 0xffffff, isCurrent ? 0.95 : 0.5);
      g.beginFill(isDone ? DONE_COLOR : isCurrent ? 0xdd4433 : 0x99333a, 1);
    }
    g.drawCircle(0, 0, r);
    g.endFill();
    c.addChild(g);

    const iconKey = nodeIcon(node.kind);
    if (iconKey) {
      // 只占直径的 3/4：图标自带粗描边，铺满会把圆环整个盖掉，
      // 而圆环的颜色正是「已过 / 当前 / 未到」的唯一区分，比图标本身更要紧。
      const size = r * 1.5;
      const it = createUiIcon(iconKey, size);
      if (it) {
        it.x = -size / 2;
        it.y = -size / 2;
        c.addChild(it);
      }
    } else if (isDone) {
      c.addChild(drawCheck(r));
    } else {
      // 序号画在圈里而不是圈下：战斗点没有图标，圈里空着会显得这一格是坏的，
      // 而序号飘在圈外又和补给/BOSS 的文字标签挤成一行分不清谁是谁。
      const num = new PIXI.Text(`${battleNo}`, {
        fill: isCurrent ? C.ink : 0xffffff,
        fontSize: Math.round(r * 1.15),
        fontWeight: 'bold',
      });
      num.anchor.set(0.5);
      c.addChild(num);
    }

    // 只有带图标的节点还需要文字标签；战斗点的序号已经在圈里了
    if (iconKey) {
      const label = new PIXI.Text(node.kind === 'shop' ? '补给' : 'BOSS', {
        fill: isCurrent ? 0xffffff : 0xd8d0e8,
        fontSize: 10,
        fontWeight: isCurrent ? 'bold' : 'normal',
      });
      label.anchor.set(0.5, 0);
      label.y = r + 4;
      c.addChild(label);
    }

    if (isCurrent) {
      const here = drawHereMarker();
      here.y = -r - 3;
      c.addChild(here);
    }

    if (opts.onTapNode) {
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.hitArea = new PIXI.Circle(0, 0, r + 8);
      c.on('pointertap', () => opts.onTapNode!(i));
    }
    root.addChild(c);
  });

  return root;
}
