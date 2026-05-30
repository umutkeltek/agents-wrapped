import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderId, TokenUsage } from "../types.js";

// Pricing source = LiteLLM's community price DB (same source ccusage uses).
// Fetched once, cached on disk for 24h, with graceful offline fallback.

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface LiteLLMEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
}

type PriceMap = Record<string, LiteLLMEntry>;

function cacheFile(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "agents-wrapped", "litellm-prices.json");
}

async function loadCache(): Promise<PriceMap | null> {
  try {
    const f = cacheFile();
    const s = await stat(f);
    if (Date.now() - s.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return null;
  }
}

async function saveCache(map: PriceMap): Promise<void> {
  try {
    const f = cacheFile();
    await mkdir(join(f, ".."), { recursive: true });
    await writeFile(f, JSON.stringify(map));
  } catch {
    /* cache is best-effort */
  }
}

export class Pricing {
  private map: PriceMap;
  /** True if we could not load any price table (cost becomes 0 / estimated=false). */
  readonly unavailable: boolean;

  private constructor(map: PriceMap | null) {
    this.map = map ?? {};
    this.unavailable = map === null;
  }

  static async load(): Promise<Pricing> {
    const cached = await loadCache();
    if (cached) return new Pricing(cached);
    try {
      const res = await fetch(LITELLM_URL, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const map = (await res.json()) as PriceMap;
      await saveCache(map);
      return new Pricing(map);
    } catch {
      return new Pricing(null);
    }
  }

  private lookup(model: string, provider: ProviderId): LiteLLMEntry | undefined {
    const stripped = model.replace(/-\d{8}$/, ""); // claude-haiku-4-5-20251001 → claude-haiku-4-5
    const candidates = [
      model,
      stripped,
      `${provider}/${model}`,
      `${provider}/${stripped}`,
      model.replace(/-codex$/, ""),
      stripped.replace(/-codex$/, ""),
      `openai/${model}`,
      `anthropic/${stripped}`,
    ];
    for (const c of candidates) {
      if (this.map[c]) return this.map[c];
    }
    return undefined;
  }

  /** Cost of one record's tokens in USD. Returns 0 if the model isn't priced. */
  cost(model: string, provider: ProviderId, t: TokenUsage): number {
    const e = this.lookup(model, provider);
    if (!e) return 0;
    const inRate = e.input_cost_per_token ?? 0;
    const outRate = e.output_cost_per_token ?? 0;
    const cacheReadRate = e.cache_read_input_token_cost ?? inRate;
    const cacheCreateRate = e.cache_creation_input_token_cost ?? inRate;
    return (
      t.input * inRate +
      t.cachedInput * cacheReadRate +
      t.cacheCreation * cacheCreateRate +
      t.output * outRate
    );
  }
}
