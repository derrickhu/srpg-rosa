import * as PIXI from 'pixi.js';

export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * Lifecycle contract for a full-screen scene (deploy, battle-playback, shop, result, etc.).
 * Scenes own a root container that SceneManager attaches/detaches from the stage.
 */
export interface Scene {
  readonly root: PIXI.Container;
  /** Called once when the scene is pushed onto the stack and added to the stage. */
  enter(): void;
  /** Called when the scene is removed from the stack.  Clean up listeners / textures here. */
  exit(): void;
  /** Called on window / canvas resize so the scene can re-layout. */
  resize?(screen: ScreenSize): void;
}
