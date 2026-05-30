import type {
  DateRange,
  ModelStat,
  ProviderStat,
  Stats,
  TokenUsage,
  UsageRecord,
} from "../types.js";
import type { Pricing } from "./pricing.js";

const PROVIDER_NAMES: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode",
  gemini: "Gemini",
  copilot: "Copilot",
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptyTokens(): TokenUsage {
  return { input: 0, cachedInput: 0, cacheCreation: 0, output: 0, reasoning: 0, total: 0 };
}

function addTokens(a: TokenUsage, b: TokenUsage): void {
  a.input += b.input;
  a.cachedInput += b.cachedInput;
  a.cacheCreation += b.cacheCreation;
  a.output += b.output;
  a.reasoning += b.reasoning;
  a.total += b.total;
}

/** Longest run of consecutive active days, and the run ending today/most-recent. */
function computeStreaks(daySet: Set<string>): { current: number; max: number } {
  const days = [...daySet].sort();
  if (days.length === 0) return { current: 0, max: 0 };
  let max = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + "T00:00:00Z").getTime();
    const cur = new Date(days[i] + "T00:00:00Z").getTime();
    const gap = Math.round((cur - prev) / 86400000);
    run = gap === 1 ? run + 1 : 1;
    if (run > max) max = run;
  }
  // Current streak = the trailing run.
  let current = 1;
  for (let i = days.length - 1; i > 0; i--) {
    const prev = new Date(days[i - 1] + "T00:00:00Z").getTime();
    const cur = new Date(days[i] + "T00:00:00Z").getTime();
    if (Math.round((cur - prev) / 86400000) === 1) current++;
    else break;
  }
  return { current, max };
}

export function aggregate(
  records: UsageRecord[],
  range: DateRange,
  pricing: Pricing,
  now = new Date(),
): Stats {
  const totals = emptyTokens();
  const dailyActivity: Record<string, number> = {};
  const weekdayActivity = [0, 0, 0, 0, 0, 0, 0];
  const daySet = new Set<string>();
  const projectSet = new Set<string>();
  const sessionSet = new Set<string>();

  const modelAgg = new Map<string, { provider: string; tokens: number; cost: number }>();
  const providerAgg = new Map<
    string,
    { sessions: Set<string>; messages: number; tokens: number; cost: number }
  >();

  let totalCost = 0;
  let anyPriced = false;

  for (const r of records) {
    addTokens(totals, r.tokens);
    const day = isoDay(r.timestamp);
    dailyActivity[day] = (dailyActivity[day] ?? 0) + 1;
    weekdayActivity[r.timestamp.getUTCDay()]++;
    daySet.add(day);
    projectSet.add(`${r.provider}:${r.project}`);
    sessionSet.add(`${r.provider}:${r.sessionId}`);

    const recTokens = r.tokens.input + r.tokens.cachedInput + r.tokens.cacheCreation + r.tokens.output;
    const cost = r.costUSD ?? pricing.cost(r.model, r.provider, r.tokens);
    if (cost > 0) anyPriced = true;
    totalCost += cost;

    const mKey = `${r.provider}:${r.model}`;
    const m = modelAgg.get(mKey) ?? { provider: r.provider, tokens: 0, cost: 0 };
    m.tokens += recTokens;
    m.cost += cost;
    modelAgg.set(mKey, m);

    const pv = providerAgg.get(r.provider) ?? {
      sessions: new Set<string>(),
      messages: 0,
      tokens: 0,
      cost: 0,
    };
    pv.sessions.add(r.sessionId);
    pv.messages++;
    pv.tokens += recTokens;
    pv.cost += cost;
    providerAgg.set(r.provider, pv);
  }

  const tokenGrandTotal =
    totals.input + totals.cachedInput + totals.cacheCreation + totals.output || 1;

  const topModels: ModelStat[] = [...modelAgg.entries()]
    .map(([key, v]) => ({
      model: key.split(":").slice(1).join(":"),
      provider: v.provider as ModelStat["provider"],
      tokens: v.tokens,
      costUSD: v.cost,
      share: v.tokens / tokenGrandTotal,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const providers: ProviderStat[] = [...providerAgg.entries()]
    .map(([id, v]) => ({
      provider: id as ProviderStat["provider"],
      displayName: PROVIDER_NAMES[id] ?? id,
      sessions: v.sessions.size,
      messages: v.messages,
      tokens: v.tokens,
      costUSD: v.cost,
      share: v.tokens / tokenGrandTotal,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  // Busiest single day + busiest weekday.
  let mostActiveDay: string | null = null;
  let mostActiveDayCount = 0;
  for (const [day, count] of Object.entries(dailyActivity)) {
    if (count > mostActiveDayCount) {
      mostActiveDayCount = count;
      mostActiveDay = day;
    }
  }
  let mostActiveWeekday = 0;
  for (let i = 1; i < 7; i++) {
    if (weekdayActivity[i] > weekdayActivity[mostActiveWeekday]) mostActiveWeekday = i;
  }

  const sortedDays = [...daySet].sort();
  const firstDay = sortedDays[0] ?? null;
  const lastDay = sortedDays[sortedDays.length - 1] ?? null;
  const daysSinceFirst = firstDay
    ? Math.max(0, Math.round((now.getTime() - new Date(firstDay + "T00:00:00Z").getTime()) / 86400000))
    : 0;

  const streaks = computeStreaks(daySet);

  return {
    range,
    generatedAt: now,
    totalSessions: sessionSet.size,
    totalMessages: records.length,
    totalProjects: projectSet.size,
    totals,
    totalCostUSD: totalCost,
    costIsEstimated: anyPriced && !pricing.unavailable,
    topModels,
    providers,
    dailyActivity,
    weekdayActivity,
    mostActiveWeekday,
    mostActiveDay,
    mostActiveDayCount,
    firstDay,
    lastDay,
    daysSinceFirst,
    currentStreak: streaks.current,
    maxStreak: streaks.max,
  };
}
