import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { C } from '@/view/mvpTheme';

export interface RunTitleBanner {
  root: PIXI.Container;
  width: number;
  height: number;
  setSubtitle(text: string): void;
}

/**
 * 局内关卡名：米白字 + 墨描边，没有底板。
 *
 * 白牌子说不清自己是什么，压在草地上还像一块补丁。字自己带描边就够从战场里跳出来，
 * 和大厅 `makeInkTitle`、战斗飘字是同一套。
 */
export function createRunTitleBanner(opts: {
  title: string;
  subtitle?: string;
  maxWidth: number;
}): RunTitleBanner {
  const root = new PIXI.Container();

  const titleTx = makeText(opts.title, 'title', {
    fill: C.paper,
    fontSize: 20,
    letterSpacing: 2,
    stroke: C.ink,
    strokeThickness: 5,
  });
  titleTx.anchor.set(0.5, 0);
  root.addChild(titleTx);

  const subTx = makeText(opts.subtitle ?? '', 'uiStrong', {
    fill: C.paper,
    fontSize: 12,
    stroke: C.ink,
    strokeThickness: 3,
  });
  subTx.anchor.set(0.5, 0);
  root.addChild(subTx);

  let width = 0;
  let height = 0;

  const paint = (subtitle: string): void => {
    titleTx.scale.set(1);
    subTx.scale.set(1);
    subTx.text = subtitle;
    subTx.visible = subtitle.length > 0;
    if (titleTx.width > opts.maxWidth) {
      titleTx.scale.set(opts.maxWidth / titleTx.width);
    }
    const subW = subTx.visible ? subTx.width : 0;
    if (subW > opts.maxWidth) {
      subTx.scale.set(opts.maxWidth / subW);
    }
    width = Math.ceil(Math.max(titleTx.width, subTx.visible ? subTx.width : 0));
    const subH = subTx.visible ? subTx.height : 0;
    height = Math.ceil(titleTx.height + (subH ? subH + 1 : 0));
    titleTx.x = width / 2;
    titleTx.y = 0;
    subTx.x = width / 2;
    subTx.y = titleTx.height;
  };

  paint(opts.subtitle ?? '');

  return {
    root,
    get width() { return width; },
    get height() { return height; },
    setSubtitle(text: string): void {
      paint(text);
    },
  };
}
