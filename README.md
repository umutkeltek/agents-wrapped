# agents-wrapped

**Wrapped-style usage stats across all your AI coding agents — for any date range.**

[![npm](https://img.shields.io/npm/v/agents-wrapped.svg)](https://www.npmjs.com/package/agents-wrapped)
[![license](https://img.shields.io/npm/l/agents-wrapped.svg)](./LICENSE)

`codex-wrapped` and `opencode-wrapped` each cover one tool and one calendar year.
`agents-wrapped` unifies every coding agent you use into a single card — over **any
period you ask for** (last 30 days, a custom window, a year, all time) — and renders
it to the terminal and a shareable PNG.

```
  Agents Wrapped   all time
  ──────────────────────────────────────────────────────
  4,521 sessions   282,475 messages   276 projects

  PROVIDERS
  Codex         ████████████···· 72%  34.3B tok · 819 sess
  Claude Code   ████············ 28%  13.3B tok · 3,718 sess
  OpenCode      ················  0%  2.6M tok · 9 sess

  TOP MODELS
  1 gpt-5.5            17.4B tok 37%
  2 gpt-5.4            14.7B tok 31%
  3 claude-opus-4-7    12.3B tok 26%
```

## Quick start

```bash
npx agents-wrapped                 # one command: prints stats, makes + OPENS your shareable card
npx agents-wrapped --last 30d      # last 30 days
npx agents-wrapped --provider codex --theme light   # one provider, light card
```

That single command works for any user with no setup — it reads the local logs each
agent already writes, renders `~/agents-wrapped.png`, and opens it. Add `--no-png`
for terminal-only or `--no-open` to skip opening.

From a clone (Bun):

```bash
bun install
bun src/cli.ts --last 30d
```

## Commands

```
agents-wrapped [options]

Period (pick one; default: all time)
  --year <YYYY>            Calendar year, e.g. --year 2025
  --from <YYYY-MM-DD>      Start date (optionally with --to)
  --to   <YYYY-MM-DD>      End date
  --last <NW>              Relative window: 30d, 12w, 6m, 1y

Providers
  --provider <ids>         Comma-separated subset, e.g. codex,claude
  --list-providers         Show every provider and whether data was found

Output (a shareable PNG is created AND opened by default)
  --out <path>             PNG output path (default: ~/agents-wrapped.png)
  --theme <dark|light>     Card theme (default: dark)
  --no-open                Create the PNG but don't open it
  --no-png                 Terminal summary only, skip the PNG
  --json                   Print raw stats as JSON (for scripting; no PNG)

  -h, --help               Show help
  -v, --version            Print version
```

### What happens when you run it

`agents-wrapped` (no flags) does three things in one shot:

1. detects which agents have data on this machine (Codex, Claude Code, OpenCode…),
2. prints a stats summary to your terminal, and
3. renders a crisp 2× shareable card to `~/agents-wrapped.png` **and opens it**.

No config, no API keys, no sign-in — it just reads the local logs each agent
already writes.

### Choosing a time period

Default is **all time**. Pick a window with one of:

```bash
agents-wrapped --year 2025                      # a calendar year
agents-wrapped --last 30d                        # relative: 30d, 12w, 6m, 1y
agents-wrapped --from 2026-01-01 --to 2026-03-31 # an explicit range
```

### Focusing on one agent

Pass a single `--provider` and the whole card **re-themes to that tool's brand
color**, retitles ("Codex Wrapped"), recomputes your personality, and replaces the
provider comparison with a deeper per-provider token breakdown:

```bash
agents-wrapped --provider codex
agents-wrapped --provider claude --theme light   # one tool + light card
agents-wrapped --provider codex,claude           # a subset (comma-separated)
```

### Controlling the output

```bash
agents-wrapped --out ~/Desktop/wrapped.png   # save to a specific path
agents-wrapped --no-open                      # make the PNG but don't open it
agents-wrapped --no-png                        # terminal summary only
agents-wrapped --json | jq '.persona'          # raw stats for scripting (no PNG)
agents-wrapped --list-providers                # what was detected on this machine
```

## Your coding personality

Every wrapped computes a fun **16-type coding personality** from your real usage —
four binary axes, like an MBTI for AI agents:

| Axis | | |
|------|--|--|
| **H / L** | Heavy / Light | total token volume |
| **P / F** | Polyglot / Faithful | spread across agents |
| **S / B** | Steady / Bursty | streak & consistency |
| **D / Q** | Deep / Quick | tokens per session |

Each axis is a continuous 0–1 score (volume is log-scaled; diversity uses a
Herfindahl index over providers + models; rhythm uses active-day density; depth
uses tokens per session) then thresholded to a letter. That's 16 archetypes —
from **The Grandmaster** (`HPSD`) to **The Minimalist** (`LFBQ`). Your type and
its raw scores show on the card, in the terminal, and under `--json` (`.persona`).

## Supported providers

| Provider | Source it reads | Status |
|----------|-----------------|--------|
| **Codex CLI** | `~/.codex/sessions/**/*.jsonl` (`$CODEX_HOME`) | ✅ verified |
| **Claude Code** | `~/.claude/projects/**/*.jsonl` incl. nested `subagents/` (`$CLAUDE_CONFIG_DIR`) | ✅ verified |
| **OpenCode** | `~/.local/share/opencode/opencode.db` (SQLite) or `storage/message/**/*.json` | ✅ verified |
| **Gemini CLI** | `~/.gemini/tmp/**/*.{json,jsonl}` (`$GEMINI_DATA_DIR`) | 🧪 experimental |
| **GitHub Copilot CLI** | `~/.copilot/otel/*.jsonl` (requires OTEL file export) | 🧪 experimental |

`✅ verified` = token totals cross-checked to the exact token against an independent
recount of the raw logs. `🧪 experimental` = parser written to the documented format
but not yet validated against real data (run `--list-providers` to see what's detected).

Adding a provider is one file implementing the `ProviderAdapter` interface
(`detect()` + `collect()`), registered in `src/adapters/index.ts`.

## How it works

Everything is read from the local session logs each agent already writes — **nothing
leaves your machine** (the only network calls are fetching the public LiteLLM price
table and the card font, both cached on disk). Each adapter normalizes its provider's
logs into a common `UsageRecord`; records are filtered to your date range and
aggregated into the card.

Token accounting follows the same conventions as
[`ccusage`](https://github.com/ryoppippi/ccusage): Claude turns are de-duplicated by
`message.id` + `requestId`; Codex per-turn usage is recovered as deltas of the
cumulative `total_token_usage` (the CLI re-emits each snapshot several times per turn).
Files are streamed line-by-line so multi-hundred-MB sessions are counted correctly on
every runtime.

## Data provenance & accuracy

**You can only wrap what's on disk.** These CLIs rotate/prune old session logs, so the
window you can analyze is bounded by what each tool still retains locally — often only
the last few weeks or months. If you used older model versions earlier and they don't
appear, it's almost always because those logs have been pruned, not a parsing gap.
Run `--list-providers`; the card footer shows the actual date span found.

**Top models shows the top few by token volume.** Lower-volume models are still counted
in the totals and cost — use `--json` to see the full per-model breakdown.

**Cost is an estimate, not a bill.** It multiplies token counts by
[LiteLLM](https://github.com/BerriAI/litellm)'s community price table, and JSONL token
counts are known to undercount real billing. Treat the dollar figure as a ballpark;
authoritative spend lives in each provider's usage API.

## Development

```bash
bun install
bun src/cli.ts --last 30d   # run from source
bun run typecheck           # tsc --noEmit
bun run build               # bundle to dist/cli.js (node target) + shebang
node dist/cli.js --all      # run the built artifact under node (the npx path)
```

## Requirements

Node ≥ 18 (or Bun). OpenCode's SQLite store needs Node ≥ 22 (`node:sqlite`) or Bun;
without it, OpenCode falls back to its JSON layout and other providers are unaffected.

## Roadmap

- Validate the Gemini and Copilot adapters against real data
- Optional provider-API cost mode for billing-accurate numbers
- Auto-copy the rendered card to the clipboard

## License

MIT © Umut Keltek
