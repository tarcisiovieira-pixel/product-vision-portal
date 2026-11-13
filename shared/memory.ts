// Memória persistente das IAs.
//
// Regras de ouro, pensadas para privacidade:
// - Tópicos FECHADOS e valores validados: a memória nunca guarda texto livre, nome, e-mail
//   nem nada que o usuário não tenha dito como preferência duradoura.
// - Só grava quando há um sinal explícito ("sempre", "prefiro", "costumo"...).
// - Tudo o que a IA usou da memória aparece para o usuário, que pode apagar item por item,
//   apagar tudo ou desligar a memória.
import { ADDON_CATALOG } from "./addons.js";
import type { ConsultHangar, Needs, Priority } from "./consult.js";
import type { VehicleCategory } from "./fleet.js";

export const MEMORY_TOPICS = [
  "priority",
  "party_size",
  "home_hangar",
  "favorite_destination",
  "budget_per_trip",
  "avoid_storms",
  "preferred_category",
  "dismissed_addon",
] as const;
export type MemoryTopic = (typeof MEMORY_TOPICS)[number];

export type MemorySource = "stated" | "inferred" | "feedback";

export interface MemoryItem {
  id: string;
  topic: MemoryTopic;
  value: string;
  source: MemorySource;
  updated_at: string;
  expires_at: string | null;
}

export interface MemoryCandidate {
  topic: MemoryTopic;
  value: string;
}

export interface MemoryUse {
  topic: MemoryTopic | "history";
  label: string;
}

/** Quanto tempo uma sugestão dispensada fica "quieta". */
export const DISMISS_DAYS = 30;
export const MAX_MEMORY_ITEMS = 40;

const PRIORITIES: Priority[] = ["balanced", "speed", "economy", "comfort", "safety"];
const CATEGORIES: VehicleCategory[] = ["car_vtol", "space_truck", "interplanetary_rocket"];

const PRIORITY_LABEL: Record<Priority, string> = {
  balanced: "equilíbrio",
  speed: "rapidez",
  economy: "economia",
  comfort: "conforto",
  safety: "segurança",
};
const CATEGORY_LABEL_PT: Record<VehicleCategory, string> = {
  car_vtol: "carro voador",
  space_truck: "caminhão espacial",
  interplanetary_rocket: "foguete",
};

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const hangarByCode = (hangars: readonly ConsultHangar[], code: string) =>
  hangars.find((h) => h.code.toLowerCase() === code.trim().toLowerCase());

/** Valida um candidato vindo de regras ou do modelo. Devolve null se não for seguro guardar. */
export function sanitizeMemory(
  candidate: { topic: string; value: string },
  hangars: readonly ConsultHangar[],
): MemoryCandidate | null {
  const value = String(candidate.value ?? "").trim();
  switch (candidate.topic) {
    case "priority":
      return PRIORITIES.includes(value as Priority) && value !== "balanced"
        ? { topic: "priority", value }
        : null;
    case "party_size": {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= 500
        ? { topic: "party_size", value: String(n) }
        : null;
    }
    case "home_hangar":
    case "favorite_destination": {
      const h = hangarByCode(hangars, value);
      return h ? { topic: candidate.topic, value: h.code } : null;
    }
    case "budget_per_trip": {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= 100_000_000
        ? { topic: "budget_per_trip", value: String(n) }
        : null;
    }
    case "avoid_storms":
      return value === "true" ? { topic: "avoid_storms", value } : null;
    case "preferred_category":
      return CATEGORIES.includes(value as VehicleCategory)
        ? { topic: "preferred_category", value }
        : null;
    case "dismissed_addon":
      return value in ADDON_CATALOG ? { topic: "dismissed_addon", value } : null;
    default:
      return null;
  }
}

/** O usuário falou de um hábito ou preferência duradoura, e não só de uma viagem pontual? */
const CUE =
  /\b(sempre|prefiro|costumo|costuma|normalmente|geralmente|de preferencia|minha base|minha preferencia|evito|nao gosto|odeio|fujo de|moro)\b/;
export const hasPersistenceCue = (message: string) => CUE.test(plain(message));

/** Primeiro hangar citado depois de um ponto do texto. */
function hangarAfter(text: string, from: number, hangars: readonly ConsultHangar[]) {
  let best: { code: string; index: number } | null = null;
  for (const h of hangars) {
    const names = [plain(h.code), plain(h.name), plain(h.name).split(" ")[0]!, plain(h.sector)];
    for (const name of names) {
      if (name.length < 4) continue;
      const i = text.indexOf(name, from);
      if (i >= 0 && (!best || i < best.index)) best = { code: h.code, index: i };
    }
  }
  return best?.code ?? null;
}

/** Extrai preferências duradoras ditas de forma explícita, por regras. */
export function extractMemory(
  message: string,
  hangars: readonly ConsultHangar[],
): MemoryCandidate[] {
  const text = plain(message);
  if (!CUE.test(text)) return [];
  const out: MemoryCandidate[] = [];
  const add = (topic: string, value: string) => {
    const safe = sanitizeMemory({ topic, value }, hangars);
    if (safe && !out.some((o) => o.topic === safe.topic)) out.push(safe);
  };

  const prio = text.match(
    /\b(?:sempre|prefiro|costumo|normalmente|geralmente|de preferencia|gosto de)\b[^.!?]{0,40}?\b(barat\w*|economi\w*|rapid\w*|seguranc\w*|segur[oa]\b|confort\w*|luxo\w*)/,
  );
  if (prio) {
    const w = prio[1]!;
    add(
      "priority",
      /^(barat|economi)/.test(w)
        ? "economy"
        : /^rapid/.test(w)
          ? "speed"
          : /^segur/.test(w)
            ? "safety"
            : "comfort",
    );
  }

  const party =
    text.match(/\b(?:sempre|costumo|normalmente|geralmente)\b[^.!?]{0,30}?(\d{1,3})\s*pessoas/) ??
    text.match(/\bsomos sempre (\d{1,3})\b/);
  if (party) add("party_size", party[1]!);
  else if (/\b(?:sempre|costumo|normalmente|geralmente)\b[^.!?]{0,25}\bsozinh[oa]\b/.test(text)) {
    add("party_size", "1");
  } else if (/\b(?:sempre|costumo|normalmente|geralmente)\b[^.!?]{0,25}\bcasal\b/.test(text)) {
    add("party_size", "2");
  }

  const home = text.match(
    /\b(?:minha base (?:e|fica em)|saio sempre de|costumo sair de|parto sempre de|geralmente saio de|moro (?:em|no|na|perto de))\b/,
  );
  if (home) {
    const code = hangarAfter(text, (home.index ?? 0) + home[0].length, hangars);
    if (code) add("home_hangar", code);
  }

  const dest = text.match(
    /\b(?:sempre vou (?:para|a|ao)|costumo ir (?:para|a|ao)|geralmente vou (?:para|a|ao))\b/,
  );
  if (dest) {
    const code = hangarAfter(text, (dest.index ?? 0) + dest[0].length, hangars);
    if (code) add("favorite_destination", code);
  }

  const budget = text.match(
    /\b(?:meu orcamento (?:costuma ser|e de|normal e)|costumo gastar(?: ate)?)\s*(?:mc\$?\s*)?(\d[\d.]*)/,
  );
  if (budget) add("budget_per_trip", budget[1]!.replace(/\./g, ""));

  if (/\b(?:evito|nao gosto de|odeio|fujo de)\b[^.!?]{0,20}\btempestade/.test(text)) {
    add("avoid_storms", "true");
  }

  const cat = text.match(
    /\b(?:prefiro|gosto de|costumo usar)\b[^.!?]{0,15}?\b(carro\w*|vtol|caminha\w*|foguete\w*)/,
  );
  if (cat) {
    const w = cat[1]!;
    add(
      "preferred_category",
      /^(carro|vtol)/.test(w)
        ? "car_vtol"
        : /^caminha/.test(w)
          ? "space_truck"
          : "interplanetary_rocket",
    );
  }
  return out;
}

export function memoryLabel(
  topic: MemoryTopic,
  value: string,
  hangars: readonly ConsultHangar[] = [],
): string {
  const hangar = () => hangarByCode(hangars, value)?.name ?? value;
  switch (topic) {
    case "priority":
      return `Prioriza ${PRIORITY_LABEL[value as Priority] ?? value}`;
    case "party_size":
      return `Costuma viajar com ${value} ${value === "1" ? "pessoa" : "pessoas"}`;
    case "home_hangar":
      return `Costuma sair de ${hangar()}`;
    case "favorite_destination":
      return `Destino frequente: ${hangar()}`;
    case "budget_per_trip":
      return `Orçamento habitual: MC$ ${Number(value).toLocaleString("pt-BR")}`;
    case "avoid_storms":
      return "Evita rotas com tempestade";
    case "preferred_category":
      return `Prefere ${CATEGORY_LABEL_PT[value as VehicleCategory] ?? value}`;
    case "dismissed_addon":
      return `Dispensou a sugestão: ${ADDON_CATALOG[value as keyof typeof ADDON_CATALOG]?.label ?? value}`;
  }
}

// ---------------------------------------------------------------------------
// Aplicação da memória e do histórico da conta ao pedido
// ---------------------------------------------------------------------------
export interface AppliedMemory {
  needs: Needs;
  /** O que influenciou a resposta, para mostrar ao usuário. */
  used: MemoryUse[];
  /** Perguntas que a memória sugere (ex.: "Vai para Jezero, como de costume?"). */
  questions: string[];
}

/** A memória só preenche o que o pedido atual deixou em branco: o que o usuário disse agora sempre vence. */
export function applyMemory(
  needs: Needs,
  items: readonly Pick<MemoryItem, "topic" | "value">[],
  hangars: readonly ConsultHangar[],
): AppliedMemory {
  const next: Needs = { ...needs };
  const used: MemoryUse[] = [];
  const questions: string[] = [];
  const get = (topic: MemoryTopic) => items.find((i) => i.topic === topic)?.value;
  const mark = (topic: MemoryTopic, value: string) =>
    used.push({ topic, label: memoryLabel(topic, value, hangars) });

  const priority = get("priority");
  if (priority && next.priority === "balanced" && PRIORITIES.includes(priority as Priority)) {
    next.priority = priority as Priority;
    mark("priority", priority);
  }
  if (get("avoid_storms") === "true" && next.priority === "balanced") {
    next.priority = "safety";
    mark("avoid_storms", "true");
  }
  const party = Number(get("party_size"));
  if (get("party_size") && next.passengers === null && !next.cargoKg && party >= 1) {
    next.passengers = party;
    mark("party_size", String(party));
  }
  const home = get("home_hangar");
  const homeHangar = home ? hangarByCode(hangars, home) : undefined;
  if (homeHangar && !next.originId && !next.offworld) {
    next.originId = homeHangar.id;
    mark("home_hangar", homeHangar.code);
  }
  const budget = Number(get("budget_per_trip"));
  if (get("budget_per_trip") && next.budget === null && budget > 0) {
    next.budget = budget;
    mark("budget_per_trip", String(budget));
  }
  const category = get("preferred_category");
  if (category && CATEGORIES.includes(category as VehicleCategory) && !next.preferCategory) {
    next.preferCategory = category as VehicleCategory;
    mark("preferred_category", category);
  }
  const fav = get("favorite_destination");
  const favHangar = fav ? hangarByCode(hangars, fav) : undefined;
  if (favHangar && !next.destinationId && !next.offworld) {
    questions.push(`Vai para ${favHangar.name}, como de costume?`);
  }
  return { needs: next, used, questions };
}

export interface RentalLite {
  vehicle_id: string;
  pickup_hangar_id: string;
  status: string;
  start_sol: number;
  end_sol: number;
}

export interface CustomerProfile {
  trips: number;
  usualPickupId: string | null;
  usualCategory: VehicleCategory | null;
  avgDays: number;
}

const mostCommon = <T>(values: T[], minShare = 0.5, minCount = 2): T | null => {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return top !== null && n >= minCount && n / values.length >= minShare ? top : null;
};

/** Perfil calculado do histórico real da conta (reservas), sem guardar nada novo. */
export function profileFromRentals(
  rentals: readonly RentalLite[],
  vehicleCategory: ReadonlyMap<string, VehicleCategory>,
): CustomerProfile | null {
  const done = rentals.filter((r) => r.status !== "cancelled");
  if (done.length === 0) return null;
  const cats = done
    .map((r) => vehicleCategory.get(r.vehicle_id))
    .filter((c): c is VehicleCategory => Boolean(c));
  const days = done.map((r) => Math.max(1, r.end_sol - r.start_sol));
  return {
    trips: done.length,
    usualPickupId: mostCommon(done.map((r) => r.pickup_hangar_id)),
    usualCategory: mostCommon(cats),
    avgDays: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
  };
}

/** Usa o histórico para preencher lacunas que nem o pedido nem a memória preencheram. */
export function applyProfile(
  needs: Needs,
  profile: CustomerProfile | null,
  hangars: readonly ConsultHangar[],
): { needs: Needs; used: MemoryUse[] } {
  const next: Needs = { ...needs };
  const used: MemoryUse[] = [];
  if (!profile) return { needs: next, used };
  const pickup = hangars.find((h) => h.id === profile.usualPickupId);
  if (pickup && !next.originId && !next.offworld) {
    next.originId = pickup.id;
    used.push({ topic: "history", label: `Pelo seu histórico: costuma sair de ${pickup.name}` });
  }
  if (profile.usualCategory && !next.preferCategory) {
    next.preferCategory = profile.usualCategory;
    used.push({
      topic: "history",
      label: `Pelo seu histórico: costuma alugar ${CATEGORY_LABEL_PT[profile.usualCategory]}`,
    });
  }
  return { needs: next, used };
}

/** Resumo do perfil, só com agregados, para dar contexto ao modelo de linguagem. */
export function profileForModel(
  profile: CustomerProfile | null,
  hangars: readonly ConsultHangar[],
) {
  if (!profile) return null;
  return {
    reservasConcluidas: profile.trips,
    hangarHabitual: hangars.find((h) => h.id === profile.usualPickupId)?.name ?? null,
    categoriaHabitual: profile.usualCategory ? CATEGORY_LABEL_PT[profile.usualCategory] : null,
    duracaoMediaEmSois: profile.avgDays,
  };
}
