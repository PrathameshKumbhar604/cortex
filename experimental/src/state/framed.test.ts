import { framedSubscribe } from "./framed";

describe("framedSubscribe", () => {
  it("batches tokens per frame", () => {
    const frames: (() => void)[] = [];
    const raf = (cb: () => void) => (frames.push(cb), frames.length);
    let listener: () => void = () => {};
    const subscribe = (fn: () => void) => ((listener = fn), () => {});
    let renders = 0;
    framedSubscribe(subscribe, raf)(() => renders++);
    for (let i = 0; i < 50; i++) listener();
    expect(renders).toBe(0);
    expect(frames).toHaveLength(1);
    frames[0]();
    expect(renders).toBe(1);
    listener();
    expect(frames).toHaveLength(2);
  });
});
