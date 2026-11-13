// Catálogo de modelos e especificações. Fonte única para o front, a API e as IAs.
// Sem dependências: roda no navegador, no Node e nos testes.

export type VehicleCategory = "car_vtol" | "space_truck" | "interplanetary_rocket";

export const MODEL_KEYS = [
  "cybercab_x2",
  "cybercab_sport",
  "apex_phantom",
  "valkyrie_gt",
  "ares_hauler",
  "starship_hopper",
] as const;

export type ModelKey = (typeof MODEL_KEYS)[number];

export interface ModelTemplate {
  key: ModelKey;
  label: string;
  category: VehicleCategory;
  /** Frase curta usada no formulário e nas recomendações. */
  tagline: string;
  defaults: {
    name: string;
    daily_rate_sol: number;
    seats: number;
    cargo_kg: number;
    range_km: number;
    description: string;
  };
}

/** Os seis modelos 3D que existem no app, com especificações de exemplo. */
export const MODEL_CATALOG: Record<ModelKey, ModelTemplate> = {
  cybercab_x2: {
    key: "cybercab_x2",
    label: "CyberCab VTOL X2",
    category: "car_vtol",
    tagline: "Carro voador pressurizado para trajetos entre domos",
    defaults: {
      name: "CyberCab VTOL X2",
      daily_rate_sol: 420,
      seats: 4,
      cargo_kg: 200,
      range_km: 800,
      description: "Carro voador pressurizado para 2 a 4 colonos entre domos habitacionais.",
    },
  },
  cybercab_sport: {
    key: "cybercab_sport",
    label: "CyberCab VTOL Sport",
    category: "car_vtol",
    tagline: "Leve e ágil, para quem tem pressa",
    defaults: {
      name: "CyberCab VTOL Sport",
      daily_rate_sol: 560,
      seats: 2,
      cargo_kg: 60,
      range_km: 650,
      description: "Versão esportiva do CyberCab: resposta rápida e peso reduzido.",
    },
  },
  apex_phantom: {
    key: "apex_phantom",
    label: "Apex Phantom Hyper-VTOL",
    category: "car_vtol",
    tagline: "Linha executiva VIP, maior autonomia",
    defaults: {
      name: "Apex Phantom Hyper-VTOL",
      daily_rate_sol: 890,
      seats: 4,
      cargo_kg: 120,
      range_km: 1200,
      description: "Chassi em cunha, cúpula fumê e a maior autonomia entre os VTOLs.",
    },
  },
  valkyrie_gt: {
    key: "valkyrie_gt",
    label: "Valkyrie Martian Roadster GT",
    category: "car_vtol",
    tagline: "Roadster de alto desempenho para dois",
    defaults: {
      name: "Valkyrie Martian Roadster GT",
      daily_rate_sol: 1250,
      seats: 2,
      cargo_kg: 40,
      range_km: 900,
      description: "Super esportivo de dois lugares, feito para travessias rápidas.",
    },
  },
  ares_hauler: {
    key: "ares_hauler",
    label: "Ares Heavy Truck",
    category: "space_truck",
    tagline: "Carga pesada e travessia de cânions",
    defaults: {
      name: "Ares Heavy Truck",
      daily_rate_sol: 1180,
      seats: 3,
      cargo_kg: 40000,
      range_km: 1500,
      description: "Blindado para carga pesada e expedições em cânions marcianos.",
    },
  },
  starship_hopper: {
    key: "starship_hopper",
    label: "Starship Hopper",
    category: "interplanetary_rocket",
    tagline: "Foguete interplanetário: Fobos, Lua e Terra",
    defaults: {
      name: "Starship Hopper",
      daily_rate_sol: 48000,
      seats: 100,
      cargo_kg: 100000,
      range_km: 54600000,
      description: "Classe Starship com alcance orbital e interplanetário.",
    },
  },
};

export const CATEGORY_LABEL: Record<VehicleCategory, string> = {
  car_vtol: "Carro voador VTOL",
  space_truck: "Caminhão espacial",
  interplanetary_rocket: "Foguete interplanetário",
};

export const isModelKey = (value: unknown): value is ModelKey =>
  typeof value === "string" && (MODEL_KEYS as readonly string[]).includes(value);

export const modelCategory = (key: ModelKey): VehicleCategory => MODEL_CATALOG[key].category;

/** Mesmas regras de nome que o banco aplica ao salvar. */
export const CALLSIGN_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
export const normalizeCallsign = (value: string): string => value.trim().toUpperCase();

export interface VehicleIdentity {
  model_key?: string | null | undefined;
  category: VehicleCategory;
  callsign?: string | null | undefined;
  name?: string | null | undefined;
}

/**
 * Descobre o modelo 3D de um veículo. Usa model_key quando existe; senão, deduz do
 * indicativo e do nome (é como os veículos criados antes do catálogo eram desenhados).
 */
export function inferModelKey(v: VehicleIdentity): ModelKey {
  if (isModelKey(v.model_key) && modelCategory(v.model_key) === v.category) return v.model_key;
  const ident = `${v.callsign ?? ""} ${v.name ?? ""}`.toLowerCase();
  if (ident.includes("apx") || ident.includes("apex") || ident.includes("phantom")) {
    return "apex_phantom";
  }
  if (ident.includes("valk") || ident.includes("vmt") || ident.includes("roadster")) {
    return "valkyrie_gt";
  }
  if (ident.includes("sport") || ident.includes("sp-03") || ident.includes("sp-")) {
    return "cybercab_sport";
  }
  if (v.category === "car_vtol") return "cybercab_x2";
  if (v.category === "space_truck") return "ares_hauler";
  return "starship_hopper";
}

export interface VehicleSpecs {
  seats: number;
  cargo_kg: number;
  range_km: number;
}

/** Especificações do veículo, ou as do modelo quando o banco ainda não as tem. */
export function specsOf(
  v: VehicleIdentity & {
    seats?: number | null | undefined;
    cargo_kg?: number | null | undefined;
    range_km?: number | null | undefined;
  },
): VehicleSpecs {
  const fallback = MODEL_CATALOG[inferModelKey(v)].defaults;
  return {
    seats: v.seats ?? fallback.seats,
    cargo_kg: v.cargo_kg ?? fallback.cargo_kg,
    range_km: v.range_km ?? fallback.range_km,
  };
}
