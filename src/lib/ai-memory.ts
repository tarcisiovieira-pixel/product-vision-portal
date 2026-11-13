// Memória das IAs no app. Conta real: funções do banco (o dono é quem lê e escreve).
// Demo: sandbox no navegador, que nunca toca no banco.
import { queryOptions } from "@tanstack/react-query";
import type { AddonKey } from "@shared/addons";
import type { AnalyticsTotals } from "@shared/analytics";
import {
  DISMISS_DAYS,
  MAX_MEMORY_ITEMS,
  MEMORY_TOPICS,
  type MemoryCandidate,
  type MemoryItem,
  type MemoryTopic,
} from "@shared/memory";
import { hasRealSession } from "./ares-data";
import { rpc } from "./rpc";
import { isDemoSession, readDemoMemory, readDemoSnapshot, writeDemoMemory } from "./session";

export interface MemoryState {
  /** Falso se o usuário desligou, ou se o banco ainda não tem a migration. */
  enabled: boolean;
  items: MemoryItem[];
  /** Falso quando não há conta (visitante) ou o banco não tem a funcionalidade. */
  available: boolean;
}

const EMPTY: MemoryState = { enabled: false, items: [], available: false };

interface DemoMemory {
  enabled: boolean;
  items: MemoryItem[];
}

const demoState = (): DemoMemory => readDemoMemory<DemoMemory>() ?? { enabled: true, items: [] };

const live = (items: MemoryItem[]) =>
  items.filter((i) => !i.expires_at || new Date(i.expires_at).getTime() > Date.now());

export async function readMemory(): Promise<MemoryState> {
  if (isDemoSession()) {
    const s = demoState();
    return { enabled: s.enabled, items: live(s.items), available: true };
  }
  if (!(await hasRealSession())) return EMPTY;
  try {
    const raw = await rpc<{ enabled: boolean; items: MemoryItem[] } | null>("ai_get_memory");
    if (!raw) return EMPTY;
    return { enabled: raw.enabled === true, items: raw.items ?? [], available: true };
  } catch {
    return EMPTY; // banco sem a migration: a IA segue sem memória
  }
}

export const memoryQuery = queryOptions({
  queryKey: ["ai", "memory"],
  staleTime: 30_000,
  queryFn: readMemory,
});

const isTopic = (value: string): value is MemoryTopic =>
  (MEMORY_TOPICS as readonly string[]).includes(value);

/** Guarda uma preferência já validada. No banco, a validação se repete. */
export async function remember(
  candidate: MemoryCandidate,
  options: { ttlDays?: number; source?: MemoryItem["source"] } = {},
): Promise<boolean> {
  if (!isTopic(candidate.topic)) return false;
  if (isDemoSession()) {
    const s = demoState();
    if (!s.enabled) return false;
    const now = new Date().toISOString();
    let items = s.items;
    // Tópicos de valor único substituem o anterior; só as dispensas acumulam.
    if (candidate.topic !== "dismissed_addon") {
      items = items.filter((i) => i.topic !== candidate.topic);
    } else {
      items = items.filter((i) => !(i.topic === candidate.topic && i.value === candidate.value));
    }
    items = [
      {
        id: `demo-mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        topic: candidate.topic,
        value: candidate.value,
        source: options.source ?? "stated",
        updated_at: now,
        expires_at: options.ttlDays
          ? new Date(Date.now() + options.ttlDays * 86_400_000).toISOString()
          : null,
      },
      ...items,
    ].slice(0, MAX_MEMORY_ITEMS);
    writeDemoMemory({ ...s, items });
    return true;
  }
  if (!(await hasRealSession())) return false;
  try {
    await rpc("ai_remember", {
      _topic: candidate.topic,
      _value: candidate.value,
      _source: options.source ?? "stated",
      _ttl_days: options.ttlDays ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function forgetItem(id: string): Promise<void> {
  if (isDemoSession()) {
    const s = demoState();
    writeDemoMemory({ ...s, items: s.items.filter((i) => i.id !== id) });
    return;
  }
  await rpc("ai_forget", { _id: id });
}

export async function forgetAll(): Promise<void> {
  if (isDemoSession()) {
    writeDemoMemory({ ...demoState(), items: [] });
    return;
  }
  await rpc("ai_forget_all");
}

export async function setMemoryEnabled(enabled: boolean): Promise<void> {
  if (isDemoSession()) {
    writeDemoMemory({ ...demoState(), enabled });
    return;
  }
  await rpc("ai_set_memory_enabled", { _on: enabled });
}

/** O cliente dispensou uma sugestão: a IA não insiste por um tempo. */
export const dismissAddon = (addon: AddonKey) =>
  remember(
    { topic: "dismissed_addon", value: addon },
    { ttlDays: DISMISS_DAYS, source: "feedback" },
  );

export const dismissedAddons = (items: readonly MemoryItem[]): AddonKey[] =>
  items.filter((i) => i.topic === "dismissed_addon").map((i) => i.value as AddonKey);

// ---------------------------------------------------------------------------
// Histórico de indicadores do painel (memória da IA analítica)
// ---------------------------------------------------------------------------
export interface Snapshot {
  taken_on: string;
  data: AnalyticsTotals;
}

/** No demo o "registro anterior" é fictício: 7 dias atrás, com números um pouco menores. */
function demoPrevious(current: AnalyticsTotals): Snapshot {
  const date = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  return {
    taken_on: date,
    data: {
      ...current,
      users: Math.max(0, current.users - 4),
      pendingEmail: current.pendingEmail + 2,
      revenue: Math.round(current.revenue * 0.82),
      fleetDown: Math.max(0, current.fleetDown - 1),
    },
  };
}

export async function lastSnapshot(current: AnalyticsTotals): Promise<Snapshot | null> {
  if (isDemoSession()) return readDemoSnapshot<Snapshot>() ?? demoPrevious(current);
  try {
    return await rpc<Snapshot | null>("ai_last_snapshot");
  } catch {
    return null;
  }
}

/** Registra os números de hoje para comparar da próxima vez. Só números. */
export async function saveSnapshot(totals: AnalyticsTotals): Promise<void> {
  if (isDemoSession()) return; // o demo não grava histórico novo
  try {
    await rpc("ai_save_snapshot", { _data: totals });
  } catch {
    // histórico é um extra
  }
}
