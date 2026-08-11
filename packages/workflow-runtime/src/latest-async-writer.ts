/**
 * Persists the newest value while at most one write is in flight.
 *
 * Intermediate values may be superseded, but flush() never resolves before the
 * latest accepted value is durable. This is intended for replaceable snapshots
 * such as execution checkpoints, not append-only events.
 */
export class LatestAsyncWriter<T> {
  private pending: T | undefined;
  private hasPending = false;
  private active: Promise<void> | undefined;
  private failure: unknown;

  constructor(private readonly write: (value: T) => Promise<void>) {}

  push(value: T): void {
    if (this.failure !== undefined) throw this.failure;
    this.pending = value;
    this.hasPending = true;
    this.start();
  }

  async flush(): Promise<void> {
    this.start();
    while (this.active) await this.active;
    if (this.failure !== undefined) throw this.failure;
  }

  private start(): void {
    if (this.active || !this.hasPending || this.failure !== undefined) return;
    this.active = this.drain()
      .catch((error: unknown) => {
        this.failure = error;
        this.pending = undefined;
        this.hasPending = false;
      })
      .finally(() => {
        this.active = undefined;
        this.start();
      });
  }

  private async drain(): Promise<void> {
    while (this.hasPending) {
      const value = this.pending as T;
      this.pending = undefined;
      this.hasPending = false;
      await this.write(value);
    }
  }
}
