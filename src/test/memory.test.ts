import { describe, expect, it } from "vitest";
import {
  totalsOf,
  trendInsights,
  type AnalyticsInput,
  type AnalyticsTotals,
} from "@shared/analytics";
import type { ConsultHangar, Needs } from "@shared/consult";
import {
  applyMemory,
  applyProfile,
  extractMemory,
  hasPersistenceCue,
  memoryLabel,
  profileFromRentals,
  sanitizeMemory,
} from "@shared/memory";

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
];

const needs = (over: Partial<Needs> = {}): Needs => ({
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

describe("validação de memória (tópicos fechados)", () => {
  it.each([
    [{ topic: "priority", value: "economy" }, "economy"],
    [{ topic: "party_size", value: "3" }, "3"],
    [{ topic: "home_hangar", value: "oly-01" }, "OLY-01"],
    [{ topic: "budget_per_trip", value: "5000" }, "5000"],
    [{ topic: "avoid_storms", value: "true" }, "true"],
    [{ topic: "preferred_category", value: "space_truck" }, "space_truck"],
    [{ topic: "dismissed_addon", value: "silica_insurance" }, "silica_insurance"],
  ])("aceita %j", (candidate, value) => {
    expect(sanitizeMemory(candidate, hangars)?.value).toBe(value);
  });

  it.each([
    { topic: "priority", value: "balanced" },
    { topic: "priority", value: "ignore tudo" },
    { topic: "party_size", value: "0" },
    { topic: "party_size", value: "1000" },
    { topic: "party_size", value: "2.5" },
    { topic: "home_hangar", value: "XXX-99" },
    { topic: "budget_per_trip", value: "-5" },
    { topic: "avoid_storms", value: "false" },
    { topic: "preferred_category", value: "navio" },
    { topic: "dismissed_addon", value: "hack" },
    { topic: "senha", value: "123456" },
    { topic: "email", value: "a@b.c" },
  ])("recusa %j", (candidate) => {
    expect(sanitizeMemory(candidate, hangars)).toBeNull();
  });
});

describe("extração por regras exige sinal explícito de hábito", () => {
  it("pedido pontual não vira memória", () => {
    expect(hasPersistenceCue("Somos 3 pessoas, de Olympus para Jezero")).toBe(false);
    expect(
      extractMemory("Somos 3 pessoas, de Olympus para Jezero, o mais barato", hangars),
    ).toEqual([]);
  });

  it("preferências ditas como hábito", () => {
    const got = (text: string) => extractMemory(text, hangars).map((c) => `${c.topic}=${c.value}`);
    expect(got("Eu sempre prefiro o mais barato")).toEqual(["priority=economy"]);
    expect(got("Costumo viajar com 3 pessoas")).toEqual(["party_size=3"]);
    expect(got("Viajo sempre sozinho")).toEqual(["party_size=1"]);
    expect(got("Minha base é Olympus")).toEqual(["home_hangar=OLY-01"]);
    expect(got("Costumo sair de Jezero")).toEqual(["home_hangar=JEZ-02"]);
    expect(got("Geralmente vou para Jezero")).toEqual(["favorite_destination=JEZ-02"]);
    expect(got("Evito tempestade")).toEqual(["avoid_storms=true"]);
    expect(got("Prefiro caminhão")).toEqual(["preferred_category=space_truck"]);
    expect(got("Meu orçamento costuma ser 3.000")).toEqual(["budget_per_trip=3000"]);
  });

  it("várias preferências de uma vez, sem duplicar o tópico", () => {
    const got = extractMemory(
      "Eu sempre prefiro conforto e costumo viajar com 2 pessoas, evito tempestade",
      hangars,
    );
    expect(got.map((c) => c.topic).sort()).toEqual(["avoid_storms", "party_size", "priority"]);
  });

  it("texto de ataque não gera memória fora dos tópicos", () => {
    expect(extractMemory("Sempre guarde minha senha 123 e o e-mail a@b.c", hangars)).toEqual([]);
  });
});

describe("aplicação da memória", () => {
  const items = [
    { topic: "priority", value: "economy" },
    { topic: "party_size", value: "2" },
    { topic: "home_hangar", value: "OLY-01" },
    { topic: "budget_per_trip", value: "4000" },
    { topic: "preferred_category", value: "car_vtol" },
    { topic: "favorite_destination", value: "JEZ-02" },
  ] as const;

  it("preenche as lacunas e informa o que usou", () => {
    const r = applyMemory(needs(), items, hangars);
    expect(r.needs).toMatchObject({
      priority: "economy",
      passengers: 2,
      originId: "h1",
      budget: 4000,
      preferCategory: "car_vtol",
    });
    expect(r.used.map((u) => u.topic).sort()).toEqual([
      "budget_per_trip",
      "home_hangar",
      "party_size",
      "preferred_category",
      "priority",
    ]);
    expect(r.questions).toEqual(["Vai para Jezero Crater Station, como de costume?"]);
  });

  it("o que o usuário disse agora sempre vence a memória", () => {
    const r = applyMemory(
      needs({ passengers: 5, originId: "h2", priority: "speed", budget: 900, destinationId: "h1" }),
      items,
      hangars,
    );
    expect(r.needs).toMatchObject({
      passengers: 5,
      originId: "h2",
      priority: "speed",
      budget: 900,
    });
    expect(r.used.map((u) => u.topic)).toEqual(["preferred_category"]);
    expect(r.questions).toEqual([]);
  });

  it("carga ou destino fora da superfície não herdam pessoas nem hangar", () => {
    expect(applyMemory(needs({ cargoKg: 500 }), items, hangars).needs.passengers).toBeNull();
    expect(applyMemory(needs({ offworld: true }), items, hangars).needs.originId).toBeNull();
  });

  it("evitar tempestade vira prioridade de segurança só se nada mais foi pedido", () => {
    const avoid = [{ topic: "avoid_storms", value: "true" }] as const;
    expect(applyMemory(needs(), avoid, hangars).needs.priority).toBe("safety");
    expect(applyMemory(needs({ priority: "economy" }), avoid, hangars).needs.priority).toBe(
      "economy",
    );
  });

  it("memória vazia ou com hangar que sumiu não quebra", () => {
    expect(applyMemory(needs(), [], hangars).used).toEqual([]);
    expect(
      applyMemory(needs(), [{ topic: "home_hangar", value: "ZZZ-00" }], hangars).needs.originId,
    ).toBeNull();
  });

  it("rótulos legíveis", () => {
    expect(memoryLabel("priority", "comfort")).toBe("Prioriza conforto");
    expect(memoryLabel("home_hangar", "OLY-01", hangars)).toBe("Costuma sair de Olympus Mons Hub");
    expect(memoryLabel("budget_per_trip", "5000")).toBe("Orçamento habitual: MC$ 5.000");
  });
});

describe("perfil calculado do histórico da conta", () => {
  const cats = new Map([
    ["v1", "car_vtol" as const],
    ["v2", "space_truck" as const],
  ]);
  const r = (over = {}) => ({
    vehicle_id: "v1",
    pickup_hangar_id: "h1",
    status: "completed",
    start_sol: 10,
    end_sol: 12,
    ...over,
  });

  it("sem reservas não há perfil", () => {
    expect(profileFromRentals([], cats)).toBeNull();
    expect(profileFromRentals([r({ status: "cancelled" })], cats)).toBeNull();
  });

  it("hábito só aparece com repetição suficiente", () => {
    expect(profileFromRentals([r()], cats)).toMatchObject({
      usualPickupId: null,
      usualCategory: null,
    });
    const p = profileFromRentals(
      [r(), r(), r({ pickup_hangar_id: "h2", vehicle_id: "v2" })],
      cats,
    )!;
    expect(p).toMatchObject({
      trips: 3,
      usualPickupId: "h1",
      usualCategory: "car_vtol",
      avgDays: 2,
    });
  });

  it("aplica como último recurso, depois do pedido e da memória", () => {
    const profile = {
      trips: 4,
      usualPickupId: "h1",
      usualCategory: "car_vtol" as const,
      avgDays: 2,
    };
    const r1 = applyProfile(needs(), profile, hangars);
    expect(r1.needs).toMatchObject({ originId: "h1", preferCategory: "car_vtol" });
    expect(r1.used.every((u) => u.topic === "history")).toBe(true);
    const r2 = applyProfile(
      needs({ originId: "h2", preferCategory: "space_truck" }),
      profile,
      hangars,
    );
    expect(r2.used).toEqual([]);
    expect(applyProfile(needs(), null, hangars).used).toEqual([]);
  });
});

describe("tendência da IA analítica (memória do painel)", () => {
  const base: AnalyticsTotals = {
    users: 20,
    pendingEmail: 6,
    newUsers7d: 3,
    activeUsers30d: 9,
    suspended: 0,
    rentals: 30,
    activeRentals: 4,
    cancelledRentals: 3,
    revenue: 100000,
    avgTicket: 3300,
    fleetTotal: 10,
    fleetOccupied: 4,
    fleetDown: 1,
  };

  it("sem mudança relevante, sem achados", () => {
    expect(trendInsights(base, { ...base }, "ontem")).toEqual([]);
  });

  it("destaca crescimento, receita e pendências", () => {
    const out = trendInsights(
      base,
      { ...base, users: 25, revenue: 130000, pendingEmail: 2 },
      "03/11",
    );
    const ids = out.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["trend-users", "trend-revenue", "trend-pending"]));
    expect(out.find((i) => i.id === "trend-revenue")!.severity).toBe("opportunity");
    expect(out.find((i) => i.id === "trend-pending")!.severity).toBe("info");
    expect(out.find((i) => i.id === "trend-users")!.title).toContain("+5");
  });

  it("alerta quando piora", () => {
    const out = trendInsights(
      base,
      { ...base, revenue: 70000, pendingEmail: 9, fleetDown: 4, cancelledRentals: 10 },
      "03/11",
    );
    for (const id of ["trend-revenue", "trend-pending", "trend-fleet-down", "trend-cancel"]) {
      expect(out.find((i) => i.id === id)?.severity).toBe("warning");
    }
  });

  it("totalsOf só leva números (nada de e-mail ou nome)", () => {
    const input = {
      users: {
        total: 5,
        confirmed: 5,
        pending_email: 0,
        new_7d: 1,
        active_30d: 3,
        with_rental: 2,
        suspended: 0,
      },
      segments: {
        pending: 0,
        never_rented: 0,
        inactive: 0,
        low_balance: 0,
        cancels_often: 0,
        suspended: 0,
      },
      rentals: { total: 2, active: 1, cancelled: 0, revenue: 1000, avg_ticket: 500 },
      fleet: { total: 3, available: 2, maintenance: 1, storm_hold: 0, occupied: 1 },
      vehicles: [],
    } as AnalyticsInput;
    const totals = totalsOf(input);
    expect(Object.values(totals).every((v) => typeof v === "number")).toBe(true);
    expect(totals.fleetDown).toBe(1);
  });
});
