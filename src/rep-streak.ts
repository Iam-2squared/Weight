/** One repetition is part of the same streak when it follows the previous one
 * within ten seconds, inclusive. Wall-clock timestamps include pauses.
 * This tracker never manufactures a repetition, it only observes the pose counter.
 */
export const STREAK_GAP_MS = 10_000;

export class RepStreakTracker {
  private totalReps = 0;
  private consecutiveReps = 0;
  private longestRun = 0;
  private lastRepTime: number | null = null;

  recordRep(timestamp: number): void {
    if (!Number.isFinite(timestamp) || (this.lastRepTime !== null && timestamp < this.lastRepTime)) {
      throw new Error("Invalid or non-monotonic repetition timestamp");
    }
    this.consecutiveReps = this.lastRepTime !== null && timestamp - this.lastRepTime <= STREAK_GAP_MS
      ? this.consecutiveReps + 1 : 1;
    this.totalReps++;
    this.longestRun = Math.max(this.longestRun, this.consecutiveReps);
    this.lastRepTime = timestamp;
  }

  /** End a run once ten seconds have passed without another completed rep. */
  advanceTime(timestamp: number): void {
    if (this.lastRepTime !== null && timestamp - this.lastRepTime > STREAK_GAP_MS) {
      this.consecutiveReps = 0;
      this.lastRepTime = null;
    }
  }

  reset(): void {
    this.totalReps = 0;
    this.consecutiveReps = 0;
    this.longestRun = 0;
    this.lastRepTime = null;
  }

  snapshot() {
    return { totalReps: this.totalReps, currentStreak: this.consecutiveReps, bestStreak: this.longestRun };
  }
}
