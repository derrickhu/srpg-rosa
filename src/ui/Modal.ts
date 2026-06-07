import * as PIXI from 'pixi.js';
import { C } from '@/view/mvpTheme';
import { makePanel } from './Panel';

export interface ModalOptions {
  screenWidth: number;
  screenHeight: number;
  panelWidth?: number;
  panelHeight?: number;
  dimAlpha?: number;
}

/**
 * Full-screen dim + centred panel.
 * Returns { root, panel, close }.
 * Call close() to remove and destroy.
 */
export function createModal(opts: ModalOptions): {
  root: PIXI.Container;
  panel: PIXI.Container;
  close: () => void;
} {
  const root = new PIXI.Container();
  root.eventMode = 'static';

  const dim = new PIXI.Graphics();
  dim.beginFill(0x000000, opts.dimAlpha ?? 0.55);
  dim.drawRect(0, 0, opts.screenWidth, opts.screenHeight);
  dim.endFill();
  dim.eventMode = 'static';
  root.addChild(dim);

  const pw = opts.panelWidth ?? 300;
  const ph = opts.panelHeight ?? 400;
  const panel = makePanel({
    width: pw,
    height: ph,
    x: Math.floor((opts.screenWidth - pw) / 2),
    y: Math.floor((opts.screenHeight - ph) / 2),
  });
  root.addChild(panel);

  function close(): void {
    if (root.parent) root.parent.removeChild(root);
    root.destroy({ children: true });
  }

  dim.on('pointertap', (e) => {
    if (e.target === dim) close();
  });

  return { root, panel, close };
}
