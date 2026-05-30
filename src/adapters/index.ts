import type { ProviderAdapter, ProviderId } from "../types.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";

// The adapter registry. Adding a provider = implement ProviderAdapter and list it here.
export const ADAPTERS: ProviderAdapter[] = [codexAdapter, claudeAdapter];

export function adapterById(id: ProviderId): ProviderAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

export async function detectAvailable(): Promise<ProviderAdapter[]> {
  const flags = await Promise.all(ADAPTERS.map((a) => a.detect()));
  return ADAPTERS.filter((_, i) => flags[i]);
}
