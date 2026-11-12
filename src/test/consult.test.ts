import { describe, expect, it } from "vitest";
import {
  parseNeeds,
  planRoute,
  recommend,
  type ConsultContext,
  type ConsultHangar,
  type ConsultVehicle,
  type Needs,
} from "@shared/consult";
import { SEED_HANGARS, SEED_VEHICLES, SEED_WEATHER } from "@/lib/ares-seed-data";

const hangars: ConsultHangar[] = [
  {
    id: "h1",
    name: "Olympus Mons Hub",
    code: "OLY-01",
    sector: "Tharsis",
    lat: 18.65,
    lng: -133.8,
    storm_alert: false,
  },
  {
    id: "h2",
    name: "Jezero Crater Station",
    code: "JEZ-02",
    sector: "Isidis",
    lat: 18.38,
    lng: 77.58,
    storm_alert: false,
  },
  {
    id: "h3",
    name: "Valles Marineris Dock",
    code: "VAL-03",
    sector: "Coprates",
    lat: -8,
    lng: -70,
    storm_alert: false,
  },
  {
    id: "h4",
    name: "Acidalia Outpost",
    code: "ACI-04",
    sector: "Acidalia Planitia",
    lat: 46.7,
    lng: -22,
    storm_alert: true,
  },
];

const car = (over: Partial<ConsultVehicle>): ConsultVehicle => ({
  id: "v",
  name: "CyberCab VTOL X2",
  callsign: "CC-1",
  category: "car_vtol",
  model_key: "cybercab_x2",
  daily_rate_sol: 420,
  hangar_id: "h1",
  status: "available",
  seats: 4,
  cargo_kg: 200,
  range_km: 800,
  battery_pct: 90,
  dust_filter_pct: 90,
  ...over,
});

const ctx = (vehicles: ConsultVehicle[], extra: Partial<ConsultContext> = {}): ConsultContext => ({
  vehicles,
  hangars,
  storms: [],
  license: "orbital",
  credits: 50_000,
  ...extra,
});

const needs = (over: Partial<Needs>): Needs => ({
  passengers: null,
  cargoKg: null,
  days: 1,
  budget: null,
  originId: null,
  destinationId: null,
  offworld: false,
  priority: "balanced",
  luxury: false,
  ...over,
});

describe("parser de pedido em português", () => {
  it("entende pessoas, origem, destino, dias e orçamento", () => {
    const n = parseNeeds(
      "Somos 3 pessoas, saindo de Olympus para Jezero por 4 dias, até 5000 MC$",
      hangars,
    );
    expect(n).toMatchObject({
      passengers: 3,
      originId: "h1",
      destinationId: "h2",
      days: 4,
      budget: 5000,
    });
  });

  it("aceita acentos e maiúsculas", () => {
    const n = parseNeeds("PRECISO IR DE VALLES ATÉ ACIDÁLIA", hangars);
    expect(n.originId).toBe("h3");
    expect(n.destinationId).toBe("h4");
  });

  it("converte toneladas e reconhece carga sem número", () => {
    expect(parseNeeds("transportar 2 toneladas", hangars).cargoKg).toBe(2000);
    expect(parseNeeds("levar 350 kg de material", hangars).cargoKg).toBe(350);
    expect(parseNeeds("preciso levar equipamentos", hangars).cargoKg).toBe(500);
  });

  it("casal, sozinho e família", () => {
    expect(parseNeeds("viagem de casal", hangars).passengers).toBe(2);
    expect(parseNeeds("vou sozinho", hangars).passengers).toBe(1);
    expect(parseNeeds("viagem em família", hangars).passengers).toBe(4);
  });

  it("prioridades e destino fora da superfície", () => {
    expect(parseNeeds("o mais barato possível", hangars).priority).toBe("economy");
    expect(parseNeeds("algo rápido, tenho pressa", hangars).priority).toBe("speed");
    expect(parseNeeds("quero luxo", hangars)).toMatchObject({ priority: "comfort", luxury: true });
    expect(parseNeeds("quero ir para a Lua", hangars).offworld).toBe(true);
  });

  it("limita a duração e não confunde número solto com orçamento", () => {
    expect(parseNeeds("por 400 dias", hangars).days).toBe(30);
    expect(parseNeeds("3 pessoas por 2 dias", hangars).budget).toBeNull();
  });

  it("texto vazio ou sem sentido não quebra", () => {
    expect(parseNeeds("", hangars)).toMatchObject({ passengers: null, days: 1 });
    expect(parseNeeds("asdf qwer ###", hangars).originId).toBeNull();
  });

  it("um único hangar sem preposição vira destino", () => {
    expect(parseNeeds("quero Jezero", hangars)).toMatchObject({
      destinationId: "h2",
      originId: null,
    });
  });
});

describe("recomendação", () => {
  it("só indica disponíveis, do hangar de origem e com assentos suficientes", () => {
    const result = recommend(
      needs({ passengers: 4, originId: "h1", destinationId: "h2" }),
      ctx([
        car({ id: "ok", range_km: 9000 }),
        car({ id: "pequeno", seats: 2, range_km: 9000 }),
        car({ id: "ocupado", status: "in_flight", range_km: 9000 }),
        car({ id: "outro-hangar", hangar_id: "h2", range_km: 9000 }),
      ]),
    );
    expect(result.recommendations.map((r) => r.vehicleId)).toEqual(["ok"]);
  });

  it("descarta quem não tem autonomia para o trajeto", () => {
    const result = recommend(
      needs({ originId: "h1", destinationId: "h2" }),
      ctx([car({ id: "curto", range_km: 500 }), car({ id: "longo", range_km: 9000 })]),
    );
    expect(result.recommendations.map((r) => r.vehicleId)).toEqual(["longo"]);
  });

  it("respeita a habilitação", () => {
    const truck = car({
      id: "truck",
      category: "space_truck",
      model_key: "ares_hauler",
      cargo_kg: 40000,
      seats: 3,
    });
    const ok = recommend(needs({ cargoKg: 2000 }), ctx([truck], { license: "heavy_cargo" }));
    expect(ok.recommendations).toHaveLength(1);
    const no = recommend(needs({ cargoKg: 2000 }), ctx([truck], { license: "atmospheric" }));
    expect(no.recommendations).toHaveLength(0);
    expect(no.notes.join(" ")).toMatch(/habilitação/);
  });

  it("carga pesada prefere caminhão", () => {
    const truck = car({
      id: "truck",
      category: "space_truck",
      model_key: "ares_hauler",
      cargo_kg: 40000,
      seats: 3,
      daily_rate_sol: 1180,
    });
    const result = recommend(
      needs({ cargoKg: 2000 }),
      ctx([car({ id: "x2", cargo_kg: 3000 }), truck]),
    );
    expect(result.recommendations[0]!.vehicleId).toBe("truck");
  });

  it("hangar com alerta de tempestade inclui a barreira no custo (regra do banco)", () => {
    const result = recommend(
      needs({ originId: "h1", destinationId: "h4" }),
      ctx([car({ id: "a", range_km: 9000 })]),
    );
    const rec = result.recommendations[0]!;
    expect(rec.addons).toContain("storm_barrier_shield");
    expect(rec.estimate.addons).toBeGreaterThanOrEqual(220);
    expect(rec.estimate.total).toBe(rec.estimate.rental + rec.estimate.addons);
    expect(rec.warnings.join(" ")).toMatch(/obrigatória/);
  });

  it("avisa de tempestade que cruza o trajeto", () => {
    const storm = {
      name: "Tempestade Teste",
      severity: 4,
      lat: 18.5,
      lng: -30,
      radius_km: 900,
      active: true,
    };
    const result = recommend(
      needs({ originId: "h1", destinationId: "h2" }),
      ctx([car({ id: "a", range_km: 9000 })], { storms: [storm] }),
    );
    expect(result.recommendations[0]!.route?.stormsOnPath[0]?.name).toBe("Tempestade Teste");
    expect(result.recommendations[0]!.addons).toContain("storm_barrier_shield");
  });

  it("orçamento: quem estoura perde para quem cabe", () => {
    const result = recommend(
      needs({ budget: 1000, days: 2 }),
      ctx([car({ id: "caro", daily_rate_sol: 900 }), car({ id: "barato", daily_rate_sol: 300 })]),
    );
    expect(result.recommendations[0]!.vehicleId).toBe("barato");
    expect(result.recommendations[1]!.warnings.join(" ")).toMatch(/acima do orçamento/);
  });

  it("saldo insuficiente gera aviso", () => {
    const result = recommend(needs({}), ctx([car({})], { credits: 100 }));
    expect(result.recommendations[0]!.warnings.join(" ")).toMatch(/saldo/i);
  });

  it("destino fora da superfície indica foguete e nunca carro", () => {
    const rocket = car({
      id: "foguete",
      category: "interplanetary_rocket",
      model_key: "starship_hopper",
      seats: 100,
      cargo_kg: 100000,
      range_km: 54_600_000,
      daily_rate_sol: 48000,
    });
    const result = recommend(
      needs({ offworld: true, passengers: 2 }),
      ctx([car({ id: "x2" }), rocket]),
    );
    expect(result.recommendations.map((r) => r.vehicleId)).toEqual(["foguete"]);
  });

  it("sem candidatos explica por quê", () => {
    const result = recommend(needs({ passengers: 50 }), ctx([car({})]));
    expect(result.recommendations).toHaveLength(0);
    expect(result.notes[0]).toMatch(/Nenhum veículo/);
  });

  it("pergunta o que falta", () => {
    expect(recommend(needs({}), ctx([car({})])).missing.length).toBeGreaterThanOrEqual(3);
  });

  it("entradas absurdas são limitadas e a ordem é estável", () => {
    const result = recommend(
      needs({ days: 9999, passengers: 1, budget: -5 }),
      ctx([car({ id: "b" }), car({ id: "a" })]),
    );
    expect(result.needs.days).toBe(30);
    expect(result.needs.budget).toBeNull();
    expect(result.recommendations.map((r) => r.vehicleId)).toEqual(["a", "b"]);
  });

  it("limita a quantidade de indicações", () => {
    const many = Array.from({ length: 8 }, (_, i) => car({ id: `v${i}` }));
    expect(recommend(needs({}), ctx(many)).recommendations).toHaveLength(3);
  });
});

describe("rota", () => {
  it("distância e tempo coerentes", () => {
    const r = planRoute(hangars[0]!, hangars[1]!, "car_vtol", []);
    expect(r.distanceKm).toBeGreaterThan(1000);
    expect(r.hours).toBeCloseTo(r.distanceKm / 320, 0);
  });
});

describe("com os dados de exemplo do app", () => {
  it("só indica veículos que existem no catálogo", () => {
    const h = SEED_HANGARS as unknown as ConsultHangar[];
    const result = recommend(
      parseNeeds("Somos 3 pessoas, de Olympus para Jezero, 2 dias, o mais barato", h),
      {
        vehicles: SEED_VEHICLES as unknown as ConsultVehicle[],
        hangars: h,
        storms: SEED_WEATHER as unknown as ConsultContext["storms"],
        license: "orbital",
        credits: 25000,
      },
    );
    const ids = new Set(SEED_VEHICLES.map((v) => v.id));
    for (const r of result.recommendations) expect(ids.has(r.vehicleId)).toBe(true);
  });
});
