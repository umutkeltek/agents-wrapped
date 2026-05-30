import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// IBM Plex Mono (latin subset) from fontsource via jsDelivr. Fetched once,
// cached on disk. Satori reads ttf/otf/woff (not woff2), so we use .woff.

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700;
  style: "normal";
}

const WEIGHTS = [400, 600, 700] as const;
const fontUrl = (w: number) =>
  `https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5/files/ibm-plex-mono-latin-${w}-normal.woff`;

function fontDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "agents-wrapped", "fonts");
}

async function loadOne(weight: number): Promise<Buffer> {
  const file = join(fontDir(), `ibm-plex-mono-${weight}.woff`);
  try {
    return await readFile(file);
  } catch {
    /* not cached yet */
  }
  const res = await fetch(fontUrl(weight), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Failed to fetch font weight ${weight}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    await mkdir(fontDir(), { recursive: true });
    await writeFile(file, buf);
  } catch {
    /* cache is best-effort */
  }
  return buf;
}

export async function loadFonts(): Promise<SatoriFont[]> {
  const buffers = await Promise.all(WEIGHTS.map(loadOne));
  return WEIGHTS.map((weight, i) => ({
    name: "IBM Plex Mono",
    data: buffers[i],
    weight,
    style: "normal" as const,
  }));
}
