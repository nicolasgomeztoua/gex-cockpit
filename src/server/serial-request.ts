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
