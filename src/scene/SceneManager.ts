import * as PIXI from 'pixi.js';
import type { Scene, ScreenSize } from './Scene';

/**
 * Manages a stack of scenes.
 * Only the top scene is visible.  push/replace/pop handle lifecycle (enter/exit).
 */
export class SceneManager {
  private readonly stack: Scene[] = [];

  constructor(private readonly stage: PIXI.Container) {}

  get current(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** Push a scene on top. The previous scene stays in the stack but is hidden. */
  push(scene: Scene): void {
    const prev = this.current;
    if (prev) prev.root.visible = false;
    this.stack.push(scene);
    this.stage.addChild(scene.root);
    scene.enter();
  }

  /** Pop the current scene and reveal the one below (if any). */
  pop(): Scene | undefined {
    const removed = this.stack.pop();
    if (removed) {
      removed.exit();
      this.stage.removeChild(removed.root);
      removed.root.destroy({ children: true });
    }
    const next = this.current;
    if (next) next.root.visible = true;
    return removed;
  }

  /** Replace the top scene (exit old, enter new). */
  replace(scene: Scene): void {
    const removed = this.stack.pop();
    if (removed) {
      removed.exit();
      this.stage.removeChild(removed.root);
      removed.root.destroy({ children: true });
    }
    this.stack.push(scene);
    this.stage.addChild(scene.root);
    scene.enter();
  }

  /** Remove all scenes and push a fresh one. */
  replaceAll(scene: Scene): void {
    while (this.stack.length > 0) {
      const s = this.stack.pop()!;
      s.exit();
      this.stage.removeChild(s.root);
      s.root.destroy({ children: true });
    }
    this.stack.push(scene);
    this.stage.addChild(scene.root);
    scene.enter();
  }

  /** Forward resize to all scenes (they may need to recalculate layout). */
  resize(screen: ScreenSize): void {
    for (const s of this.stack) {
      s.resize?.(screen);
    }
  }
}
