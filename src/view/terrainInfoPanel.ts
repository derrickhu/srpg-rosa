import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { getTerrainSpec } from '@/data/terrainSpec';
import type { TerrainId } from '@/battle/types';
import { createTerrainCell, terrainInfoLines } from '@/view/renderHelpers';

/**
 * 地形信息卡：点棋盘上的格子弹出来。
 *
 * 为什么需要它，而格上那个 5 字角标不够：角标只出得下**一条**效果（这是「一种地形
 * 只有一个动词」换来的，见 `terrainSpec.ts`），移动消耗从来没地方写，而移动消耗
 * 恰恰是河流和沼泽最贵的那部分代价。地形种类还会随章节增加（燃烧、焦土……），
 * 靠玩家从贴图猜规则只会让新地形变成「莫名其妙掉血」。
 *
 * 做成点开才看的卡而不是常驻信息条：布阵那 30 秒里屏幕已经很满，
 * 而地形规则是学一次就记住的东西，不需要一直摆着。
 */
export function createTerrainInfoOverlay(
  terrainId: TerrainId,
  screenW: number,
  screenH: number,
  onClose: () => void,
): PIXI.Container {
  const root = new PIXI.Container();

  const dim = new PIXI.Graphics();
  dim.beginFill(0x000000, 0.5);
  dim.drawRect(0, 0, screenW, screenH);
  dim.endFill();
  dim.eventMode = 'static';
  dim.on('pointertap', onClose);
  root.addChild(dim);

  const panelW = Math.min(260, screenW - 40);
  const panel = new PIXI.Container();
  // 面板自己吃掉点击，否则点正文也会顺着落到遮罩上把卡关掉
  panel.eventMode = 'static';

  const spec = getTerrainSpec(terrainId);
  const swatch = 44;
  let cy = 14;

  // 把这一格的贴图原样放进卡里：玩家是从棋盘上点进来的，得先确认「说的就是我点的那格」
  const tile = createTerrainCell(terrainId, swatch);
  tile.x = 14;
  tile.y = cy;
  panel.addChild(tile);

  const nameTx = makeText(spec.name, 'title', { fill: 0x3a3a2a, fontSize: 16 });
  nameTx.x = 14 + swatch + 12;
  nameTx.y = cy + 12;
  panel.addChild(nameTx);

  cy += swatch + 10;

  const body = makeText(terrainInfoLines(terrainId).join('\n'), 'body', {
    fill: 0x555544,
    fontSize: 11,
    lineHeight: 18,
    wordWrap: true,
    wordWrapWidth: panelW - 28,
  });
  body.x = 14;
  body.y = cy;
  panel.addChild(body);
  cy += body.height + 14;

  const bg = new PIXI.Graphics();
  bg.beginFill(0xfefef6, 0.97);
  bg.drawRoundedRect(0, 0, panelW, cy, 14);
  bg.endFill();
  panel.addChildAt(bg, 0);

  panel.x = Math.floor((screenW - panelW) / 2);
  panel.y = Math.max(8, Math.floor((screenH - cy) / 2));
  root.addChild(panel);

  return root;
}
