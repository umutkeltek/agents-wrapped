import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AdapterContext, ProviderAdapter, UsageRecord } from "../types.js";

// Gemini CLI logs live under ~/.gemini/tmp/<projectHash>/{chats,checkpoints}/*.json
// (override GEMINI_DATA_DIR). The on-disk shape is evolving, so this parser is
// defensive: it walks every json/jsonl record and extracts any object carrying a
// `tokens` field, trying the known field aliases. EXPERIMENTAL — unverified.

function geminiRoot(): string {
  return process.env.GEMINI_DATA_DIR?.split(",")[0]?.trim() || join(homedir(), ".gemini", "tmp");
}

function pick(obj: any, keys: string[]): number {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number") return v;
  }
  return 0;
}

function recordFromEvent(
  ev: any,
  project: string,
  fallbackSession: string,
  range: AdapterContext["range"],
): UsageRecord | null {
  const tok = ev?.tokens;
  if (!tok || typeof tok !== "object") return null;
  const input = pick(tok, ["input", "prompt", "input_tokens", "prompt_tokens"]);
  const output = pick(tok, ["output", "candidates", "output_tokens", "candidates_tokens"]);
  const cached = pick(tok, ["cached", "cached_tokens"]);
  const reasoning = pick(tok, ["thoughts", "reasoning", "thoughts_tokens", "reasoning_tokens"]);
  const total = pick(tok, ["total", "total_tokens"]);
  if (input === 0 && output === 0 && cached === 0) return null;

  const tsRaw = ev.timestamp ?? ev.created_at ?? ev.startTime ?? ev.lastUpdated;
  const ts = tsRaw ? new Date(tsRaw) : null;
  if (!ts || Number.isNaN(ts.getTime()) || ts < range.start || ts > range.end) return null;

  return {
    provider: "gemini",
    timestamp: ts,
    model: ev.model ?? "gemini",
    project,
    sessionId: ev.sessionId ?? ev.session_id ?? fallbackSession,
    tokens: {
      input: Math.max(0, input - cached),
      cachedInput: cached,
      cacheCreation: 0,
      output,
      reasoning,
      total: total || input + output,
    },
  };
}

/** Pull candidate event objects out of an arbitrary parsed JSON value. */
function eventsFromJson(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    if (Array.isArray(value.messages)) return value.messages;
    if (Array.isArray(value.events)) return value.events;
    return [value];
  }
  return [];
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith(".json") || e.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  displayName: "Gemini",
  experimental: true,

  async detect() {
    try {
      const s = await stat(geminiRoot());
      return s.isDirectory();
    } catch {
      return false;
    }
  },

  async collect({ range }: AdapterContext): Promise<UsageRecord[]> {
    const root = geminiRoot();
    const files = await walk(root);
    const out: UsageRecord[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const session = file.split("/").pop()?.replace(/\.(json|jsonl)$/, "") ?? file;
      const events: any[] = file.endsWith(".jsonl")
        ? text
            .split("\n")
            .filter(Boolean)
            .map((l) => {
              try {
                return JSON.parse(l);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : (() => {
            try {
              return eventsFromJson(JSON.parse(text));
            } catch {
              return [];
            }
          })();
      for (const ev of events) {
        const id = ev?.id;
        if (id) {
          const key = `${file}:${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
        }
        const rec = recordFromEvent(ev, "gemini", session, range);
        if (rec) out.push(rec);
      }
    }
    return out;
  },
};
