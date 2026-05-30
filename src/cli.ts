import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { ADAPTERS, detectAvailable } from "./adapters/index.js";
import { aggregate } from "./core/aggregate.js";
import { resolveRange } from "./core/daterange.js";
import { Pricing } from "./core/pricing.js";
import { renderTerminal } from "./render/terminal.js";
import type { ProviderAdapter, ProviderId, UsageRecord } from "./types.js";

const HELP = `
agents-wrapped — Wrapped-style usage stats across all your AI coding agents.

Usage:
  agents-wrapped [options]

Period (pick one; default: all time):
  --year <YYYY>        Calendar year, e.g. --year 2025
  --from <YYYY-MM-DD>  Start date (with optional --to)
  --to   <YYYY-MM-DD>  End date
  --last <NW>          Relative window: 30d, 12w, 6m, 1y

Providers:
  --provider <ids>     Comma-separated subset (codex,claude). Default: all detected.
  --list-providers     Show detected providers and exit.

Output (by default a shareable PNG is created AND opened):
  --out <path>         PNG output path (default: ~/agents-wrapped.png).
  --theme <dark|light> Card theme (default: dark).
  --no-open            Create the PNG but don't open it.
  --no-png             Terminal summary only, skip the PNG.
  --json               Print raw stats as JSON (for scripting; no PNG).
  -h, --help           Show this help.
  -v, --version        Print version.
`;

/** Open a file with the OS default app (best-effort, cross-platform). */
function openFile(path: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", path] : [path];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* opening is best-effort */
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      year: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      last: { type: "string" },
      all: { type: "boolean" },
      provider: { type: "string" },
      "list-providers": { type: "boolean" },
      json: { type: "boolean" },
      png: { type: "boolean" },
      "no-png": { type: "boolean" },
      "no-open": { type: "boolean" },
      out: { type: "string" },
      theme: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return;
  }

  if (values.version) {
    process.stdout.write(`agents-wrapped ${pkg.version}\n`);
    return;
  }

  const available = await detectAvailable();
  if (values["list-providers"]) {
    process.stdout.write("Providers (✓ = data found on this machine):\n");
    for (const a of ADAPTERS) {
      const ok = available.some((x) => x.id === a.id);
      const tag = a.experimental ? " (experimental)" : "";
      process.stdout.write(`  ${ok ? "✓" : "·"} ${a.id.padEnd(10)} ${a.displayName}${tag}\n`);
    }
    return;
  }

  if (available.length === 0) {
    process.stderr.write(
      "No provider data found. Looked for ~/.codex/sessions and ~/.claude/projects.\n",
    );
    process.exitCode = 1;
    return;
  }

  // Resolve which adapters to run.
  let adapters: ProviderAdapter[] = available;
  if (values.provider) {
    const want = new Set(values.provider.split(",").map((s) => s.trim()) as ProviderId[]);
    adapters = available.filter((a) => want.has(a.id));
    if (adapters.length === 0) {
      process.stderr.write(`None of "${values.provider}" are available.\n`);
      process.exitCode = 1;
      return;
    }
  }

  const range = resolveRange({
    year: values.year,
    from: values.from,
    to: values.to,
    last: values.last,
  });

  // Collect + price in parallel.
  const [recordBatches, pricing] = await Promise.all([
    Promise.all(adapters.map((a) => a.collect({ range }))),
    Pricing.load(),
  ]);
  const records: UsageRecord[] = recordBatches.flat();

  if (records.length === 0) {
    process.stderr.write(`No usage found for ${range.label}.\n`);
    process.exitCode = 1;
    return;
  }

  const stats = aggregate(records, range, pricing);

  if (values.json) {
    const { computePersona } = await import("./core/persona.js");
    process.stdout.write(JSON.stringify({ ...stats, persona: computePersona(stats) }, null, 2) + "\n");
    return;
  }

  process.stdout.write(renderTerminal(stats) + "\n");

  // A shareable PNG is created (and opened) by default — one command, done.
  if (!values["no-png"]) {
    const outPath = values.out ?? join(homedir(), "agents-wrapped.png");
    const theme = values.theme === "light" ? "light" : "dark";
    try {
      process.stdout.write(`  Rendering ${theme} card …\n`);
      const { renderPng } = await import("./render/png.js");
      await renderPng(stats, outPath, theme);
      process.stdout.write(`  ✓ Saved shareable card → ${outPath}\n`);
      if (!values["no-open"]) {
        openFile(outPath);
        process.stdout.write("  ↗ Opening it…\n\n");
      } else {
        process.stdout.write("\n");
      }
    } catch (err: any) {
      process.stdout.write(`  (card skipped — ${err?.message ?? err}; rerun with --no-png to silence)\n\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err?.message ?? err}\n`);
  process.exitCode = 1;
});
