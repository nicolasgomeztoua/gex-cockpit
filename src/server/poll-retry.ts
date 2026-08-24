export const FETCH_TIMEOUT_MS = 1_000;
export const RETRY_BASE_MS = 2_000;
export const MAX_RETRY_MS = 30_000;

export interface RetryDecision {
  failureCount: number;
  delayMs: number;
}

/**
 * Per-feed retry state. Jitter uses 75–100% of the exponential delay so six
 * feeds that fail together do not keep retrying in lockstep.
 */
export class PollRetryState {
  private failures = 0;

  failed(random: () => number = Math.random): RetryDecision {
    this.failures += 1;
    const exponent = Math.min(this.failures - 1, 20);
    const exponential = Math.min(RETRY_BASE_MS * 2 ** exponent, MAX_RETRY_MS);
    const boundedRandom = Math.min(1, Math.max(0, random()));
    const delayMs = Math.round(exponential * (0.75 + boundedRandom * 0.25));
    return { failureCount: this.failures, delayMs };
  }

  /** Reset after a successful request and return the number of prior failures. */
  recovered(): number {
    const recoveredFailures = this.failures;
    this.failures = 0;
    return recoveredFailures;
  }
}

export function formatRetryDelay(delayMs: number): string {
  return delayMs < 10_000 ? `${(delayMs / 1_000).toFixed(1)}s` : `${Math.round(delayMs / 1_000)}s`;
}
