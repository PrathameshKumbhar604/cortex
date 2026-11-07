type Subscribe = (fn: () => void) => () => void;

/**
 * Wraps a store's subscribe so its listener runs at most once per animation frame. A streaming answer emits many
 * events a second; React only needs to render what the screen can show.
 */
export function framedSubscribe(subscribe: Subscribe, raf: (cb: () => void) => number = requestAnimationFrame): Subscribe {
  return (fn) => {
    let queued = false;
    let live = true;
    const off = subscribe(() => {
      if (queued) return;
      queued = true;
      raf(() => {
        queued = false;
        if (live) fn();
      });
    });
    return () => {
      live = false;
      off();
    };
  };
}
