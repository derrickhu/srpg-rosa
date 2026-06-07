import * as PIXI from 'pixi.js';

/**
 * Minimal vertical scroll container using a mask.
 * Add children to `content`; the container clips to the visible area.
 */
export function createScrollList(opts: {
  width: number;
  height: number;
  x?: number;
  y?: number;
}): { root: PIXI.Container; content: PIXI.Container } {
  const root = new PIXI.Container();
  root.x = opts.x ?? 0;
  root.y = opts.y ?? 0;

  const maskG = new PIXI.Graphics();
  maskG.beginFill(0xffffff);
  maskG.drawRect(0, 0, opts.width, opts.height);
  maskG.endFill();
  root.addChild(maskG);

  const content = new PIXI.Container();
  content.mask = maskG;
  root.addChild(content);

  let startY = 0;
  let contentStartY = 0;

  root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, opts.width, opts.height);

  root.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    startY = e.globalY;
    contentStartY = content.y;
  });
  root.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
    if (e.pressure <= 0) return;
    const dy = e.globalY - startY;
    const maxScroll = Math.min(0, opts.height - content.height);
    content.y = Math.max(maxScroll, Math.min(0, contentStartY + dy));
  });

  return { root, content };
}
