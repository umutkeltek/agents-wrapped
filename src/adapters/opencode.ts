import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AdapterContext, ProviderAdapter, UsageRecord } from "../types.js";

// OpenCode stores usage in either a SQLite db (newer) or per-message JSON files
// (older). Newer: $XDG_DATA_HOME/opencode/opencode.db, `message` table with a
// JSON `data` column + a `session` table whose `directory` is the cwd. Older:
// storage/message/{sessionID}/*.json. We support both.

function opencodeRoot(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg ? join(xdg, "opencode") : join(homedir(), ".local", "share", "opencode");
  return process.env.OPENCODE_DATA_DIR?.split(",")[0]?.trim() || base;
}

interface MessageData {
  role?: string;
  modelID?: string;
  providerID?: string;
  cost?: number;
  time?: { created?: number };
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    total?: number;
    cache?: { read?: number; write?: number };
  };
}

function recordFromData(
  data: MessageData,
  fallbackTs: number,
  project: string,
  sessionId: string,
  range: AdapterContext["range"],
): UsageRecord | null {
  if (data.role !== "assistant" || !data.tokens) return null;
  const t = data.tokens;
  const ts = new Date(data.time?.created ?? fallbackTs);
  if (Number.isNaN(ts.getTime()) || ts < range.start || ts > range.end) return null;
  const input = t.input ?? 0;
  const output = t.output ?? 0;
  const cacheRead = t.cache?.read ?? 0;
  const cacheWrite = t.cache?.write ?? 0;
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) return null;
  return {
    provider: "opencode",
    timestamp: ts,
    model: data.modelID ? `${data.providerID ?? ""}/${data.modelID}`.replace(/^\//, "") : "opencode",
    project,
    sessionId,
    tokens: {
      input,
      cachedInput: cacheRead,
      cacheCreation: cacheWrite,
      output,
      reasoning: t.reasoning ?? 0,
      total: t.total ?? input + output,
    },
    costUSD: typeof data.cost === "number" && data.cost > 0 ? data.cost : undefined,
  };
}

interface DbRow {
  session_id: string;
  time_created: number;
  data: string;
  directory: string | null;
}

/** Read the OpenCode SQLite db with whichever runtime sqlite binding is available. */
async function readDb(dbPath: string): Promise<DbRow[]> {
  const sql =
    "SELECT m.session_id AS session_id, m.time_created AS time_created, m.data AS data, " +
    "s.directory AS directory FROM message m LEFT JOIN session s ON m.session_id = s.id";
  // node:sqlite (Node >= 22.5)
  try {
    const mod: any = await import("node:sqlite");
    const db = new mod.DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare(sql).all() as DbRow[];
    db.close();
    return rows;
  } catch {
    /* try the next runtime */
  }
  // bun:sqlite (specifier in a variable so tsc/node don't resolve it statically)
  try {
    const bunSqlite = "bun:sqlite";
    const mod: any = await import(bunSqlite);
    const db = new mod.Database(dbPath, { readonly: true });
    const rows = db.query(sql).all() as DbRow[];
    db.close();
    return rows;
  } catch {
    return [];
  }
}

async function collectFromDb(dbPath: string, range: AdapterContext["range"]): Promise<UsageRecord[]> {
  const rows = await readDb(dbPath);
  const out: UsageRecord[] = [];
  for (const r of rows) {
    let data: MessageData;
    try {
      data = JSON.parse(r.data);
    } catch {
      continue;
    }
    const rec = recordFromData(data, r.time_created, r.directory ?? "opencode", r.session_id, range);
    if (rec) out.push(rec);
  }
  return out;
}

async function collectFromJson(root: string, range: AdapterContext["range"]): Promise<UsageRecord[]> {
  const msgRoot = join(root, "storage", "message");
  const out: UsageRecord[] = [];
  let sessionDirs: string[];
  try {
    sessionDirs = (await readdir(msgRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return out;
  }
  for (const sessionId of sessionDirs) {
    const dir = join(msgRoot, sessionId);
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    const batches = await Promise.all(
      files.map(async (f) => {
        try {
          const data = JSON.parse(await readFile(join(dir, f), "utf8")) as MessageData;
          return recordFromData(data, data.time?.created ?? 0, "opencode", sessionId, range);
        } catch {
          return null;
        }
      }),
    );
    for (const r of batches) if (r) out.push(r);
  }
  return out;
}

export const opencodeAdapter: ProviderAdapter = {
  id: "opencode",
  displayName: "OpenCode",

  async detect() {
    const root = opencodeRoot();
    try {
      await stat(join(root, "opencode.db"));
      return true;
    } catch {
      /* no db; check json layout */
    }
    try {
      const s = await stat(join(root, "storage", "message"));
      return s.isDirectory();
    } catch {
      return false;
    }
  },

  async collect({ range }: AdapterContext): Promise<UsageRecord[]> {
    const root = opencodeRoot();
    const dbPath = join(root, "opencode.db");
    try {
      await stat(dbPath);
      const fromDb = await collectFromDb(dbPath, range);
      if (fromDb.length > 0) return fromDb;
    } catch {
      /* no db */
    }
    return collectFromJson(root, range);
  },
};
