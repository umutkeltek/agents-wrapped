import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AdapterContext, ProviderAdapter, UsageRecord } from "../types.js";

// Codex CLI logs live at $CODEX_HOME/sessions/{YYYY}/{MM}/{DD}/rollout-*.jsonl
// Each line: { timestamp, type, payload }. We care about:
//   - session_meta : payload.cwd, payload.model_provider
//   - turn_context : payload.model (e.g. "gpt-5.3-codex")
//   - event_msg / payload.type === "token_count" : payload.info.{total,last}_token_usage
//     info is null on rate-limit pings — those are skipped.

function codexRoot(): string {
  const home = process.env.CODEX_HOME || join(homedir(), ".codex");
  return join(home, "sessions");
}

interface CodexTokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

/** List YYYY/MM/DD leaf dirs whose date intersects [start,end]. */
async function listDayDirs(root: string, start: Date, end: Date): Promise<string[]> {
  const out: string[] = [];
  let years: string[];
  try {
    years = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return out;
  }
  for (const y of years) {
    const yn = Number(y);
    if (!Number.isFinite(yn) || yn < start.getFullYear() || yn > end.getFullYear()) continue;
    const ydir = join(root, y);
    const months = (await readdir(ydir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const m of months) {
      const mdir = join(ydir, m);
      const days = (await readdir(mdir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const d of days) {
        const dayDate = new Date(`${y}-${m}-${d}T23:59:59.999Z`);
        const dayStart = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
        if (dayDate < start || dayStart > end) continue;
        out.push(join(mdir, d));
      }
    }
  }
  return out;
}

async function parseSessionFile(
  path: string,
  start: Date,
  end: Date,
): Promise<UsageRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const records: UsageRecord[] = [];
  let cwd = "unknown";
  let model = "gpt-5";
  let sessionId = path; // fallback identity = file path
  let prevTotal: CodexTokenUsage | null = null;

  for (const line of text.split("\n")) {
    if (!line) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const p = obj?.payload;
    if (!p) continue;

    if (obj.type === "session_meta") {
      if (typeof p.cwd === "string") cwd = p.cwd;
      if (typeof p.id === "string") sessionId = p.id;
      continue;
    }
    if (obj.type === "turn_context") {
      if (typeof p.cwd === "string") cwd = p.cwd;
      if (typeof p.model === "string") model = p.model;
      continue;
    }
    if (p.type === "token_count" && p.info) {
      const ts = new Date(obj.timestamp);
      if (Number.isNaN(ts.getTime())) continue;

      // Codex re-emits the same cumulative snapshot multiple times per turn.
      // The authoritative per-turn usage is the DELTA of the cumulative
      // `total_token_usage`. A zero delta = a repeated snapshot → skip it
      // entirely (no double-counted tokens, no phantom "message"). When the
      // cumulative is absent we fall back to `last_token_usage` as-is.
      const snap: CodexTokenUsage | undefined = p.info.total_token_usage;
      let u: CodexTokenUsage;
      if (snap) {
        const base = prevTotal ?? {};
        // Handle mid-session resets (compaction): if a field shrank, the new
        // value is itself the delta rather than current-minus-prev.
        const d = (cur?: number, prev?: number) => {
          const c = cur ?? 0;
          const pv = prev ?? 0;
          return c >= pv ? c - pv : c;
        };
        u = {
          input_tokens: d(snap.input_tokens, base.input_tokens),
          cached_input_tokens: d(snap.cached_input_tokens, base.cached_input_tokens),
          output_tokens: d(snap.output_tokens, base.output_tokens),
          reasoning_output_tokens: d(snap.reasoning_output_tokens, base.reasoning_output_tokens),
          total_tokens: d(snap.total_tokens, base.total_tokens),
        };
        prevTotal = snap;
      } else if (p.info.last_token_usage) {
        u = p.info.last_token_usage;
      } else {
        continue;
      }

      const totalInput = u.input_tokens ?? 0;
      const cached = Math.min(u.cached_input_tokens ?? 0, totalInput);
      const freshInput = Math.max(0, totalInput - cached);
      const output = u.output_tokens ?? 0;
      // Repeated snapshot (all-zero delta) or empty ping → not a real turn.
      if (totalInput === 0 && output === 0 && cached === 0) continue;

      if (ts < start || ts > end) continue;

      records.push({
        provider: "codex",
        timestamp: ts,
        model,
        project: cwd,
        sessionId,
        tokens: {
          input: freshInput,
          cachedInput: cached,
          cacheCreation: 0,
          output,
          reasoning: u.reasoning_output_tokens ?? 0,
          total: u.total_tokens ?? totalInput + output,
        },
      });
    }
  }
  return records;
}

export const codexAdapter: ProviderAdapter = {
  id: "codex",
  displayName: "Codex",

  async detect() {
    try {
      const s = await stat(codexRoot());
      return s.isDirectory();
    } catch {
      return false;
    }
  },

  async collect({ range }: AdapterContext): Promise<UsageRecord[]> {
    const root = codexRoot();
    const dayDirs = await listDayDirs(root, range.start, range.end);
    const all: UsageRecord[] = [];
    // Process day dirs with bounded concurrency to stay light on fds.
    for (const dir of dayDirs) {
      let files: string[];
      try {
        files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      const batches = await Promise.all(
        files.map((f) => parseSessionFile(join(dir, f), range.start, range.end)),
      );
      for (const b of batches) all.push(...b);
    }
    return all;
  },
};
