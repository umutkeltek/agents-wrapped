import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";
import type { Stats } from "../types.js";
import { Card } from "./card.js";
import { loadFonts } from "./fonts.js";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1480;

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("@resvg/resvg-wasm/index_bg.wasm");
    wasmReady = readFile(wasmPath).then((bytes) => initWasm(bytes));
  }
  return wasmReady;
}

/** Render the stats card to a PNG file. Returns the output path. */
export async function renderPng(stats: Stats, outPath: string): Promise<string> {
  const fonts = await loadFonts();
  // Card() returns a JSX element; satori's element type is its own ReactNode.
  const element = Card({ stats }) as Parameters<typeof satori>[0];
  const svg = await satori(element, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });

  await ensureWasm();
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } });
  const png = resvg.render().asPng();
  await writeFile(outPath, png);
  return outPath;
}
