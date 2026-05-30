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

Output:
  --png                Also render a shareable PNG card (~/agents-wrapped.png).
  --out <path>         PNG output path (implies --png).
  --json               Print raw stats as JSON instead of the card.
  -h, --help           Show this help.
  -v, --version        Print version.
`;

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
      out: { type: "string" },
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
    process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
    return;
  }

  process.stdout.write(renderTerminal(stats) + "\n");

  if (values.png || values.out) {
    const { renderPng } = await import("./render/png.js");
    const outPath = values.out ?? join(homedir(), "agents-wrapped.png");
    process.stdout.write(`  Rendering card → ${outPath} …\n`);
    await renderPng(stats, outPath);
    process.stdout.write(`  ✓ Saved ${outPath}\n\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err?.message ?? err}\n`);
  process.exitCode = 1;
});
