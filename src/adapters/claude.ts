import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AdapterContext, ProviderAdapter, UsageRecord } from "../types.js";

// Claude Code logs live at $CLAUDE_CONFIG_DIR/projects/{encoded-cwd}/{sessionId}.jsonl
// (default ~/.claude/projects). Each assistant line carries usage:
//   { type:"assistant", timestamp, requestId, sessionId,
//     message:{ id, model, usage:{ input_tokens, cache_creation_input_tokens,
//                                  cache_read_input_tokens, output_tokens } } }
// Dedup streaming chunks / replays by `${message.id}:${requestId}`.

function claudeRoots(): string[] {
  const configured = process.env.CLAUDE_CONFIG_DIR;
  const roots: string[] = [];
  if (configured) {
    for (const part of configured.split(",")) {
      const p = part.trim();
      if (p) roots.push(join(p, "projects"));
    }
  } else {
    roots.push(join(homedir(), ".claude", "projects"));
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg) roots.push(join(xdg, "claude", "projects"));
  }
  return roots;
}

/** Decode the encoded project dir name back into something readable. */
function decodeProject(dirName: string): string {
  // Claude encodes "/Users/umut/Projects/x" → "-Users-umut-Projects-x"
  return dirName.replace(/^-/, "/").replace(/-/g, "/");
}

/**
 * Recursively collect every .jsonl under a project dir. Claude Code stores
 * top-level session transcripts AND nested ones — notably subagent transcripts
 * at `{project}/{sessionId}/subagents/agent-*.jsonl`. A one-level glob silently
 * drops all subagent token usage, so we walk the whole tree.
 */
async function walkJsonl(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkJsonl(full)));
    } else if (e.isFile() && e.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

async function parseSessionFile(
  path: string,
  project: string,
  start: Date,
  end: Date,
  seen: Set<string>,
): Promise<UsageRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const records: UsageRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.indexOf('"input_tokens"') === -1) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj?.type !== "assistant") continue;
    const msg = obj.message;
    const usage = msg?.usage;
    if (!usage) continue;

    const id = msg.id ?? "";
    const reqId = obj.requestId ?? obj.request_id ?? "";
    if (id && reqId) {
      const key = `${id}:${reqId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }

    const ts = new Date(obj.timestamp);
    if (Number.isNaN(ts.getTime()) || ts < start || ts > end) continue;

    const input = usage.input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    if (input === 0 && output === 0 && cacheRead === 0 && cacheCreation === 0) continue;

    records.push({
      provider: "claude",
      timestamp: ts,
      model: msg.model ?? "claude",
      project,
      sessionId: obj.sessionId ?? path,
      tokens: {
        input,
        cachedInput: cacheRead,
        cacheCreation,
        output,
        reasoning: 0,
        total: input + cacheRead + cacheCreation + output,
      },
      costUSD: typeof obj.costUSD === "number" ? obj.costUSD : undefined,
    });
  }
  return records;
}

export const claudeAdapter: ProviderAdapter = {
  id: "claude",
  displayName: "Claude Code",

  async detect() {
    for (const root of claudeRoots()) {
      try {
        const s = await stat(root);
        if (s.isDirectory()) return true;
      } catch {
        /* keep looking */
      }
    }
    return false;
  },

  async collect({ range }: AdapterContext): Promise<UsageRecord[]> {
    const all: UsageRecord[] = [];
    const seen = new Set<string>(); // global dedup across resumed sessions
    for (const root of claudeRoots()) {
      let projectDirs: string[];
      try {
        projectDirs = (await readdir(root, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch {
        continue;
      }
      for (const dirName of projectDirs) {
        const project = decodeProject(dirName);
        const files = await walkJsonl(join(root, dirName)); // recursive: incl. subagents/
        const batches = await Promise.all(
          files.map((f) => parseSessionFile(f, project, range.start, range.end, seen)),
        );
        for (const b of batches) all.push(...b);
      }
    }
    return all;
  },
};
