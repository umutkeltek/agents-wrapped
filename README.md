# agents-wrapped

**Wrapped-style usage stats across all your AI coding agents — for any date range.**

`codex-wrapped` and `opencode-wrapped` each cover one tool and one calendar year.
`agents-wrapped` unifies every coding agent you use into a single card, over **any
period you ask for** — last 30 days, a custom window, a year, or all time.

```
  Agents Wrapped   all time
  ──────────────────────────────────────────────────────
  4,518 sessions   282,449 messages   275 projects

  PROVIDERS
  Codex         ████████████···· 72%  34.3B tok · 819 sess
  Claude Code   ████············ 28%  13.3B tok · 3,699 sess

  TOP MODELS
  1 gpt-5.5            17.4B tok 37%
  2 gpt-5.4            14.7B tok 31%
  3 claude-opus-4-7    12.3B tok 26%
```

## Install

```bash
npx agents-wrapped            # no install
# or
bun add -g agents-wrapped
```

Or run from source:

```bash
bun src/cli.ts --last 30d
```

## Usage

```bash
agents-wrapped                       # all time, every detected provider
agents-wrapped --year 2025           # a calendar year
agents-wrapped --last 30d            # relative window: 30d, 12w, 6m, 1y
agents-wrapped --from 2025-01-01 --to 2025-03-31
agents-wrapped --provider codex      # one provider
agents-wrapped --list-providers      # what was detected
agents-wrapped --json                # raw stats for scripting
agents-wrapped --png                 # also save a shareable card (~/agents-wrapped.png)
agents-wrapped --last 30d --out card.png   # render the card to a path
```

The terminal card prints by default; add `--png` (or `--out <path>`) to also render
a shareable image of the same stats.

## Supported providers

| Provider | Source | Status |
|----------|--------|--------|
| Codex CLI | `~/.codex/sessions/**/*.jsonl` | ✅ |
| Claude Code | `~/.claude/projects/**/*.jsonl` (incl. subagents) | ✅ |
| OpenCode | `~/.local/share/opencode/storage` | ⏳ planned |
| Gemini CLI | `~/.gemini` | ⏳ planned |
| Copilot CLI | — | ⏳ planned |

Adding a provider is one file implementing the `ProviderAdapter` interface
(`detect()` + `collect()`), registered in `src/adapters/index.ts`.

## How it works

It reads the local session logs each agent already writes — nothing is sent
anywhere. Each adapter normalizes its provider's logs into a common
`UsageRecord`, records are filtered to your date range, then aggregated into the
card. Token accounting follows the same conventions as
[`ccusage`](https://github.com/ryoppippi/ccusage): Claude turns are de-duplicated
by `message.id` + `requestId`; Codex per-turn usage is recovered as deltas of the
cumulative `total_token_usage` (which the CLI re-emits several times per turn).

## A note on accuracy

Token totals are cross-checked against an independent recount of the raw logs —
Claude matches to the exact token; Codex to within ~1.5% (the residual is
mid-session compaction resets).

**Cost is an estimate**, not a bill. It multiplies token counts by
[LiteLLM](https://github.com/BerriAI/litellm)'s community price table, and JSONL
token counts are known to undercount real usage. Treat the dollar figure as a
ballpark; authoritative spend lives in each provider's usage API.

## Roadmap

- OpenCode, Gemini, Copilot adapters
- Optional provider-API cost mode for billing-accurate numbers
- Auto-copy the rendered card to the clipboard

## License

MIT © Umut Keltek
