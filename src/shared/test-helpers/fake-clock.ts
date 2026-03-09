/**
 * FakeClock – provides a deterministic, controllable time source for tests.
 *
 * Inject this instead of `new Date()` / `Date.now()` to make all
 * time-sensitive logic fully deterministic in tests.
 *
 * @example
 * const clock = new FakeClock(new Date('2026-01-01T12:00:00Z'));
 * clock.advance(60_000); // advance by 1 minute
 * expect(clock.now()).toEqual(new Date('2026-01-01T12:01:00Z'));
 */
export class FakeClock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-01-01T00:00:00.000Z')) {
    this.currentTime = new Date(initialTime);
  }

  /** Returns a copy of the current fake time. */
  now(): Date {
    return new Date(this.currentTime);
  }

  /** Returns the current fake time as a Unix timestamp in milliseconds. */
  nowMs(): number {
    return this.currentTime.getTime();
  }

  /**
   * Advances the clock by the given number of milliseconds.
   * Accepts negative values to move backward (use sparingly in tests).
   */
  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  /** Sets the clock to a specific point in time. */
  setTo(time: Date): void {
    this.currentTime = new Date(time);
  }
}
