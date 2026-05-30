import type { Stats } from "../types.js";

// A fun "16 personalities" for AI coding, derived from real usage. Four binary
// axes → a 4-letter code → a named archetype. Shareable, like an MBTI for agents.
//
//   H/L  Heavy vs Light     — total token volume
//   P/F  Polyglot vs Faithful — spread across providers
//   S/B  Steady vs Bursty   — streak / consistency
//   D/Q  Deep vs Quick      — tokens per session

export interface Persona {
  code: string; // e.g. "HPSD"
  name: string; // e.g. "The Grandmaster"
  tagline: string;
  color: string;
  axes: string[]; // ["Heavy","Polyglot","Steady","Deep"]
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

export function computePersona(stats: Stats): Persona {
  const grand =
    stats.totals.input + stats.totals.cachedInput + stats.totals.cacheCreation + stats.totals.output;
  const topShare = stats.providers[0]?.share ?? 1;
  const activeProviders = stats.providers.filter((p) => p.share >= 0.01).length;
  const avgPerSession = stats.totalSessions ? grand / stats.totalSessions : 0;

  const heavy = grand >= 10e9;
  const polyglot = activeProviders >= 2 && topShare < 0.8;
  const steady = stats.maxStreak >= 7;
  const deep = avgPerSession >= 4e6;

  const code = (heavy ? "H" : "L") + (polyglot ? "P" : "F") + (steady ? "S" : "B") + (deep ? "D" : "Q");
  const meta = TYPES[code];
  return {
    code,
    name: meta.name,
    tagline: meta.tagline,
    color: meta.color,
    axes: [heavy ? "Heavy" : "Light", polyglot ? "Polyglot" : "Faithful", steady ? "Steady" : "Bursty", deep ? "Deep" : "Quick"],
  };
}
