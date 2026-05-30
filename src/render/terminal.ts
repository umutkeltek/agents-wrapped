import type { Stats } from "../types.js";

// ANSI terminal rendering of the wrapped card.

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  blue: "\x1b[38;5;39m",
  cyan: "\x1b[38;5;51m",
  white: "\x1b[97m",
  gray: "\x1b[38;5;245m",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEAT = [" ", "░", "▒", "▓", "█"]; // 5 levels, less → more

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtUSD(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function heatChar(count: number, max: number): string {
  if (count <= 0) return C.dim + HEAT[0] + C.reset;
  const level = Math.min(4, 1 + Math.floor((count / max) * 3.999));
  const color = level >= 3 ? C.cyan : C.blue;
  return color + HEAT[level] + C.reset;
}

/** A GitHub-style heatmap: weeks as columns, weekdays as rows, over the range. */
function renderHeatmap(stats: Stats): string {
  if (!stats.firstDay || !stats.lastDay) return "";
  const start = new Date(stats.firstDay + "T00:00:00Z");
  const end = new Date(stats.lastDay + "T00:00:00Z");
  // Cap very long ranges so the grid stays terminal-friendly (~53 weeks).
  const maxWeeks = 53;
  const dayMs = 86400000;
  const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const gridStart =
    totalDays > maxWeeks * 7
      ? new Date(end.getTime() - (maxWeeks * 7 - 1) * dayMs)
      : start;
  // Align grid start to the preceding Sunday.
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  let max = 1;
  for (const v of Object.values(stats.dailyActivity)) if (v > max) max = v;

  // Build the grid column by column (each column = one week, Sun→Sat).
  const weeks: Date[][] = [];
  let cursor = new Date(gridStart);
  while (cursor <= end) {
    const col: Date[] = [];
    for (let wd = 0; wd < 7; wd++) {
      col.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(col);
  }

  const out: string[] = [];
  for (let wd = 0; wd < 7; wd++) {
    let row = "  ";
    for (const col of weeks) {
      const d = col[wd];
      if (!d || d < start || d > end) {
        row += " ";
        continue;
      }
      const day = d.toISOString().slice(0, 10);
      row += heatChar(stats.dailyActivity[day] ?? 0, max);
    }
    out.push(row);
  }
  return out.join("\n");
}

function bar(share: number, width = 16): string {
  const filled = Math.round(share * width);
  return C.blue + "█".repeat(filled) + C.dim + "·".repeat(width - filled) + C.reset;
}

export function renderTerminal(stats: Stats): string {
  const L: string[] = [];
  const line = (s = "") => L.push(s);

  const title = `${C.bold}${C.white}Agents${C.reset} ${C.gray}Wrapped${C.reset}`;
  line();
  line(`  ${title}   ${C.dim}${stats.range.label}${C.reset}`);
  line(`  ${C.dim}${"─".repeat(54)}${C.reset}`);

  // Headline numbers
  const headline = [
    [`${fmt(stats.totalSessions)}`, "sessions"],
    [`${fmt(stats.totalMessages)}`, "messages"],
    [`${fmt(stats.totalProjects)}`, "projects"],
  ];
  line(
    "  " +
      headline
        .map(([v, k]) => `${C.bold}${C.cyan}${v}${C.reset} ${C.gray}${k}${C.reset}`)
        .join("   "),
  );
  line();

  // Activity heatmap
  if (stats.firstDay) {
    line(`  ${C.gray}ACTIVITY${C.reset}  ${C.dim}${stats.firstDay} → ${stats.lastDay}${C.reset}`);
    line(renderHeatmap(stats));
    line();
  }

  // Most active
  if (stats.mostActiveDay) {
    line(
      `  ${C.gray}Most active day${C.reset}   ${C.white}${stats.mostActiveDay}${C.reset} ${C.dim}(${fmt(stats.mostActiveDayCount)} msgs)${C.reset}`,
    );
    line(
      `  ${C.gray}Busiest weekday${C.reset}   ${C.white}${WEEKDAYS[stats.mostActiveWeekday]}${C.reset}`,
    );
    line(
      `  ${C.gray}Streak${C.reset}            ${C.white}${stats.currentStreak}d${C.reset} ${C.dim}current · ${stats.maxStreak}d max${C.reset}`,
    );
    line();
  }

  // Providers
  line(`  ${C.gray}PROVIDERS${C.reset}`);
  for (const p of stats.providers) {
    line(
      `  ${C.white}${p.displayName.padEnd(13)}${C.reset} ${bar(p.share)} ${C.dim}${(p.share * 100).toFixed(0)}%${C.reset}  ${C.gray}${fmt(p.tokens)} tok · ${fmt(p.sessions)} sess${C.reset}`,
    );
  }
  line();

  // Top models
  line(`  ${C.gray}TOP MODELS${C.reset}`);
  stats.topModels.slice(0, 5).forEach((m, i) => {
    line(
      `  ${C.blue}${i + 1}${C.reset} ${C.white}${m.model.padEnd(24)}${C.reset} ${C.gray}${fmt(m.tokens)} tok${C.reset} ${C.dim}${(m.share * 100).toFixed(0)}%${C.reset}`,
    );
  });
  line();

  // Usage detail
  const t = stats.totals;
  line(`  ${C.gray}USAGE DETAIL${C.reset}`);
  const rows: [string, number][] = [
    ["Input", t.input],
    ["Cache read", t.cachedInput],
    ["Cache write", t.cacheCreation],
    ["Output", t.output],
    ["Reasoning", t.reasoning],
  ];
  for (const [k, v] of rows) {
    if (v === 0 && (k === "Cache write" || k === "Reasoning")) continue;
    line(`  ${C.gray}${k.padEnd(12)}${C.reset} ${C.white}${fmt(v).padStart(18)}${C.reset} ${C.dim}tok${C.reset}`);
  }
  const grand = t.input + t.cachedInput + t.cacheCreation + t.output;
  line(`  ${C.dim}${"─".repeat(34)}${C.reset}`);
  line(`  ${C.bold}${C.white}${"Total tokens".padEnd(12)}${C.reset} ${C.bold}${C.cyan}${fmt(grand).padStart(18)}${C.reset}`);
  line();

  // Cost
  const costLabel = stats.costIsEstimated ? "est. cost" : "cost";
  line(
    `  ${C.gray}USAGE ${costLabel.toUpperCase()}${C.reset}   ${C.bold}${C.cyan}${fmtUSD(stats.totalCostUSD)}${C.reset}` +
      (stats.costIsEstimated ? ` ${C.dim}(LiteLLM rates · JSONL tokens undercount)${C.reset}` : ""),
  );
  line(`  ${C.dim}${"─".repeat(54)}${C.reset}`);
  line(`  ${C.dim}agents-wrapped${C.reset}`);
  line();

  return L.join("\n");
}
