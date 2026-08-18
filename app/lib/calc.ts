/**
 * Pure lead-gap calculation logic, extracted from page.tsx so it can be
 * unit tested independently of React and sanitized against bad input.
 *
 * All functions here are deterministic and side-effect free.
 */

export type CalcInputs = {
  /** Monthly inquiries (calls + forms + chat). */
  inquiries: number;
  /** Average job value in dollars. */
  avgJob: number;
  /** Inquiry-to-job close rate, 0-100. */
  closeRate: number;
  /** Percent of calls answered live, 0-100. */
  answerRate: number;
  /** Average hours until first human response to a form. */
  formHours: number;
  /** Count of failed website checks, 0-checks.length. */
  failedCount: number;
};

export type CalcResult = {
  callGap: number;
  formGap: number;
  issueGap: number;
  gap: number;
  jobs: number;
  revenue: number;
  score: number;
};

/**
 * Clamp a number into [min, max]. Falls back to `fallback` for NaN,
 * Infinity, or non-numeric input (e.g. mid-typing empty fields).
 */
export function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Sanitize raw (possibly garbage) form inputs into safe bounded values.
 * Exported separately so the UI layer can sanitize on every keystroke
 * without duplicating the bounds used by the calculation itself.
 */
export function sanitizeInputs(raw: Partial<CalcInputs>): CalcInputs {
  return {
    inquiries: clampNumber(raw.inquiries ?? NaN, 0, 1_000_000, 0),
    avgJob: clampNumber(raw.avgJob ?? NaN, 0, 10_000_000, 0),
    closeRate: clampNumber(raw.closeRate ?? NaN, 0, 100, 0),
    answerRate: clampNumber(raw.answerRate ?? NaN, 0, 100, 0),
    formHours: clampNumber(raw.formHours ?? NaN, 0, 24 * 30, 0),
    failedCount: clampNumber(raw.failedCount ?? NaN, 0, 10, 0),
  };
}

/**
 * Core estimate. Mirrors the original inline formula from page.tsx,
 * but always operates on sanitized input so it can never emit NaN,
 * negative gaps, or an out-of-range score.
 */
export function calculateLeadGap(raw: Partial<CalcInputs>): CalcResult {
  const { inquiries, avgJob, closeRate, answerRate, formHours, failedCount } =
    sanitizeInputs(raw);

  const callGap = inquiries * 0.65 * Math.max(0, 1 - answerRate / 100) * 0.7;

  const responsePenalty =
    formHours <= 1 ? 0.02 : formHours <= 4 ? 0.08 : formHours <= 24 ? 0.18 : 0.28;
  const formGap = inquiries * 0.35 * responsePenalty;

  const issueGap = inquiries * Math.min(0.12, failedCount * 0.018) * 0.6;

  const gap = Math.min(inquiries * 0.35, callGap + formGap + issueGap);

  const jobs = (gap * closeRate) / 100;
  const revenue = jobs * avgJob;

  const rawScore =
    100 - failedCount * 6.5 - (100 - answerRate) * 0.28 - responsePenalty * 34;
  const score = Math.max(22, Math.min(100, Math.round(rawScore)));

  return { callGap, formGap, issueGap, gap, jobs, revenue, score };
}

/** Simple, permissive-but-real email check for the report-gate modal. */
export function isValidEmail(value: string): boolean {
  // Not a full RFC 5322 validator (nothing simple is) — just rejects the
  // obvious garbage that `.includes("@")` lets through, e.g. "a@" or "@b".
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Basic sanity check for the website field: has a dot, no spaces, not empty. */
export function isPlausibleWebsite(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/\s/.test(v)) return false;
  const stripped = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(stripped);
}
