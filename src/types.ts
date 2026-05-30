// Normalized usage model — the single shape every provider adapter produces.
// The whole project is: adapters → UsageRecord[] → date filter → aggregate → render.

export type ProviderId =
  | "codex"
  | "claude"
  | "opencode"
  | "gemini"
  | "copilot";

/** Token counts for a single turn, normalized across providers. */
export interface TokenUsage {
  /** Non-cached input tokens (fresh prompt). */
  input: number;
  /** Cache-read input tokens (cheaper). */
  cachedInput: number;
  /** Cache-creation/write input tokens (Claude only; 0 elsewhere). */
  cacheCreation: number;
  /** Output (completion) tokens. */
  output: number;
  /** Reasoning tokens — informational; already billed inside output. */
  reasoning: number;
  /** Provider-reported total when available, else summed. */
  total: number;
}

/** One billable turn from one provider. The atomic unit everything aggregates from. */
export interface UsageRecord {
  provider: ProviderId;
  /** When this turn happened. */
  timestamp: Date;
  /** Raw model id as the provider recorded it (used for pricing lookup). */
  model: string;
  /** Project identity — cwd or encoded project dir. */
  project: string;
  /** Session identity — one chat/rollout. */
  sessionId: string;
  tokens: TokenUsage;
  /** Provider pre-calculated cost in USD, if the log carried one. */
  costUSD?: number;
}

export interface DateRange {
  start: Date;
  end: Date;
  /** Human label, e.g. "2025", "last 30 days", "all time". */
  label: string;
}

export interface AdapterContext {
  range: DateRange;
}

/** Contract every provider must satisfy. Add a provider = add one of these. */
export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  /** Cheap check: is this provider's data present on disk? */
  detect(): Promise<boolean>;
  /** Read normalized usage records overlapping the range. */
  collect(ctx: AdapterContext): Promise<UsageRecord[]>;
}

export interface ModelStat {
  model: string;
  provider: ProviderId;
  tokens: number;
  costUSD: number;
  share: number; // 0..1 of total tokens
}

export interface ProviderStat {
  provider: ProviderId;
  displayName: string;
  sessions: number;
  messages: number;
  tokens: number;
  costUSD: number;
  share: number; // 0..1 of total tokens
}

export interface Stats {
  range: DateRange;
  generatedAt: Date;

  totalSessions: number;
  totalMessages: number;
  totalProjects: number;

  totals: TokenUsage;
  totalCostUSD: number;
  costIsEstimated: boolean;

  topModels: ModelStat[];
  providers: ProviderStat[];

  /** ISO date (YYYY-MM-DD) → message count. */
  dailyActivity: Record<string, number>;
  /** 7 slots, 0 = Sunday. */
  weekdayActivity: number[];
  /** Index 0..6 of the busiest weekday. */
  mostActiveWeekday: number;
  /** ISO date of the single busiest day. */
  mostActiveDay: string | null;
  mostActiveDayCount: number;

  firstDay: string | null;
  lastDay: string | null;
  daysSinceFirst: number;

  currentStreak: number;
  maxStreak: number;
}
