/**
 * GexBot reliably serves a warmed keep-alive connection, but concurrent calls
 * from this client queue at the provider and exceed the one-second deadline.
 * This queue starts the next request only after the previous response body has
 * been consumed. Waiting in the queue does not count against request timeout.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "TimeoutError")
    || (error instanceof Error && /timed?\s*out|timeout/i.test(error.message))
  );
}

interface RecoveryLog {
  lost: () => void;
  recovered: () => void;
}

/**
 * Keep recovery inside the serial queue. If a reused provider connection dies,
 * no other feed can start another request until one recovery probe has rebuilt
 * the connection and the interrupted request has been retried.
 */
export class RecoveringSerialTaskQueue {
  private readonly queue = new SerialTaskQueue();

  constructor(
    private readonly recover: () => Promise<void>,
    private readonly log: RecoveryLog,
  ) {}

  run<T>(task: () => Promise<T>, recoverOnTimeout = true): Promise<T> {
    return this.queue.run(async () => {
      try {
        return await task();
      } catch (error) {
        if (!recoverOnTimeout || !isTimeoutError(error)) throw error;
        this.log.lost();
        await this.recover();
        this.log.recovered();
        return task();
      }
    });
  }
}
