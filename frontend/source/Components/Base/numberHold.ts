export type HoldRatePoint = { seconds: number; stepsPerSecond: number };
export type HoldAcceleration = {
  delayMs?: number;
  startRate?: number;
  maxRate?: number;
  fine?: HoldRatePoint;
  coarse?: HoldRatePoint;
};

/** One smooth saturating curve, fitted exactly through two time/rate points.
 * Rates are increments per second; point times start after the initial click delay.
 * Default ceiling traverses a bounded range in ~8 seconds at full speed, capped
 * at 120 increments/s so huge ranges (such as seeds) never imply enormous jumps.
 */
export function createNumberHoldCurve(step: number, min?: number, max?: number, options: HoldAcceleration = {}) {
  if (!Number.isFinite(step) || step <= 0) throw new Error("Hold step must be finite and positive.");
  const rangeSteps = min !== undefined && max !== undefined ? (max - min) / step : 320;
  const maxRate = options.maxRate ?? Math.max(4, Math.min(120, rangeSteps / 8));
  const startRate = options.startRate ?? 2;
  const span = maxRate - startRate;
  const fine = options.fine ?? { seconds: 1 / 1.5, stepsPerSecond: startRate + Math.min(1, span * 0.05) };
  const coarse = options.coarse ?? { seconds: 6 / 1.5, stepsPerSecond: startRate + span * 0.8 };
  const delayMs = options.delayMs ?? 200;
  if (![maxRate, startRate, fine.seconds, fine.stepsPerSecond, coarse.seconds, coarse.stepsPerSecond, delayMs].every(Number.isFinite)
    || startRate < 0 || delayMs < 0 || fine.seconds <= 0 || coarse.seconds <= fine.seconds
    || fine.stepsPerSecond <= startRate || coarse.stepsPerSecond <= fine.stepsPerSecond || maxRate <= coarse.stepsPerSecond) {
    throw new Error("Hold points must increase in time and rate, strictly between the starting rate and ceiling.");
  }
  const logOdds = (rate: number) => Math.log((rate - startRate) / (maxRate - rate));
  const fineOdds = logOdds(fine.stepsPerSecond);
  const power = (logOdds(coarse.stepsPerSecond) - fineOdds) / Math.log(coarse.seconds / fine.seconds);
  if (power <= 1) throw new Error("Hold points must allow a smooth, gentle start (curve power > 1).");
  const logScale = Math.log(fine.seconds) - fineOdds / power;
  return {
    delayMs, maxRate,
    rateAt(seconds: number) {
      if (seconds <= 0) return startRate;
      return startRate + span / (1 + Math.exp(-power * (Math.log(seconds) - logScale)));
    },
  };
}

export type NumberHoldProgress = { elapsedMs: number; remainder: number };
/** Reserve the missing fraction columns so the decimal point never jumps. */
export function numberFractionPadding(text: string, step: number) {
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const fraction = text.split(".")[1];
  return Math.max(0, decimals - (fraction?.length ?? 0) + (decimals > 0 && fraction === undefined ? 1 : 0));
}
/** Integrate elapsed time, not frame counts. Drop time lost to a stall instead of
 * banking a burst of changes; retain fractional increments for fine adjustments. */
export function advanceNumberHold(progress: NumberHoldProgress, deltaMs: number, curve: ReturnType<typeof createNumberHoldCurve>) {
  const elapsedMs = progress.elapsedMs + Math.max(0, Math.min(250, deltaMs));
  const from = Math.max(0, progress.elapsedMs - curve.delayMs) / 1000;
  const to = Math.max(0, elapsedMs - curve.delayMs) / 1000;
  const amount = progress.remainder + curve.rateAt((from + to) / 2) * (to - from);
  const steps = Math.floor(amount);
  return { elapsedMs, remainder: amount - steps, steps };
}
