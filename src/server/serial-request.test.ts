import { describe, expect, it } from "vitest";
import { RecoveringSerialTaskQueue, SerialTaskQueue } from "./serial-request";

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

describe("RecoveringSerialTaskQueue", () => {
  it("rebuilds a timed-out connection once and retries the interrupted request", async () => {
    const events: string[] = [];
    let attempts = 0;
    const queue = new RecoveringSerialTaskQueue(
      async () => {
        events.push("recover");
      },
      {
        lost: () => events.push("lost"),
        recovered: () => events.push("recovered"),
      },
    );

    const result = await queue.run(async () => {
      attempts += 1;
      events.push(`request-${attempts}`);
      if (attempts === 1) throw new DOMException("The operation timed out.", "TimeoutError");
      return "live";
    });

    expect(result).toBe("live");
    expect(events).toEqual(["request-1", "lost", "recover", "recovered", "request-2"]);
  });

  it("does not rebuild for HTTP errors", async () => {
    let recoveries = 0;
    const queue = new RecoveringSerialTaskQueue(
      async () => {
        recoveries += 1;
      },
      { lost: () => {}, recovered: () => {} },
    );

    await expect(queue.run(async () => {
      throw new Error("HTTP 503");
    })).rejects.toThrow("HTTP 503");
    expect(recoveries).toBe(0);
  });
});
