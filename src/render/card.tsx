import type { Stats } from "../types.js";

// Satori template for the shareable PNG card. Flexbox only; ASCII-only text
// (the bundled font is a latin subset); heatmap/bars are colored <div>s.

const COL = {
  bg: "#0a0e1a",
  panel: "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.07)",
  white: "#e9eef7",
  gray: "#8b95a8",
  faint: "#5b6577",
  blue: "#3b82f6",
  bright: "#60a5fa",
};
const HEAT = ["#151b2c", "#1e3a5f", "#2b5797", "#3b82f6", "#60a5fa"];

const WIDTH = 1080;
const HEIGHT = 1480;
const PAD = 56;

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function compact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function usd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
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
      if (cursor < start || cursor > end) {
        col.push(-1);
      } else {
        const day = cursor.toISOString().slice(0, 10);
        const c = stats.dailyActivity[day] ?? 0;
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
    <div style={{ fontSize: 15, color: COL.gray, letterSpacing: 3, textTransform: "uppercase" }}>
      {text}
    </div>
  );
}

function StatCard({ label, value, sub, mr }: { label: string; value: string; sub?: string; mr?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        flexBasis: 0,
        backgroundColor: COL.panel,
        border: `1px solid ${COL.border}`,
        borderRadius: 18,
        padding: "24px 26px",
        marginRight: mr ? 18 : 0,
      }}
    >
      <Label text={label} />
      <div style={{ fontSize: 30, fontWeight: 700, color: COL.white, marginTop: 12 }}>{value}</div>
      <div style={{ fontSize: 16, color: COL.faint, marginTop: 6 }}>{sub ?? ""}</div>
    </div>
  );
}

function BigStat({ label, value, accent, mr }: { label: string; value: string; accent?: boolean; mr?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        flexBasis: 0,
        backgroundColor: COL.panel,
        border: `1px solid ${COL.border}`,
        borderRadius: 18,
        padding: "22px 24px",
        marginRight: mr ? 18 : 0,
      }}
    >
      <Label text={label} />
      <div
        style={{
          fontSize: 38,
          fontWeight: 700,
          color: accent ? COL.bright : COL.white,
          marginTop: 12,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function Card({ stats }: { stats: Stats }) {
  const cols = heatColumns(stats);
  // Size heatmap cells to fill the panel width regardless of range length.
  const HEAT_GAP = 4;
  const HEAT_TRACK = WIDTH - PAD * 2 - 48; // panel inner width
  const cellSize = Math.max(8, Math.min(22, Math.floor(HEAT_TRACK / Math.max(1, cols.length)) - HEAT_GAP));
  const grandTokens =
    stats.totals.input + stats.totals.cachedInput + stats.totals.cacheCreation + stats.totals.output;
  const usageRows = (
    [
      ["Input", stats.totals.input],
      ["Cache read", stats.totals.cachedInput],
      ["Cache write", stats.totals.cacheCreation],
      ["Output", stats.totals.output],
      ["Reasoning", stats.totals.reasoning],
    ] as [string, number][]
  ).filter(([, v]) => v > 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: COL.bg,
        padding: PAD,
        fontFamily: "IBM Plex Mono",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 34 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              backgroundColor: COL.blue,
              marginRight: 16,
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700, color: COL.white }}>Agents</div>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 27, color: COL.gray, marginRight: 12 }}>wrapped</div>
          <div style={{ fontSize: 27, fontWeight: 700, color: COL.bright }}>{stats.range.label}</div>
        </div>
      </div>

      {/* Top stat cards */}
      <div style={{ display: "flex", marginBottom: 18 }}>
        <StatCard
          label="Started"
          value={stats.firstDay ?? "-"}
          sub={`${stats.daysSinceFirst} days ago`}
          mr
        />
        <StatCard
          label="Most active"
          value={stats.mostActiveDay ?? "-"}
          sub={`${fmt(stats.mostActiveDayCount)} turns`}
          mr
        />
        <StatCard
          label="Streak"
          value={`${stats.maxStreak}d`}
          sub={`${stats.currentStreak}d current`}
        />
      </div>

      {/* Activity heatmap */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: COL.panel,
          border: `1px solid ${COL.border}`,
          borderRadius: 18,
          padding: "22px 24px",
          marginBottom: 18,
        }}
      >
        <Label text="Activity" />
        <div style={{ display: "flex", marginTop: 16 }}>
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

      {/* Providers */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: COL.panel,
          border: `1px solid ${COL.border}`,
          borderRadius: 18,
          padding: "22px 24px",
          marginBottom: 18,
        }}
      >
        <Label text="Providers" />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          {stats.providers.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: i === stats.providers.length - 1 ? 0 : 12 }}>
              <div style={{ display: "flex", width: 180, fontSize: 19, color: COL.white }}>{p.displayName}</div>
              <div style={{ display: "flex", flexGrow: 1, height: 14, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 7, marginRight: 16 }}>
                <div style={{ display: "flex", width: `${Math.max(2, Math.round(p.share * 100))}%`, height: 14, backgroundColor: i === 0 ? COL.bright : COL.blue, borderRadius: 7 }} />
              </div>
              <div style={{ display: "flex", width: 96, fontSize: 18, color: COL.gray, justifyContent: "flex-end" }}>{compact(p.tokens)} tok</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two columns: top models + usage detail */}
      <div style={{ display: "flex", marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            flexBasis: 0,
            backgroundColor: COL.panel,
            border: `1px solid ${COL.border}`,
            borderRadius: 18,
            padding: "22px 24px",
            marginRight: 18,
          }}
        >
          <Label text="Top models" />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
            {stats.topModels.slice(0, 5).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", width: 26, fontSize: 18, fontWeight: 700, color: COL.bright }}>{i + 1}</div>
                <div style={{ display: "flex", flexGrow: 1, fontSize: 18, color: COL.white }}>{m.model}</div>
                <div style={{ display: "flex", fontSize: 16, color: COL.gray }}>{compact(m.tokens)}</div>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            flexBasis: 0,
            backgroundColor: COL.panel,
            border: `1px solid ${COL.border}`,
            borderRadius: 18,
            padding: "22px 24px",
          }}
        >
          <Label text="Usage detail" />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
            {usageRows.map(([k, v], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", fontSize: 18, color: COL.gray }}>{k}</div>
                <div style={{ display: "flex", fontSize: 18, color: COL.white }}>{fmt(v)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Big stats row 1 */}
      <div style={{ display: "flex", marginBottom: 18 }}>
        <BigStat label="Sessions" value={fmt(stats.totalSessions)} mr />
        <BigStat label="Turns" value={fmt(stats.totalMessages)} mr />
        <BigStat label="Total tokens" value={compact(grandTokens)} accent />
      </div>
      {/* Big stats row 2 */}
      <div style={{ display: "flex", marginBottom: 26 }}>
        <BigStat label="Projects" value={fmt(stats.totalProjects)} mr />
        <BigStat label="Providers" value={fmt(stats.providers.length)} mr />
        <BigStat label="Est. cost" value={usd(stats.totalCostUSD)} accent />
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
        <div style={{ display: "flex", fontSize: 17, color: COL.faint }}>agents-wrapped</div>
        <div style={{ display: "flex", fontSize: 17, color: COL.faint }}>
          {stats.firstDay ?? ""} - {stats.lastDay ?? ""}
        </div>
      </div>
    </div>
  );
}
