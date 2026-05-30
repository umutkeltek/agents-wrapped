import type { Stats } from "../types.js";

// A "16 personalities" for AI coding, derived from real usage. Four axes, each
// computed from a continuous 0..1 score then thresholded to a letter:
//
//   H/L  Heavy   / Light     — log-scaled total token volume
//   P/F  Polyglot/ Faithful  — diversity across providers AND models (1 - HHI)
//   S/B  Steady  / Bursty    — active-day density + best streak
//   D/Q  Deep    / Quick     — tokens per session (immersion)
//
// The continuous scores are exposed (`.scores`) so the result is explainable.

export interface Persona {
  code: string; // e.g. "HPSD"
  name: string;
  tagline: string;
  color: string;
  axes: string[]; // ["Heavy","Polyglot","Steady","Deep"]
  scores: { volume: number; diversity: number; rhythm: number; depth: number };
}

const TYPES: Record<string, { name: string; tagline: string; color: string }> = {
  HPSD: { name: "The Grandmaster", tagline: "Heavy, wide, relentless, and deep. Peak operator.", color: "#f0abfc" },
  HPSQ: { name: "The Conductor", tagline: "Orchestrates every agent in fast, steady passes.", color: "#c084fc" },
  HPBD: { name: "The Maverick", tagline: "Big bursts across the toolbox, diving deep each time.", color: "#a78bfa" },
  HPBQ: { name: "The Storm", tagline: "High-volume chaos across the whole toolbox.", color: "#818cf8" },
  HFSD: { name: "The Architect", tagline: "One tool, mastered. Deep and disciplined.", color: "#60a5fa" },
  HFSQ: { name: "The Machine", tagline: "Relentless, consistent, single-track throughput.", color: "#38bdf8" },
  HFBD: { name: "The Deep Diver", tagline: "Loyal to one agent, long immersive runs.", color: "#22d3ee" },
  HFBQ: { name: "The Powerhouse", tagline: "Heavy output in focused, explosive sprints.", color: "#2dd4bf" },
  LPSD: { name: "The Explorer", tagline: "Tries everything, thoughtfully, on a steady beat.", color: "#34d399" },
  LPSQ: { name: "The Scout", tagline: "Light, curious, sampling every tool quickly.", color: "#4ade80" },
  LPBD: { name: "The Dabbler", tagline: "Occasional deep dives across many agents.", color: "#a3e635" },
  LPBQ: { name: "The Wanderer", tagline: "Roams the toolbox in short, casual bursts.", color: "#facc15" },
  LFSD: { name: "The Craftsman", tagline: "One tool, careful, consistent, deliberate.", color: "#fbbf24" },
  LFSQ: { name: "The Apprentice", tagline: "Steady practice with a trusted single agent.", color: "#fb923c" },
  LFBD: { name: "The Tinkerer", tagline: "Focused deep dives, whenever inspiration strikes.", color: "#f87171" },
  LFBQ: { name: "The Minimalist", tagline: "Just enough, one tool, no fuss.", color: "#fb7185" },
};

/** Herfindahl concentration (Σ shareᵢ²): 1 = one thing, →0 = many even things. */
function hhi(weights: number[]): number {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return 1;
  return weights.reduce((a, w) => a + (Math.max(0, w) / total) ** 2, 0);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computePersona(stats: Stats): Persona {
  const grand =
    stats.totals.input + stats.totals.cachedInput + stats.totals.cacheCreation + stats.totals.output;

  // Volume — log-scaled: 1e8 tokens → 0, 1e11 → 1. Midpoint (Heavy) ≈ 3.2e9.
  const volume = clamp01((Math.log10(Math.max(1, grand)) - 8) / (11 - 8));

  // Diversity — blend provider concentration with model concentration.
  const providerDiv = 1 - hhi(stats.providers.map((p) => p.tokens));
  const modelDiv = 1 - hhi(stats.topModels.map((m) => m.tokens));
  const diversity = clamp01(0.6 * providerDiv + 0.4 * modelDiv);

  // Rhythm — how spread-out activity is across the calendar.
  const activeDays = Object.keys(stats.dailyActivity).length;
  const spanDays =
    stats.firstDay && stats.lastDay
      ? Math.max(
          1,
          Math.round(
            (new Date(stats.lastDay + "T00:00:00Z").getTime() -
              new Date(stats.firstDay + "T00:00:00Z").getTime()) /
              86400000,
          ) + 1,
        )
      : 1;
  const density = activeDays / spanDays;
  const rhythm = clamp01(0.7 * density + 0.3 * Math.min(1, stats.maxStreak / 21));

  // Depth — tokens per session (immersion). 250k → 0, 8M → 1.
  const perSession = stats.totalSessions ? grand / stats.totalSessions : 0;
  const depth = clamp01((Math.log10(Math.max(1, perSession)) - Math.log10(2.5e5)) / (Math.log10(8e6) - Math.log10(2.5e5)));

  const heavy = volume >= 0.5;
  const polyglot = diversity >= 0.4;
  const steady = rhythm >= 0.45;
  const deep = depth >= 0.5;

  const code = (heavy ? "H" : "L") + (polyglot ? "P" : "F") + (steady ? "S" : "B") + (deep ? "D" : "Q");
  const meta = TYPES[code];
  return {
    code,
    name: meta.name,
    tagline: meta.tagline,
    color: meta.color,
    axes: [heavy ? "Heavy" : "Light", polyglot ? "Polyglot" : "Faithful", steady ? "Steady" : "Bursty", deep ? "Deep" : "Quick"],
    scores: {
      volume: Math.round(volume * 100) / 100,
      diversity: Math.round(diversity * 100) / 100,
      rhythm: Math.round(rhythm * 100) / 100,
      depth: Math.round(depth * 100) / 100,
    },
  };
}
