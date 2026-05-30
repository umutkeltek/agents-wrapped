import { computePersona } from "../core/persona.js";
import type { Stats } from "../types.js";

// Satori template for the shareable PNG card. Flexbox only; ASCII-only text
// (the bundled font is a latin subset); heatmap/bars are colored <div>s.

export type Theme = "dark" | "light";

interface Palette {
  white: string;
  gray: string;
  faint: string;
  panel: string;
  border: string;
  track: string;
  accentA: string;
  accentB: string;
  bg: string;
  bgImage: string;
  heat: string[];
}

const DARK: Palette = {
  white: "#eef2fb",
  gray: "#9aa4b8",
  faint: "#5b6577",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  track: "rgba(255,255,255,0.05)",
  accentA: "#5b9dff",
  accentB: "#a274ff",
  bg: "#0a0e1a",
  bgImage:
    "radial-gradient(900px 520px at 50% -8%, rgba(91,157,255,0.16), rgba(10,14,26,0) 70%), linear-gradient(168deg, #0c1122 0%, #0a0e1a 60%, #0b0f1e 100%)",
  heat: ["#161c2e", "#22315a", "#2f4f9e", "#4b7be6", "#7aa8ff"],
};

const LIGHT: Palette = {
  white: "#1b2233",
  gray: "#566076",
  faint: "#98a2b6",
  panel: "rgba(20,30,60,0.035)",
  border: "rgba(20,30,60,0.12)",
  track: "rgba(20,30,60,0.08)",
  accentA: "#3b6ff5",
  accentB: "#8b5cf6",
  bg: "#f4f6fb",
  bgImage:
    "radial-gradient(900px 520px at 50% -8%, rgba(91,141,255,0.14), rgba(244,246,251,0) 70%), linear-gradient(168deg, #f8f9fe 0%, #eef1f8 60%, #f4f6fb 100%)",
  heat: ["#e4e9f3", "#c2d4f4", "#94b6f0", "#5b8df5", "#3b6ff5"],
};

// Per-provider brand-ish colors so the card reads at a glance.
const BRAND: Record<string, string> = {
  codex: "#10a37f",
  claude: "#d97757",
  opencode: "#8b5cf6",
  gemini: "#4285f4",
  copilot: "#3fb950",
};

const WIDTH = 1080;
const HEIGHT = 1640;
const PAD = 60;

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function compact(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function usd(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

/** Multiply a hex color's channels by `factor` (<1 darkens). For light-theme contrast. */
function shade(hex: string, factor: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(Math.min(255, ((n >> shift) & 255) * factor));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function heatColumns(stats: Stats): number[][] {
  if (!stats.firstDay || !stats.lastDay) return [];
  const start = new Date(stats.firstDay + "T00:00:00Z");
  const end = new Date(stats.lastDay + "T00:00:00Z");
  const dayMs = 86400000;
  const maxWeeks = 52;
  const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const gridStart =
    totalDays > maxWeeks * 7 ? new Date(end.getTime() - (maxWeeks * 7 - 1) * dayMs) : new Date(start);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  let max = 1;
  for (const v of Object.values(stats.dailyActivity)) if (v > max) max = v;
  const cols: number[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= end) {
    const col: number[] = [];
    for (let wd = 0; wd < 7; wd++) {
      if (cursor < start || cursor > end) col.push(-1);
      else {
        const c = stats.dailyActivity[cursor.toISOString().slice(0, 10)] ?? 0;
        col.push(c <= 0 ? 0 : Math.min(4, 1 + Math.floor((c / max) * 3.999)));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    cols.push(col);
  }
  return cols;
}

export function Card({ stats, theme = "dark" }: { stats: Stats; theme?: Theme }) {
  const C = theme === "light" ? LIGHT : DARK;
  const HEAT = C.heat;
  const Label = ({ text }: { text: string }) => (
    <div style={{ fontSize: 16, color: C.gray, letterSpacing: 3, textTransform: "uppercase" }}>{text}</div>
  );

  const cols = heatColumns(stats);
  const HEAT_GAP = 5;
  const HEAT_TRACK = WIDTH - PAD * 2 - 52;
  const cellSize = Math.max(7, Math.min(42, Math.floor((HEAT_TRACK - (cols.length - 1) * HEAT_GAP) / Math.max(1, cols.length))));
  const grandTokens =
    stats.totals.input + stats.totals.cachedInput + stats.totals.cacheCreation + stats.totals.output;
  const outputWords = Math.round(stats.totals.output * 0.75);
  const novels = Math.max(1, Math.round(outputWords / 100000));
  const who = computePersona(stats);

  // Provider-focused mode: one provider in view → theme to its brand color.
  const single = stats.providers.length === 1;
  const focus = single ? stats.providers[0] : null;
  const accent = focus ? BRAND[focus.provider] ?? C.accentA : C.accentA;
  const heroGrad = `linear-gradient(95deg, ${accent}, ${C.accentB})`;
  // In single mode the persona band adopts the provider color; otherwise its own.
  // On light theme, darken it so the pale persona hues stay readable.
  const rawBand = single ? accent : who.color;
  const bandColor = theme === "light" ? shade(rawBand, 0.62) : rawBand;
  const breakdown = (
    [
      ["Input", stats.totals.input],
      ["Cache read", stats.totals.cachedInput],
      ["Cache write", stats.totals.cacheCreation],
      ["Output", stats.totals.output],
      ["Reasoning", stats.totals.reasoning],
    ] as [string, number][]
  ).filter(([, v]) => v > 0);
  const bMax = Math.max(1, ...breakdown.map(([, v]) => v));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: C.bg,
        backgroundImage: C.bgImage,
        padding: PAD,
        fontFamily: "IBM Plex Mono",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 38,
              height: 38,
              borderRadius: 11,
              marginRight: 15,
              backgroundImage: `linear-gradient(135deg, ${accent}, ${C.accentB})`,
            }}
          />
          <div style={{ display: "flex", fontSize: 33, fontWeight: 700, color: C.white }}>{focus ? focus.displayName : "Agents"}</div>
          <div style={{ display: "flex", fontSize: 33, color: C.gray, marginLeft: 12 }}>Wrapped</div>
        </div>
        <div
          style={{
            display: "flex",
            border: `1px solid ${bandColor}`,
            borderRadius: 999,
            padding: "8px 18px",
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: 3,
            color: bandColor,
          }}
        >
          {who.code}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 18, color: C.faint, marginTop: 8 }}>
        {stats.firstDay} -- {stats.lastDay}
      </div>

      {/* Hero */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 34, marginBottom: 30 }}>
        <div
          style={{
            display: "flex",
            fontSize: 132,
            fontWeight: 700,
            lineHeight: 1.05,
            backgroundImage: heroGrad,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {compact(grandTokens)}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: C.gray, letterSpacing: 3, marginTop: 4 }}>
          {focus ? `TOKENS ON ${focus.displayName.toUpperCase()}` : `TOKENS ACROSS ${stats.providers.length} AGENTS`}
        </div>
        <div style={{ display: "flex", fontSize: 18, color: C.faint, marginTop: 12 }}>
          {compact(outputWords)} words generated  ~  {fmt(novels)} novels written
        </div>
      </div>

      {/* Persona band */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: C.panel,
          border: `1px solid ${bandColor}`,
          borderRadius: 20,
          padding: "20px 26px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, backgroundColor: bandColor, marginRight: 12 }} />
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: bandColor }}>{who.name}</div>
          </div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 4, color: C.gray }}>{who.code}</div>
        </div>
        <div style={{ display: "flex", fontSize: 17, color: C.gray, marginTop: 8 }}>{who.tagline}</div>
        <div style={{ display: "flex", marginTop: 12 }}>
          {who.axes.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                fontSize: 14,
                color: C.faint,
                border: `1px solid ${C.border}`,
                borderRadius: 999,
                padding: "5px 13px",
                marginRight: 9,
              }}
            >
              {a}
            </div>
          ))}
        </div>
      </div>

      {/* Activity heatmap */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: "22px 26px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Label text="Activity" />
          <div style={{ display: "flex", fontSize: 16, color: C.faint }}>
            {stats.currentStreak}d streak / {stats.maxStreak}d best
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 18 }}>
          {cols.map((col, ci) => (
            <div key={ci} style={{ display: "flex", flexDirection: "column", marginRight: ci === cols.length - 1 ? 0 : HEAT_GAP }}>
              {col.map((lvl, ri) => (
                <div
                  key={ri}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 3,
                    marginBottom: HEAT_GAP,
                    backgroundColor: lvl < 0 ? "transparent" : HEAT[lvl],
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Providers comparison (multi) OR per-provider token breakdown (single) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: "22px 26px",
          marginBottom: 16,
        }}
      >
        <Label text={single ? "Token breakdown" : "Providers"} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
          {single
            ? breakdown.map(([k, v], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: i === breakdown.length - 1 ? 0 : 14 }}>
                  <div style={{ display: "flex", flexShrink: 0, width: 150, fontSize: 19, color: C.gray }}>{k}</div>
                  <div style={{ display: "flex", flexGrow: 1, height: 16, backgroundColor: C.track, borderRadius: 8, marginRight: 18 }}>
                    <div style={{ display: "flex", width: `${Math.max(2, Math.round((v / bMax) * 100))}%`, height: 16, backgroundColor: accent, borderRadius: 8 }} />
                  </div>
                  <div style={{ display: "flex", flexShrink: 0, width: 96, fontSize: 18, color: C.white, justifyContent: "flex-end" }}>{compact(v)}</div>
                </div>
              ))
            : stats.providers.map((p, i) => {
                const color = BRAND[p.provider] ?? C.accentA;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: i === stats.providers.length - 1 ? 0 : 14 }}>
                    <div style={{ display: "flex", flexShrink: 0, width: 14, height: 14, borderRadius: 4, backgroundColor: color, marginRight: 14 }} />
                    <div style={{ display: "flex", flexShrink: 0, width: 148, fontSize: 20, color: C.white }}>{p.displayName}</div>
                    <div style={{ display: "flex", flexGrow: 1, height: 16, backgroundColor: C.track, borderRadius: 8, marginRight: 18 }}>
                      <div style={{ display: "flex", width: `${Math.max(2, Math.round(p.share * 100))}%`, height: 16, backgroundColor: color, borderRadius: 8 }} />
                    </div>
                    <div style={{ display: "flex", flexShrink: 0, width: 64, fontSize: 18, color: C.white, justifyContent: "flex-end", marginRight: 14 }}>{compact(p.tokens)}</div>
                    <div style={{ display: "flex", flexShrink: 0, width: 52, fontSize: 18, color: C.faint, justifyContent: "flex-end" }}>{Math.round(p.share * 100)}%</div>
                  </div>
                );
              })}
        </div>
      </div>

      {/* Top models + key stats */}
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            flexBasis: 0,
            backgroundColor: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: "22px 26px",
            marginRight: 16,
          }}
        >
          <Label text="Top models" />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
            {stats.topModels.slice(0, 5).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: i === Math.min(4, stats.topModels.length - 1) ? 0 : 13 }}>
                <div style={{ display: "flex", width: 24, fontSize: 18, fontWeight: 700, color: accent }}>{i + 1}</div>
                <div style={{ display: "flex", flexGrow: 1, fontSize: 17, color: C.white }}>{m.model}</div>
                <div style={{ display: "flex", fontSize: 15, color: C.gray }}>{compact(m.tokens)}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0 }}>
          {[
            { k: "Sessions", v: compact(stats.totalSessions) },
            { k: "Messages", v: compact(stats.totalMessages) },
            { k: "Projects", v: fmt(stats.totalProjects) },
            { k: "Est. cost", v: usd(stats.totalCostUSD) },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 22px",
                marginBottom: i === 3 ? 0 : 11,
              }}
            >
              <div style={{ display: "flex", fontSize: 16, color: C.gray, letterSpacing: 1 }}>{s.k}</div>
              <div style={{ display: "flex", fontSize: 27, fontWeight: 700, color: C.white }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer with the command — the viral hook */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: C.track,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "12px 20px",
          }}
        >
          <div style={{ display: "flex", fontSize: 20, color: accent, marginRight: 12 }}>$</div>
          <div style={{ display: "flex", fontSize: 20, color: C.white }}>npx agents-wrapped{focus ? ` --provider ${focus.provider}` : ""}</div>
        </div>
        <div style={{ display: "flex", fontSize: 16, color: C.faint }}>make your own ~</div>
      </div>
    </div>
  );
}
