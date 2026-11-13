import {
  extractMemory,
  hasPersistenceCue,
  memoryLabel,
  profileFromRentals,
  sanitizeMemory,
  type ConsultContext,
  type CustomerProfile,
  type MemoryCandidate,
  type MemoryItem,
  type RentalLite,
} from "../../lib/shared.js";
import type { UserDb } from "../../lib/supabase.js";

export interface LoadedMemory {
  /** Falso se o usuário desligou a memória ou se o banco ainda não tem a migration. */
  enabled: boolean;
  items: MemoryItem[];
}

/** Lê a memória do usuário. Qualquer falha (ex.: migration ausente) vira "sem memória". */
export async function loadMemory(user: UserDb): Promise<LoadedMemory> {
  try {
    const raw = (await user.rpc("ai_get_memory", {})) as {
      enabled?: boolean;
      items?: MemoryItem[];
    } | null;
    if (!raw || raw.enabled !== true) return { enabled: false, items: [] };
    return { enabled: true, items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { enabled: false, items: [] };
  }
}

/** Perfil calculado do histórico real de reservas do usuário (RLS garante que são as dele). */
export async function loadProfile(
  user: UserDb,
  ctx: ConsultContext,
): Promise<CustomerProfile | null> {
  try {
    const rentals = (await user.list("rentals", "created_at")) as RentalLite[];
    const categories = new Map(ctx.vehicles.map((v) => [v.id, v.category]));
    return profileFromRentals(rentals, categories);
  } catch {
    return null;
  }
}

/**
 * Candidatos a memória: o que as regras acharam + o que o modelo sugeriu, mas só se o usuário
 * deu um sinal explícito de hábito ("sempre", "prefiro"...) e o valor passa na validação.
 */
export function memoryCandidates(
  message: string,
  fromModel: { topic: string; value: string }[],
  ctx: ConsultContext,
): MemoryCandidate[] {
  const out = new Map<string, MemoryCandidate>();
  for (const c of extractMemory(message, ctx.hangars)) out.set(c.topic, c);
  if (hasPersistenceCue(message)) {
    for (const raw of fromModel.slice(0, 6)) {
      const safe = sanitizeMemory(raw, ctx.hangars);
      if (safe && safe.topic !== "dismissed_addon" && !out.has(safe.topic))
        out.set(safe.topic, safe);
    }
  }
  return [...out.values()];
}

/** Grava e devolve o que de fato foi guardado. Falhas não derrubam a consulta. */
export async function persistMemory(
  user: UserDb,
  candidates: MemoryCandidate[],
  ctx: ConsultContext,
): Promise<{ topic: string; value: string; label: string }[]> {
  const saved: { topic: string; value: string; label: string }[] = [];
  for (const c of candidates) {
    try {
      await user.rpc("ai_remember", { _topic: c.topic, _value: c.value, _source: "stated" });
      saved.push({ ...c, label: memoryLabel(c.topic, c.value, ctx.hangars) });
    } catch {
      // memória é um extra: não impede a resposta
    }
  }
  return saved;
}
