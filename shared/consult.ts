// IA de consultoria: entende o pedido do cliente e indica veículo, trajeto e adicionais.
//
// Motor determinístico. O modelo de linguagem (quando há chave) só ajuda a ler o texto
// livre e a escrever a resposta; quem escolhe veículos e calcula custos é este código,
// sobre o catálogo real. Assim a IA nunca recomenda algo que não existe nem que o
// cliente não pode reservar.
import { ADDON_CATALOG, type AddonKey } from "./addons.js";
import { inferModelKey, specsOf, type ModelKey, type VehicleCategory } from "./fleet.js";

export type Priority = "balanced" | "speed" | "economy" | "comfort" | "safety";
export type License = "atmospheric" | "heavy_cargo" | "orbital";

export interface ConsultVehicle {
  id: string;
  name: string;
  callsign: string;
  category: VehicleCategory;
  model_key?: string | null;
  daily_rate_sol: number;
  hangar_id: string | null;
  status: string;
  seats?: number | null;
  cargo_kg?: number | null;
  range_km?: number | null;
  battery_pct: number;
  dust_filter_pct: number;
}

export interface ConsultHangar {
  id: string;
  name: string;
  code: string;
  sector: string;
  lat: number;
  lng: number;
  storm_alert: boolean;
}

export interface ConsultStorm {
  name: string;
  severity: number;
  lat: number;
  lng: number;
  radius_km: number;
  active: boolean;
}

export interface ConsultContext {
  vehicles: ConsultVehicle[];
  hangars: ConsultHangar[];
  storms: ConsultStorm[];
  /** Habilitação do cliente; ausente = não filtra, só avisa. */
  license?: License | null;
  credits?: number | null;
}

/** O que o cliente quer, já estruturado. Vem do parser de regras ou do modelo. */
export interface Needs {
  passengers: number | null;
  cargoKg: number | null;
  days: number;
  /** Orçamento total em MC$. */
  budget: number | null;
  originId: string | null;
  destinationId: string | null;
  /** Destino fora da superfície (Lua, Fobos, Terra, órbita). */
  offworld: boolean;
  priority: Priority;
  luxury: boolean;
}

export interface RoutePlan {
  distanceKm: number;
  hours: number;
  stormsOnPath: { name: string; severity: number }[];
}

export interface Recommendation {
  vehicleId: string;
  score: number;
  pickupId: string | null;
  dropoffId: string | null;
  days: number;
  addons: AddonKey[];
  estimate: { rental: number; addons: number; total: number };
  route: RoutePlan | null;
  reasons: string[];
  warnings: string[];
}

export interface ConsultResult {
  needs: Needs;
  recommendations: Recommendation[];
  /** Perguntas que melhorariam a indicação. */
  missing: string[];
  /** Avisos gerais (ex.: nenhum veículo atende, tempestade na rota). */
  notes: string[];
}

export const MAX_DAYS = 30;
export const SPEED_KMH: Record<VehicleCategory, number> = {
  car_vtol: 320,
  space_truck: 110,
  interplanetary_rocket: 4000,
};

// ---------------------------------------------------------------------------
// Geografia
// ---------------------------------------------------------------------------
const MARS_RADIUS_KM = 3389.5;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(MARS_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Tempestades ativas que cruzam o trajeto (amostragem ao longo do caminho). */
export function stormsOnPath(a: ConsultHangar, b: ConsultHangar, storms: ConsultStorm[]) {
  const hits = new Map<string, number>();
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = a.lat + (b.lat - a.lat) * t;
    const lng = a.lng + (b.lng - a.lng) * t;
    for (const s of storms) {
      if (s.active && distanceKm(lat, lng, s.lat, s.lng) <= s.radius_km)
        hits.set(s.name, s.severity);
    }
  }
  return [...hits].map(([name, severity]) => ({ name, severity }));
}

export function planRoute(
  a: ConsultHangar,
  b: ConsultHangar,
  category: VehicleCategory,
  storms: ConsultStorm[],
): RoutePlan {
  const distance = distanceKm(a.lat, a.lng, b.lat, b.lng);
  return {
    distanceKm: distance,
    hours: Math.round((distance / SPEED_KMH[category]) * 10) / 10,
    stormsOnPath: stormsOnPath(a, b, storms),
  };
}

// ---------------------------------------------------------------------------
// Parser de pedido em português (regras). Também serve de reserva para o modelo.
// ---------------------------------------------------------------------------
const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const toNumber = (raw: string) => Number(raw.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));

interface Mention {
  hangar: ConsultHangar;
  index: number;
}

function mentions(text: string, hangars: ConsultHangar[]): Mention[] {
  const found: Mention[] = [];
  for (const hangar of hangars) {
    const names = new Set<string>([
      plain(hangar.code),
      plain(hangar.name),
      plain(hangar.name).split(" ")[0]!,
      plain(hangar.sector),
    ]);
    let best = -1;
    for (const name of names) {
      if (name.length < 4) continue;
      const i = text.indexOf(name);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) found.push({ hangar, index: best });
  }
  return found.sort((x, y) => x.index - y.index);
}

const ORIGIN_CUE = /(?:\bde|saindo de|partindo de|a partir de|origem)\s*$/;
const DEST_CUE = /(?:\bpara|\bate|\bao|\ba|\bpro|ir a|chegar em|chegar a|destino)\s*$/;

export function parseNeeds(input: string, hangars: ConsultHangar[]): Needs {
  const text = plain(input);
  const needs: Needs = {
    passengers: null,
    cargoKg: null,
    days: 1,
    budget: null,
    originId: null,
    destinationId: null,
    offworld: false,
    priority: "balanced",
    luxury: false,
  };

  // Pessoas
  const people = text.match(
    /(\d{1,3})\s*(?:pessoas?|passageiros?|adultos?|lugares|amigos|colegas|criancas|tripulantes|colonos)/,
  );
  if (people) needs.passengers = Number(people[1]);
  else if (/\bsozinh[oa]\b|\bso eu\b|\bapenas eu\b/.test(text)) needs.passengers = 1;
  else if (/\bcasal\b|\beu e (?:um|uma|meu|minha)\b|\bnos dois\b/.test(text)) needs.passengers = 2;
  else if (/\bfamilia\b/.test(text)) needs.passengers = 4;

  // Carga
  const cargo = text.match(/(\d+(?:[.,]\d+)?)\s*(toneladas?|ton\b|kg|quilos?)/);
  if (cargo) {
    const value = toNumber(cargo[1]!);
    needs.cargoKg = Math.round(/^t/.test(cargo[2]!) ? value * 1000 : value);
  } else if (/\bcarga\b|\bequipamentos?\b|\bmaterial\b|\bcontainer\b|\bsuprimentos\b/.test(text)) {
    needs.cargoKg = 500;
  }

  // Duração
  const days = text.match(/\b(\d{1,4})\s*(?:dias?|sols?|diarias?)/);
  if (days) needs.days = Number(days[1]);
  else if (/\buma semana\b|\b1 semana\b/.test(text)) needs.days = 7;
  else if (/\bfim de semana\b|\bfinal de semana\b/.test(text)) needs.days = 2;
  needs.days = Math.min(Math.max(needs.days, 1), MAX_DAYS);

  // Orçamento (total)
  const budget = text.match(
    /(?:ate|no maximo|maximo de|orcamento(?: de)?|budget(?: de)?|gastar)\s*(?:mc\$?\s*)?(\d[\d.,]*)(?!\s*(?:kg|toneladas?|dias?|sols?|pessoas?))/,
  );
  if (budget) needs.budget = Math.round(toNumber(budget[1]!));

  // Fora da superfície
  if (/\b(lua|fobos|deimos|terra|orbita|orbital|interplanetar\w*|earth|moon)\b/.test(text)) {
    needs.offworld = true;
  }

  // Prioridade
  if (/\bbarat\w*|economi\w*|custo[- ]beneficio|em conta|mais em conta/.test(text))
    needs.priority = "economy";
  else if (/\brapid\w*|urgente|o mais veloz|velocidade|pressa/.test(text)) needs.priority = "speed";
  else if (/\bseguranc\w*|segur[oa]\b|sem risco|tempestade/.test(text)) needs.priority = "safety";
  else if (/\bconfort\w*|luxo|luxuos\w*|vip|executiv\w*|premium/.test(text))
    needs.priority = "comfort";
  if (/\bluxo|luxuos\w*|vip|executiv\w*|premium|esportiv\w*/.test(text)) needs.luxury = true;

  // Origem e destino
  const found = mentions(text, hangars);
  for (const m of found) {
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    if (!needs.originId && ORIGIN_CUE.test(before)) needs.originId = m.hangar.id;
    else if (!needs.destinationId && DEST_CUE.test(before)) needs.destinationId = m.hangar.id;
  }
  for (const m of found) {
    if (m.hangar.id === needs.originId || m.hangar.id === needs.destinationId) continue;
    if (!needs.originId && found.length > 1) needs.originId = m.hangar.id;
    else if (!needs.destinationId) needs.destinationId = m.hangar.id;
    else if (!needs.originId) needs.originId = m.hangar.id;
  }
  if (needs.originId && needs.originId === needs.destinationId) needs.destinationId = null;

  return needs;
}

// ---------------------------------------------------------------------------
// Recomendação
// ---------------------------------------------------------------------------
const LUXURY_MODELS: ModelKey[] = ["apex_phantom", "valkyrie_gt", "cybercab_sport"];
const brl = (n: number) => `MC$ ${n.toLocaleString("pt-BR")}`;

function licenseAllows(license: License | null | undefined, category: VehicleCategory): boolean {
  if (!license) return true;
  if (category === "interplanetary_rocket") return license === "orbital";
  if (category === "space_truck") return license === "heavy_cargo" || license === "orbital";
  return true;
}

function clampNeeds(n: Needs): Needs {
  return {
    ...n,
    passengers: n.passengers === null ? null : Math.min(Math.max(Math.round(n.passengers), 1), 500),
    cargoKg: n.cargoKg === null ? null : Math.min(Math.max(Math.round(n.cargoKg), 0), 10_000_000),
    days: Math.min(Math.max(Math.round(n.days) || 1, 1), MAX_DAYS),
    budget:
      n.budget === null || !(n.budget > 0) ? null : Math.min(Math.round(n.budget), 100_000_000),
  };
}

export function recommend(rawNeeds: Needs, ctx: ConsultContext, limit = 3): ConsultResult {
  const needs = clampNeeds(rawNeeds);
  const hangars = new Map(ctx.hangars.map((h) => [h.id, h]));
  const origin = needs.originId ? (hangars.get(needs.originId) ?? null) : null;
  const dest = needs.destinationId ? (hangars.get(needs.destinationId) ?? null) : null;
  const distance = origin && dest ? distanceKm(origin.lat, origin.lng, dest.lat, dest.lng) : null;

  const notes: string[] = [];
  const missing: string[] = [];
  if (needs.passengers === null && !needs.cargoKg)
    missing.push("Quantas pessoas (ou quanta carga) vão no veículo?");
  if (!origin) missing.push("De qual hangar você quer sair?");
  if (!dest && !needs.offworld) missing.push("Para onde vai?");
  if (needs.budget === null) missing.push("Tem um orçamento máximo?");

  const wantsRocket = needs.offworld || (needs.passengers ?? 0) > 6;
  const wantsTruck = !wantsRocket && (needs.cargoKg ?? 0) > 400;

  type Candidate = { v: ConsultVehicle; rec: Recommendation };
  const rejected = new Map<string, number>();
  const reject = (why: string) => rejected.set(why, (rejected.get(why) ?? 0) + 1);
  const candidates: Candidate[] = [];

  for (const v of ctx.vehicles) {
    if (v.status !== "available") {
      reject("indisponíveis agora (em voo, manutenção ou tempestade)");
      continue;
    }
    const specs = specsOf({ ...v, model_key: v.model_key });
    const model = inferModelKey({ ...v, model_key: v.model_key });
    if (!licenseAllows(ctx.license, v.category)) {
      reject("exigem uma habilitação que você não tem");
      continue;
    }
    if (needs.passengers !== null && specs.seats < needs.passengers) {
      reject("com poucos assentos");
      continue;
    }
    if (needs.cargoKg !== null && specs.cargo_kg < needs.cargoKg) {
      reject("sem capacidade de carga");
      continue;
    }
    if (wantsRocket && v.category !== "interplanetary_rocket") {
      reject("sem alcance para esse destino");
      continue;
    }
    if (!wantsRocket && v.category === "interplanetary_rocket") {
      reject("grandes demais para uma viagem na superfície");
      continue;
    }
    if (origin && v.hangar_id !== origin.id) {
      reject("estacionados em outro hangar");
      continue;
    }
    if (distance !== null && specs.range_km < distance) {
      reject("com autonomia menor que o trajeto");
      continue;
    }

    const pickup = origin ?? (v.hangar_id ? (hangars.get(v.hangar_id) ?? null) : null);
    const route =
      pickup && dest && !wantsRocket ? planRoute(pickup, dest, v.category, ctx.storms) : null;
    const reasons: string[] = [];
    const warnings: string[] = [];
    const addons: AddonKey[] = [];

    // Regra do banco: tempestade em um dos hangares da rota exige a barreira.
    const stormAtHangar = [pickup, dest].some((h) => h?.storm_alert);
    if (stormAtHangar) {
      addons.push("storm_barrier_shield");
      warnings.push(
        "Há alerta de tempestade em um dos hangares: a Barreira Anti-Tempestade é obrigatória e já entrou no custo.",
      );
    }
    const severe = route?.stormsOnPath.filter((s) => s.severity >= 3) ?? [];
    if (severe.length > 0) {
      if (!addons.includes("storm_barrier_shield")) addons.push("storm_barrier_shield");
      warnings.push(
        `O trajeto cruza ${severe.map((s) => s.name).join(", ")}. Considere outro horário ou outro destino.`,
      );
    } else if (route && route.stormsOnPath.length > 0) {
      warnings.push(
        `Tempestade leve no caminho (${route.stormsOnPath.map((s) => s.name).join(", ")}).`,
      );
    }
    if (route && route.hours > 3 && v.category === "car_vtol") {
      addons.push("neural_autopilot_l5");
      reasons.push(`Viagem de ${route.hours} h: o Piloto Automático Neural reduz o cansaço.`);
    }
    if (route && v.category === "space_truck" && route.hours > 8) addons.push("extra_o2_tank");

    const rentalCost = Number(v.daily_rate_sol) * needs.days;
    const addonCost = addons.reduce((sum, key) => sum + ADDON_CATALOG[key].rate, 0) * needs.days;
    const total = rentalCost + addonCost;

    // Pontuação 0-100
    let score = 60;
    const seatSlack = needs.passengers === null ? 0 : specs.seats - needs.passengers;
    if (needs.passengers !== null) {
      score += seatSlack <= 1 ? 10 : seatSlack <= 3 ? 5 : -Math.min(15, seatSlack * 2);
      if (seatSlack >= 0 && seatSlack <= 1)
        reasons.push(
          `Comporta ${needs.passengers} ${needs.passengers === 1 ? "pessoa" : "pessoas"} sem desperdiçar espaço.`,
        );
    }
    if (needs.cargoKg)
      reasons.push(
        `Leva ${needs.cargoKg.toLocaleString("pt-BR")} kg (capacidade ${specs.cargo_kg.toLocaleString("pt-BR")} kg).`,
      );
    if (wantsTruck && v.category === "space_truck") score += 15;
    if (wantsRocket && v.category === "interplanetary_rocket") score += 15;

    if (needs.budget !== null) {
      if (total > needs.budget) {
        score -= 40;
        warnings.push(`Custo estimado ${brl(total)}, acima do orçamento de ${brl(needs.budget)}.`);
      } else {
        score += 8;
        reasons.push(`Cabe no orçamento: ${brl(total)} de ${brl(needs.budget)}.`);
      }
    }
    if (ctx.credits != null && total > ctx.credits) {
      score -= 25;
      warnings.push(`Seu saldo (${brl(ctx.credits)}) não cobre o custo estimado.`);
    }

    const wear = 100 - (v.battery_pct * 0.5 + v.dust_filter_pct * 0.5);
    const cheapness = Math.max(0, 1 - Number(v.daily_rate_sol) / 2000);
    switch (needs.priority) {
      case "economy":
        score += Math.round(cheapness * 20);
        if (cheapness > 0.5) reasons.push("Uma das diárias mais baixas entre as opções.");
        break;
      case "speed":
        score += Math.round((SPEED_KMH[v.category] / 400) * 8);
        if (route) reasons.push(`Chega em cerca de ${route.hours} h.`);
        break;
      case "safety":
        score += Math.round((100 - wear) / 10);
        if (severe.length === 0) score += 6;
        reasons.push(`Bateria ${v.battery_pct}% e filtros ${v.dust_filter_pct}%.`);
        break;
      case "comfort":
        if (LUXURY_MODELS.includes(model)) {
          score += 12;
          reasons.push("Linha premium, com mais conforto e acabamento.");
        }
        break;
      default:
        score += Math.round(cheapness * 6) + Math.round((100 - wear) / 20);
    }
    if (needs.luxury && LUXURY_MODELS.includes(model)) score += 10;
    if (v.battery_pct < 30) {
      score -= 10;
      warnings.push("Bateria baixa: peça para recarregar antes de sair.");
    }
    if (route)
      reasons.push(
        `${route.distanceKm.toLocaleString("pt-BR")} km, dentro da autonomia de ${specs.range_km.toLocaleString("pt-BR")} km.`,
      );

    candidates.push({
      v,
      rec: {
        vehicleId: v.id,
        score: Math.max(0, Math.min(100, Math.round(score))),
        pickupId: pickup?.id ?? v.hangar_id,
        dropoffId: dest?.id ?? null,
        days: needs.days,
        addons,
        estimate: { rental: rentalCost, addons: addonCost, total },
        route,
        reasons,
        warnings,
      },
    });
  }

  candidates.sort(
    (a, b) =>
      b.rec.score - a.rec.score ||
      a.rec.estimate.total - b.rec.estimate.total ||
      a.v.id.localeCompare(b.v.id),
  );
  const recommendations = candidates.slice(0, limit).map((c) => c.rec);

  if (recommendations.length === 0) {
    const why = [...rejected]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([text, n]) => `${n} ${text}`);
    notes.push(
      why.length > 0
        ? `Nenhum veículo atende ao pedido. Descartados: ${why.join("; ")}.`
        : "Nenhum veículo atende ao pedido.",
    );
  }
  if (ctx.license == null) notes.push("Entre na sua conta para eu considerar a sua habilitação.");
  return { needs, recommendations, missing, notes };
}
