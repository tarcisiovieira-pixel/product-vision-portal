import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  DEMO_PROFILE,
  SEED_HANGARS,
  SEED_MAINTENANCE_LOGS,
  SEED_RENTALS,
  SEED_VEHICLES,
  SEED_VEHICLE_SALES,
  SEED_WEATHER,
  SEED_FLIGHT_ROUTES,
  SEED_FLIGHT_TELEMETRY,
  type VehicleSaleItem,
  type FlightRouteItem,
  type FlightTelemetryLogItem,
} from "./ares-seed-data";

export type Vehicle = Tables<"vehicles">;
export type Hangar = Tables<"hangars">;
export type WeatherEvent = Tables<"weather_events">;
export type Profile = Tables<"profiles">;
export type Rental = Tables<"rentals">;
export type MaintenanceLog = Tables<"maintenance_logs">;
export type VehicleSale = Tables<"vehicle_sales">;
export type VehiclePurchase = Tables<"vehicle_purchases">;
export type FlightRoute = Tables<"flight_routes">;
export type FlightTelemetryLog = Tables<"flight_telemetry_logs">;
export type { VehicleSaleItem, FlightRouteItem, FlightTelemetryLogItem };

async function runWithFallback<T>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await p;
    if (error) {
      console.warn("Supabase query error, using local Martian dataset:", error.message);
      return fallback;
    }
    if (
      Array.isArray(data) &&
      data.length === 0 &&
      Array.isArray(fallback) &&
      fallback.length > 0
    ) {
      return fallback;
    }
    return (data ?? fallback) as T;
  } catch (err) {
    console.warn("Supabase fetch failed, using local Martian dataset:", err);
    return fallback;
  }
}

export const vehiclesQuery = queryOptions({
  queryKey: ["vehicles"],
  queryFn: () =>
    runWithFallback<Vehicle[]>(
      supabase.from("vehicles").select("*").order("category").order("callsign"),
      SEED_VEHICLES,
    ),
});

export const hangarsQuery = queryOptions({
  queryKey: ["hangars"],
  queryFn: () =>
    runWithFallback<Hangar[]>(supabase.from("hangars").select("*").order("name"), SEED_HANGARS),
});

export const weatherQuery = queryOptions({
  queryKey: ["weather"],
  queryFn: () =>
    runWithFallback<WeatherEvent[]>(
      supabase.from("weather_events").select("*").order("severity", { ascending: false }),
      SEED_WEATHER,
    ),
});

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async (): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
      if (!error && data) return data;
    } catch {
      // fallback to demo check
    }

    if (typeof window !== "undefined") {
      const demoRaw = localStorage.getItem("ares_demo_session");
      if (demoRaw) {
        try {
          return JSON.parse(demoRaw) as Profile;
        } catch {
          return DEMO_PROFILE;
        }
      }
    }
    return null;
  },
});

export const rentalsQuery = queryOptions({
  queryKey: ["rentals"],
  queryFn: async (): Promise<Rental[]> => {
    let localRentals: Rental[] = [];
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("ares_demo_rentals");
      if (stored) {
        try {
          localRentals = JSON.parse(stored);
        } catch {
          // ignore
        }
      }
    }
    const combinedFallback = [...localRentals, ...SEED_RENTALS];
    return runWithFallback<Rental[]>(
      supabase.from("rentals").select("*").order("created_at", { ascending: false }),
      combinedFallback,
    );
  },
});

export const maintenanceLogsQuery = queryOptions({
  queryKey: ["maintenance_logs"],
  queryFn: async (): Promise<MaintenanceLog[]> => {
    let localLogs: MaintenanceLog[] = [];
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("ares_local_maintenance_logs");
      if (stored) {
        try {
          localLogs = JSON.parse(stored);
        } catch {
          // ignore
        }
      }
    }
    return runWithFallback<MaintenanceLog[]>(
      supabase.from("maintenance_logs").select("*").order("created_at", { ascending: false }),
      [...localLogs, ...SEED_MAINTENANCE_LOGS],
    );
  },
});

export const vehicleSalesQuery = queryOptions({
  queryKey: ["vehicle_sales"],
  queryFn: async (): Promise<VehicleSaleItem[]> => {
    let localSales: VehicleSaleItem[] = [];
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("ares_marketplace_sales");
      if (stored) {
        try {
          localSales = JSON.parse(stored);
        } catch {
          // JSON local corrompido: segue com lista vazia.
        }
      }
    }

    try {
      const { data, error } = await supabase
        .from("vehicle_sales")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        return [...localSales, ...(data as VehicleSaleItem[])];
      }
    } catch (err) {
      console.warn("Supabase vehicle_sales fetch error, using local seed:", err);
    }

    return [...localSales, ...SEED_VEHICLE_SALES];
  },
});

export const flightRoutesQuery = queryOptions({
  queryKey: ["flight_routes"],
  queryFn: () =>
    runWithFallback<FlightRouteItem[]>(
      supabase.from("flight_routes").select("*").order("created_at", { ascending: false }),
      SEED_FLIGHT_ROUTES,
    ),
});

export const flightTelemetryQuery = (vehicleId?: string) =>
  queryOptions({
    queryKey: ["flight_telemetry", vehicleId ?? "all"],
    queryFn: async (): Promise<FlightTelemetryLogItem[]> => {
      if (!vehicleId) return SEED_FLIGHT_TELEMETRY;
      return SEED_FLIGHT_TELEMETRY.filter((log) => log.vehicle_id === vehicleId);
    },
  });

export const conditionLabel: Record<VehicleSaleItem["condition"], string> = {
  factory_new: "Zero KM (Fábrica Orbital)",
  certified_preowned: "Seminovo Certificado ARES",
  refurbished: "Recondicionado Classe A",
};

export const categoryLabel: Record<Vehicle["category"], string> = {
  car_vtol: "Carro Voador VTOL",
  space_truck: "Caminhão Espacial",
  interplanetary_rocket: "Foguete Interplanetário",
};

export const statusLabel: Record<Vehicle["status"], string> = {
  available: "Disponível",
  in_flight: "Em voo",
  maintenance: "Manutenção",
  storm_hold: "Retido por tempestade",
};

export const licenseLabel: Record<Profile["pilot_license"], string> = {
  atmospheric: "Atmosférico",
  heavy_cargo: "Carga Pesada",
  orbital: "Orbital",
};

export const MARS_RADIUS_KM = 3389.5;

/** Lat/lng in degrees → point on a sphere of radius r (three.js Y-up). */
export function latLngToVec(lat: number, lng: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const th = ((lng + 180) * Math.PI) / 180;
  return [-Math.sin(phi) * Math.cos(th) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(th) * r];
}

/** Calculate Great Circle distance on Mars in kilometers */
export function marsDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(MARS_RADIUS_KM * c);
}

/** Maintenance urgency 0–100 from wear signals. */
export function wearScore(
  v: Pick<Vehicle, "battery_pct" | "dust_filter_pct" | "o2_hours" | "category">,
) {
  const o2Target =
    v.category === "interplanetary_rocket" ? 900 : v.category === "space_truck" ? 120 : 40;
  const o2 = Math.min(100, (Number(v.o2_hours) / o2Target) * 100);
  return Math.round(100 - (v.battery_pct * 0.3 + v.dust_filter_pct * 0.45 + o2 * 0.25));
}

/** Validação de licença para aluguel */
export function isLicenseValidForCategory(
  userLicense: Profile["pilot_license"] | undefined,
  category: Vehicle["category"],
): boolean {
  if (!userLicense) return false;
  if (category === "interplanetary_rocket") return userLicense === "orbital";
  if (category === "space_truck") return userLicense === "heavy_cargo" || userLicense === "orbital";
  return true; // car_vtol aceita atmospheric, heavy_cargo e orbital
}

export function getRequiredLicense(category: Vehicle["category"]): string {
  if (category === "interplanetary_rocket") return "Orbital";
  if (category === "space_truck") return "Carga Pesada ou Orbital";
  return "Atmosférico";
}

/** Preços diários de opcionais espaciais (MC$ / sol) */
export const SPACE_ADDONS = {
  storm_barrier_shield: {
    label: "Barreira Anti-Tempestade & Escudo Iônico",
    rate: 220,
    desc: "Campo de força defletor contra vendavais e micro-meteoritos de rególito (Autoriza decolagem sob tempestades severas).",
  },
  silica_insurance: {
    label: "Seguro contra Tempestade de Sílica",
    rate: 120,
    desc: "Cobertura total contra erosão por rególito e saturação de turbinas.",
  },
  extra_o2_tank: {
    label: "Tanque Criogênico Extra de O₂",
    rate: 180,
    desc: "+120h de suporte de vida pressurizado certificado pela ARES.",
  },
  neural_autopilot_l5: {
    label: "Piloto Automático Neural Nível 5",
    rate: 350,
    desc: "Navegação por satélite orbital sem intervenção humana.",
  },
  extra_eva_suits: {
    label: "Kit de Trajes EVA Reforçados (por unidade)",
    rate: 100,
    desc: "Proteção contra radiação e choque térmico até −120°C.",
  },
} as const;

/** Serviços de Manutenção disponíveis */
export const MAINTENANCE_SERVICES: Record<
  string,
  {
    label: string;
    cost: number;
    desc: string;
    target: "dust" | "battery" | "heat" | "o2" | "thruster";
  }
> = {
  silica_clean: {
    label: "Limpeza Ultrassônica de Sílica",
    cost: 450,
    desc: "Desobstrui microporos do filtro e remove partículas abrasivas de rególito.",
    target: "dust",
  },
  cryo_recharge: {
    label: "Recarga Criogênica de Baterias",
    cost: 600,
    desc: "Células de grafeno-lítio pré-aquecidas a 100% de capacidade utilizável.",
    target: "battery",
  },
  heat_shield_repair: {
    label: "Reparo do Escudo Térmico Cerâmico",
    cost: 1200,
    desc: "Restauração de placas cerâmicas ablativas para reentrada atmosférica segura.",
    target: "heat",
  },
  o2_refill: {
    label: "Abastecimento Criogênico de O₂",
    cost: 350,
    desc: "Reposição de oxigênio medicinal comprimido para suporte à vida.",
    target: "o2",
  },
  thruster_calibration: {
    label: "Calibração dos Propulsores de Plasma",
    cost: 800,
    desc: "Alinhamento vetorial magnético e eliminação de cavitação de impulsores.",
    target: "thruster",
  },
};
