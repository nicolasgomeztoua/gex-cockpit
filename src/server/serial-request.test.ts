import { describe, expect, it } from "vitest";
import { SerialTaskQueue } from "./serial-request";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("SerialTaskQueue", () => {
  it("never runs provider requests concurrently", async () => {
    const queue = new SerialTaskQueue();
    const firstGate = deferred();
    let active = 0;
    let maxActive = 0;
    const run = (gate?: Promise<void>) =>
      queue.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        if (gate) await gate;
        active--;
      });

    const first = run(firstGate.promise);
    const second = run();
    await Promise.resolve();
    expect(active).toBe(1);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
  });

  it("continues after a failed request", async () => {
    const queue = new SerialTaskQueue();
    const failed = queue.run(async () => {
      throw new Error("timeout");
    });
    const recovered = queue.run(async () => "ok");

    await expect(failed).rejects.toThrow("timeout");
    await expect(recovered).resolves.toBe("ok");
  });
});
