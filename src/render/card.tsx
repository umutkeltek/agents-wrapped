import { computePersona } from "../core/persona.js";
import type { Stats } from "../types.js";

// Satori template for the shareable PNG card. Flexbox only; ASCII-only text
// (the bundled font is a latin subset); heatmap/bars are colored <div>s.

const C = {
  white: "#eef2fb",
  gray: "#9aa4b8",
  faint: "#5b6577",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  accentA: "#5b9dff",
  accentB: "#a274ff",
};

// Per-provider brand-ish colors so the card reads at a glance.
const BRAND: Record<string, string> = {
  codex: "#10a37f", // OpenAI green
  claude: "#d97757", // Anthropic clay
  opencode: "#a78bfa", // violet
  gemini: "#4285f4", // Google blue
  copilot: "#6cc644", // GitHub green
};
const HEAT = ["#161c2e", "#22315a", "#2f4f9e", "#4b7be6", "#7aa8ff"];

const WIDTH = 1080;
const HEIGHT = 1500;
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

function Label({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 16, color: C.gray, letterSpacing: 3, textTransform: "uppercase" }}>{text}</div>
  );
}

export function Card({ stats }: { stats: Stats }) {
  const cols = heatColumns(stats);
  const HEAT_GAP = 4;
  const cellSize = Math.max(8, Math.min(20, Math.floor((WIDTH - PAD * 2 - 52) / Math.max(1, cols.length)) - HEAT_GAP));
  const grandTokens =
    stats.totals.input + stats.totals.cachedInput + stats.totals.cacheCreation + stats.totals.output;
  const outputWords = Math.round(stats.totals.output * 0.75);
  const novels = Math.max(1, Math.round(outputWords / 100000));
  const who = computePersona(stats);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: "#0a0e1a",
        backgroundImage:
          "radial-gradient(900px 520px at 50% -8%, rgba(91,157,255,0.16), rgba(10,14,26,0) 70%), linear-gradient(168deg, #0c1122 0%, #0a0e1a 60%, #0b0f1e 100%)",
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
              backgroundImage: `linear-gradient(135deg, ${C.accentA}, ${C.accentB})`,
            }}
          />
          <div style={{ display: "flex", fontSize: 33, fontWeight: 700, color: C.white }}>Agents</div>
          <div style={{ display: "flex", fontSize: 33, color: C.gray, marginLeft: 12 }}>Wrapped</div>
        </div>
        <div
          style={{
            display: "flex",
            border: `1px solid ${who.color}`,
            borderRadius: 999,
            padding: "8px 18px",
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: 3,
            color: who.color,
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
            backgroundImage: `linear-gradient(95deg, ${C.accentA}, ${C.accentB})`,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {compact(grandTokens)}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: C.gray, letterSpacing: 3, marginTop: 4 }}>
          TOKENS ACROSS {stats.providers.length} AGENT{stats.providers.length === 1 ? "" : "S"}
        </div>
        <div style={{ display: "flex", fontSize: 18, color: C.faint, marginTop: 12 }}>
          {compact(outputWords)} words generated  ~  {fmt(novels)} novels written
        </div>
      </div>

      {/* Persona band — the shareable "16 personalities" result */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "rgba(255,255,255,0.04)",
          border: `1px solid ${who.color}`,
          borderRadius: 20,
          padding: "20px 26px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, backgroundColor: who.color, marginRight: 12 }} />
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: who.color }}>{who.name}</div>
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
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          {cols.map((col, ci) => (
            <div key={ci} style={{ display: "flex", flexDirection: "column", marginRight: HEAT_GAP }}>
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

      {/* Providers (brand-colored) */}
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
        <Label text="Providers" />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
          {stats.providers.map((p, i) => {
            const color = BRAND[p.provider] ?? C.accentA;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: i === stats.providers.length - 1 ? 0 : 14 }}>
                <div style={{ display: "flex", width: 14, height: 14, borderRadius: 4, backgroundColor: color, marginRight: 14 }} />
                <div style={{ display: "flex", width: 150, fontSize: 20, color: C.white }}>{p.displayName}</div>
                <div style={{ display: "flex", flexGrow: 1, height: 16, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, marginRight: 16 }}>
                  <div style={{ display: "flex", width: `${Math.max(2, Math.round(p.share * 100))}%`, height: 16, backgroundColor: color, borderRadius: 8 }} />
                </div>
                <div style={{ display: "flex", width: 110, fontSize: 18, color: C.gray, justifyContent: "flex-end" }}>{compact(p.tokens)} tok</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top models + key stats */}
      <div style={{ display: "flex", marginBottom: 16 }}>
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
            {stats.topModels.slice(0, 4).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 13 }}>
                <div style={{ display: "flex", width: 24, fontSize: 18, fontWeight: 700, color: C.accentA }}>{i + 1}</div>
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
            backgroundColor: "rgba(255,255,255,0.05)",
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "12px 20px",
          }}
        >
          <div style={{ display: "flex", fontSize: 20, color: C.accentA, marginRight: 12 }}>$</div>
          <div style={{ display: "flex", fontSize: 20, color: C.white }}>npx agents-wrapped</div>
        </div>
        <div style={{ display: "flex", fontSize: 16, color: C.faint }}>make your own ~</div>
      </div>
    </div>
  );
}
