import type { DateRange } from "../types.js";

// Resolve CLI period flags into a concrete [start,end] range.
// The differentiator vs codex-wrapped/oc-wrapped: arbitrary ranges, not just a calendar year.

export interface RangeFlags {
  year?: string; // "2025"
  from?: string; // "2025-01-01"
  to?: string; // "2025-03-31"
  last?: string; // "30d" | "12w" | "6m" | "1y"
  all?: boolean;
}

const START_OF_TIME = new Date("2020-01-01T00:00:00.000Z");

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseLast(spec: string, now: Date): Date {
  const m = /^(\d+)\s*([dwmy])$/i.exec(spec.trim());
  if (!m) throw new Error(`Invalid --last value: "${spec}". Use e.g. 30d, 12w, 6m, 1y.`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const start = new Date(now);
  if (unit === "d") start.setDate(start.getDate() - n);
  else if (unit === "w") start.setDate(start.getDate() - n * 7);
  else if (unit === "m") start.setMonth(start.getMonth() - n);
  else if (unit === "y") start.setFullYear(start.getFullYear() - n);
  return startOfDay(start);
}

export function resolveRange(flags: RangeFlags, now = new Date()): DateRange {
  if (flags.from || flags.to) {
    const start = flags.from ? startOfDay(new Date(flags.from)) : START_OF_TIME;
    const end = flags.to ? endOfDay(new Date(flags.to)) : endOfDay(now);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid --from/--to date. Use YYYY-MM-DD.");
    }
    const label =
      flags.from && flags.to
        ? `${flags.from} → ${flags.to}`
        : flags.from
          ? `since ${flags.from}`
          : `until ${flags.to}`;
    return { start, end, label };
  }

  if (flags.year) {
    const y = Number(flags.year);
    if (!Number.isFinite(y)) throw new Error(`Invalid --year: "${flags.year}".`);
    return {
      start: new Date(`${y}-01-01T00:00:00.000Z`),
      end: new Date(`${y}-12-31T23:59:59.999Z`),
      label: String(y),
    };
  }

  if (flags.last) {
    return { start: parseLast(flags.last, now), end: endOfDay(now), label: `last ${flags.last}` };
  }

  // Default: all time.
  return { start: START_OF_TIME, end: endOfDay(now), label: "all time" };
}
