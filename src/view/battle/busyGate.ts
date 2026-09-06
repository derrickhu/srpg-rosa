/**
 * 战斗回放主循环的暂停门。
 *
 * 托管时点复活会去播激励视频，主循环如果还在 `stepTurn`，广告结束时人已经死光。
 * 门一关上，下一回合必须等门打开才能推进。
 */
export function createBusyGate(): {
  get busy(): boolean;
  set(on: boolean): void;
  wait(): Promise<void>;
} {
  let busy = false;
  const waiters: Array<() => void> = [];
  return {
    get busy() {
      return busy;
    },
    set(on: boolean) {
      busy = on;
      if (on) return;
      while (waiters.length > 0) waiters.pop()!();
    },
    wait() {
      if (!busy) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}
