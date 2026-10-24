export type CancelMessageScrollFrame = () => void;

/** A chat's frames remain cancellable even after the browser has captured a delivery batch. */
export function createMessageScrollFrameOwner(
  request: (callback: FrameRequestCallback) => number,
  cancel: (id: number) => void,
) {
  let active = true;
  const pending = new Set<CancelMessageScrollFrame>();
  return {
    get active() { return active; },
    schedule(callback: () => void): CancelMessageScrollFrame {
      if (!active) return () => {};
      let id = 0;
      const cancelFrame = () => {
        if (!pending.delete(cancelFrame)) return;
        cancel(id);
      };
      id = request(() => {
        if (!pending.delete(cancelFrame) || !active) return;
        callback();
      });
      pending.add(cancelFrame);
      return cancelFrame;
    },
    dispose() {
      if (!active) return;
      active = false;
      for (const cancelFrame of [...pending]) cancelFrame();
    },
  };
}
