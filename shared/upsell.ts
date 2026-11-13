// IA de upsell: sugere adicionais e alternativas durante a reserva, só com base em evidências.
//
// Regras de honestidade: cada sugestão cita o fato que a motivou, mostra o custo exato,
// nunca aparece sem motivo, nunca empurra o que o cliente já escolheu, e o que o banco
// exige de qualquer jeito (barreira em hangar com alerta) é marcado como obrigatório,
// em vez de vendido como opcional.
import { ADDON_CATALOG, type AddonKey } from "./addons.js";
import {
  hoursLabel,
  planRoute,
  type ConsultHangar,
  type ConsultStorm,
  type ConsultVehicle,
} from "./consult.js";
import { specsOf } from "./fleet.js";

export interface UpsellDraft {
  vehicle: ConsultVehicle & { o2_hours?: number | null };
  pickup: ConsultHangar | null;
  dropoff: ConsultHangar | null;
  days: number;
  addons: Partial<Record<AddonKey, boolean | number>>;
  storms: ConsultStorm[];
  /** Outros veículos do mesmo hangar, para sugerir uma troca. */
  alternatives?: ConsultVehicle[];
  credits?: number | null;
  /** Adicionais que o cliente já dispensou (memória): não insistimos, salvo o que é obrigatório. */
  dismissed?: readonly AddonKey[];
}

export type UpsellLevel = "required" | "recommended" | "info";

export interface UpsellSuggestion {
  id: string;
  level: UpsellLevel;
  title: string;
  /** O fato que motivou a sugestão. */
  evidence: string;
  addon?: AddonKey;
  /** Trocar de veículo, quando a sugestão é uma alternativa. */
  vehicleId?: string;
  /** Custo adicional por sol e no total da reserva (0 para quem não custa mais). */
  extraPerSol: number;
  extraTotal: number;
  affordable: boolean;
}

const brl = (n: number) => `MC$ ${n.toLocaleString("pt-BR")}`;
const has = (draft: UpsellDraft, key: AddonKey) => Boolean(draft.addons[key]);

export function suggestUpsells(draft: UpsellDraft): UpsellSuggestion[] {
  const { vehicle, pickup, dropoff, days, storms } = draft;
  const out: UpsellSuggestion[] = [];
  const route =
    pickup && dropoff && pickup.id !== dropoff.id
      ? planRoute(pickup, dropoff, vehicle.category, storms)
      : null;
  const currentExtras = (Object.keys(ADDON_CATALOG) as AddonKey[]).reduce(
    (sum, key) => sum + (has(draft, key) ? ADDON_CATALOG[key].rate : 0),
    0,
  );
  const budgetLeft =
    draft.credits == null
      ? Number.POSITIVE_INFINITY
      : draft.credits - (Number(vehicle.daily_rate_sol) + currentExtras) * days;

  const addAddon = (key: AddonKey, level: UpsellLevel, title: string, evidence: string) => {
    if (has(draft, key)) return;
    const extraPerSol = ADDON_CATALOG[key].rate;
    const extraTotal = extraPerSol * days;
    out.push({
      id: `addon:${key}`,
      level,
      title,
      evidence,
      addon: key,
      extraPerSol,
      extraTotal,
      affordable: extraTotal <= budgetLeft,
    });
  };

  const alert = [pickup, dropoff].find((h) => h?.storm_alert);
  if (alert) {
    addAddon(
      "storm_barrier_shield",
      "required",
      "Barreira Anti-Tempestade",
      `${alert.name} está com alerta de tempestade. Sem a barreira, a decolagem não é autorizada.`,
    );
  }

  const severe = route?.stormsOnPath.filter((s) => s.severity >= 3) ?? [];
  if (severe.length > 0 && !alert) {
    addAddon(
      "storm_barrier_shield",
      "recommended",
      "Barreira Anti-Tempestade",
      `O trajeto cruza ${severe.map((s) => `${s.name} (nível ${s.severity})`).join(", ")}.`,
    );
  }
  const mild = route?.stormsOnPath.filter((s) => s.severity < 3) ?? [];
  if (mild.length > 0 && severe.length === 0 && !has(draft, "silica_insurance")) {
    addAddon(
      "silica_insurance",
      "info",
      "Seguro contra Tempestade de Sílica",
      `Há tempestade leve no caminho (${mild.map((s) => s.name).join(", ")}).`,
    );
  }
  if (vehicle.dust_filter_pct < 40) {
    addAddon(
      "silica_insurance",
      "recommended",
      "Seguro contra Tempestade de Sílica",
      `O filtro de poeira deste veículo está em ${vehicle.dust_filter_pct}%.`,
    );
  }
  if (route && vehicle.category === "car_vtol" && route.hours > 3) {
    addAddon(
      "neural_autopilot_l5",
      "info",
      "Piloto Automático Neural",
      `Viagem de cerca de ${hoursLabel(route.hours)} h: o piloto automático evita a condução contínua.`,
    );
  }
  if (route && vehicle.category === "space_truck" && route.hours > 8) {
    addAddon(
      "extra_o2_tank",
      "recommended",
      "Tanque Extra de O₂",
      `Viagem de cerca de ${hoursLabel(route.hours)} h em caminhão: margem extra de suporte de vida.`,
    );
  }
  const o2 = vehicle.o2_hours;
  if (o2 != null && vehicle.category === "space_truck" && o2 < 60 && days >= 2) {
    addAddon(
      "extra_o2_tank",
      "recommended",
      "Tanque Extra de O₂",
      `O veículo tem ${o2} h de O₂ e a reserva dura ${days} sóis.`,
    );
  }
  if (vehicle.category === "interplanetary_rocket" && !draft.addons.extra_eva_suits) {
    out.push({
      id: "addon:extra_eva_suits",
      level: "info",
      title: "Kit de Trajes EVA Reforçados",
      evidence: "Viagens interplanetárias expõem a tripulação a radiação e choque térmico.",
      addon: "extra_eva_suits",
      extraPerSol: ADDON_CATALOG.extra_eva_suits.rate,
      extraTotal: ADDON_CATALOG.extra_eva_suits.rate * days,
      affordable: ADDON_CATALOG.extra_eva_suits.rate * days <= budgetLeft,
    });
  }

  // Alternativa de veículo: só quando o atual não alcança o destino com folga.
  if (route && draft.alternatives?.length) {
    const own = specsOf(vehicle).range_km;
    if (own < route.distanceKm * 1.15) {
      const better = draft.alternatives
        .filter(
          (v) => v.id !== vehicle.id && v.status === "available" && v.category === vehicle.category,
        )
        .map((v) => ({ v, range: specsOf(v).range_km }))
        .filter(({ range }) => range >= route.distanceKm * 1.15)
        .sort((a, b) => Number(a.v.daily_rate_sol) - Number(b.v.daily_rate_sol))[0];
      if (better) {
        const extraPerSol = Number(better.v.daily_rate_sol) - Number(vehicle.daily_rate_sol);
        out.push({
          id: `vehicle:${better.v.id}`,
          level: "recommended",
          title: `Trocar por ${better.v.name} (${better.v.callsign})`,
          evidence: `${vehicle.callsign} tem ${own.toLocaleString("pt-BR")} km de autonomia para um trajeto de ${route.distanceKm.toLocaleString("pt-BR")} km, sem margem de segurança. ${better.v.callsign} chega com folga.`,
          vehicleId: better.v.id,
          extraPerSol,
          extraTotal: extraPerSol * days,
          affordable: extraPerSol * days <= budgetLeft,
        });
      }
    }
  }
  // Duas regras podem pedir o mesmo adicional: fica a mais forte.
  const order: Record<UpsellLevel, number> = { required: 0, recommended: 1, info: 2 };
  const byId = new Map<string, UpsellSuggestion>();
  for (const s of out) {
    const prev = byId.get(s.id);
    if (!prev || order[s.level] < order[prev.level]) byId.set(s.id, s);
  }
  const dismissed = draft.dismissed ?? [];
  return [...byId.values()]
    .filter((s) => s.level === "required" || !s.addon || !dismissed.includes(s.addon))
    .sort((a, b) => order[a.level] - order[b.level])
    .slice(0, 4);
}

export const upsellSummary = (s: UpsellSuggestion) =>
  s.extraPerSol === 0
    ? "sem custo extra"
    : `+${brl(s.extraPerSol)}/sol (${brl(s.extraTotal)} no total)`;
