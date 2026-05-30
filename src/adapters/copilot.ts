import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AdapterContext, ProviderAdapter, UsageRecord } from "../types.js";

// GitHub Copilot CLI emits OpenTelemetry records (opt-in) to ~/.copilot/otel/*.jsonl
// (override COPILOT_OTEL_FILE_EXPORTER_PATH). Token usage lives in `gen_ai.usage.*`
// attributes. Records may be OTEL spans/logs with attributes as a flat object OR an
// array of {key,value:{...}}. Dedup overlapping records by trace:span.
// EXPERIMENTAL — unverified (requires COPILOT_OTEL_ENABLED + file exporter).

function copilotDir(): string {
  return join(homedir(), ".copilot", "otel");
}

/** Flatten OTEL attributes (object or [{key,value}]) into a string→primitive map. */
function flattenAttrs(attrs: any): Record<string, any> {
  if (!attrs) return {};
  if (Array.isArray(attrs)) {
    const out: Record<string, any> = {};
    for (const kv of attrs) {
      if (!kv || typeof kv.key !== "string") continue;
      const v = kv.value ?? {};
      out[kv.key] =
        v.intValue ?? v.doubleValue ?? v.stringValue ?? v.boolValue ?? v.value ?? v;
    }
    return out;
  }
  if (typeof attrs === "object") return attrs;
  return {};
}

function num(v: any): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function toMs(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
    const n = Number(v);
    if (Number.isFinite(n)) v = n;
    else return null;
  }
  if (typeof v === "number") {
    // nanoseconds → ms if the value is implausibly large for ms
    if (v > 1e15) return Math.floor(v / 1e6);
    if (v > 1e12) return v;
    if (v > 1e9) return v * 1000; // seconds → ms
    return v;
  }
  return null;
}

export const copilotAdapter: ProviderAdapter = {
  id: "copilot",
  displayName: "Copilot",
  experimental: true,

  async detect() {
    try {
      const s = await stat(copilotDir());
      return s.isDirectory();
    } catch {
      return false;
    }
  },

  async collect({ range }: AdapterContext): Promise<UsageRecord[]> {
    const dir = copilotDir();
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return [];
    }
    const out: UsageRecord[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      let text: string;
      try {
        text = await readFile(join(dir, file), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        if (!line.includes("attributes")) continue;
        let obj: any;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        const a = flattenAttrs(obj.attributes);
        const input = num(a["gen_ai.usage.input_tokens"]);
        const output = num(a["gen_ai.usage.output_tokens"]);
        const cacheRead = num(a["gen_ai.usage.cache_read.input_tokens"]);
        const cacheWrite =
          num(a["gen_ai.usage.cache_write.input_tokens"]) ||
          num(a["gen_ai.usage.cache_creation.input_tokens"]);
        const reasoning =
          num(a["gen_ai.usage.reasoning.output_tokens"]) || num(a["gen_ai.usage.reasoning_tokens"]);
        if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) continue;

        const traceId = obj.traceId ?? obj.trace_id ?? a["trace_id"] ?? "";
        const spanId = obj.spanId ?? obj.span_id ?? a["span_id"] ?? "";
        const respId = a["gen_ai.response.id"] ?? "";
        const dedupKey = traceId && spanId ? `${traceId}:${spanId}` : respId || line.slice(0, 64);
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const tsMs =
          toMs(obj.endTime ?? obj.startTime ?? obj.time ?? obj.timestamp ?? a["timeUnixNano"]) ??
          null;
        if (tsMs == null) continue;
        const ts = new Date(tsMs);
        if (ts < range.start || ts > range.end) continue;

        out.push({
          provider: "copilot",
          timestamp: ts,
          model: a["gen_ai.response.model"] ?? a["gen_ai.request.model"] ?? "copilot",
          project: "copilot",
          sessionId:
            a["gen_ai.conversation.id"] ??
            a["copilot_chat.session_id"] ??
            a["session.id"] ??
            "copilot-session",
          tokens: {
            input,
            cachedInput: cacheRead,
            cacheCreation: cacheWrite,
            output,
            reasoning,
            total: input + cacheRead + cacheWrite + output,
          },
        });
      }
    }
    return out;
  },
};
