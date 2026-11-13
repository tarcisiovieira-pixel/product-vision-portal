import { describe, expect, it } from "vitest";
import { analyze, type AnalyticsInput } from "@shared/analytics";
import type { ConsultHangar, ConsultVehicle } from "@shared/consult";
import { suggestUpsells, type UpsellDraft } from "@shared/upsell";

const hangar = (over: Partial<ConsultHangar>): ConsultHangar => ({
  id: "h1",
  name: "Olympus Mons Hub",
  code: "OLY-01",
  sector: "Tharsis",
  lat: 18.65,
  lng: -133.8,
  storm_alert: false,
  ...over,
});
const jezero = hangar({ id: "h2", name: "Jezero Crater Station", lat: 18.38, lng: 77.58 });

const car = (over: Partial<ConsultVehicle> = {}): ConsultVehicle => ({
  id: "v1",
  name: "CyberCab VTOL X2",
  callsign: "CC-1",
  category: "car_vtol",
  model_key: "cybercab_x2",
  daily_rate_sol: 420,
  hangar_id: "h1",
  status: "available",
  seats: 4,
  cargo_kg: 200,
  range_km: 9000,
  battery_pct: 90,
  dust_filter_pct: 90,
  ...over,
});

const draft = (over: Partial<UpsellDraft> = {}): UpsellDraft => ({
  vehicle: car(),
  pickup: hangar({}),
  dropoff: jezero,
  days: 2,
  addons: {},
  storms: [],
  credits: 50_000,
  ...over,
});

describe("upsell", () => {
  it("não sugere nada sem motivo", () => {
    const s = suggestUpsells(
      draft({ pickup: hangar({}), dropoff: hangar({ id: "h3", lat: 19, lng: -133 }) }),
    );
    expect(s).toEqual([]);
  });

  it("hangar com alerta: barreira é obrigatória, com o custo exato", () => {
    const [first] = suggestUpsells(
      draft({ dropoff: hangar({ id: "h4", storm_alert: true, lat: 46, lng: -22 }) }),
    );
    expect(first).toMatchObject({
      level: "required",
      addon: "storm_barrier_shield",
      extraPerSol: 220,
      extraTotal: 440,
    });
    expect(first!.evidence).toMatch(/alerta de tempestade/);
  });

  it("não repete o que o cliente já escolheu", () => {
    const s = suggestUpsells(
      draft({
        dropoff: hangar({ id: "h4", storm_alert: true }),
        addons: { storm_barrier_shield: true },
      }),
    );
    expect(s.find((x) => x.addon === "storm_barrier_shield")).toBeUndefined();
  });

  it("tempestade severa no caminho recomenda a barreira, citando a tempestade", () => {
    const storm = {
      name: "Tempestade X",
      severity: 4,
      lat: 51.1,
      lng: 151.7,
      radius_km: 900,
      active: true,
    };
    const s = suggestUpsells(draft({ storms: [storm] }));
    const barrier = s.find((x) => x.addon === "storm_barrier_shield");
    expect(barrier?.level).toBe("recommended");
    expect(barrier?.evidence).toContain("Tempestade X");
  });

  it("tempestade inativa é ignorada", () => {
    const storm = {
      name: "Velha",
      severity: 5,
      lat: 51.1,
      lng: 151.7,
      radius_km: 900,
      active: false,
    };
    expect(
      suggestUpsells(draft({ storms: [storm] })).find((x) => x.addon === "storm_barrier_shield"),
    ).toBeUndefined();
  });

  it("filtro de poeira baixo sugere o seguro de sílica", () => {
    const s = suggestUpsells(draft({ vehicle: car({ dust_filter_pct: 20 }), dropoff: null }));
    expect(s[0]).toMatchObject({ addon: "silica_insurance", level: "recommended" });
    expect(s[0]!.evidence).toContain("20%");
  });

  it("viagem longa de carro sugere piloto automático (informativo)", () => {
    const s = suggestUpsells(draft());
    expect(s.find((x) => x.addon === "neural_autopilot_l5")?.level).toBe("info");
  });

  it("marca como não acessível o que estoura o saldo", () => {
    const s = suggestUpsells(
      draft({ credits: 900, dropoff: hangar({ id: "h4", storm_alert: true }) }),
    );
    expect(s[0]!.affordable).toBe(false);
  });

  it("sugere trocar de veículo só quando falta autonomia, e o mais barato que serve", () => {
    const s = suggestUpsells(
      draft({
        vehicle: car({ range_km: 3000 }),
        alternatives: [
          car({ id: "caro", callsign: "CC-9", daily_rate_sol: 900, range_km: 12000 }),
          car({ id: "bom", callsign: "CC-5", daily_rate_sol: 500, range_km: 12000 }),
          car({ id: "ocupado", callsign: "CC-7", status: "maintenance", range_km: 12000 }),
        ],
      }),
    );
    const swap = s.find((x) => x.vehicleId);
    expect(swap?.vehicleId).toBe("bom");
    expect(swap?.extraPerSol).toBe(80);
  });

  it("com autonomia de sobra não sugere troca", () => {
    const s = suggestUpsells(draft({ alternatives: [car({ id: "x", daily_rate_sol: 500 })] }));
    expect(s.find((x) => x.vehicleId)).toBeUndefined();
  });

  it("no máximo 4 sugestões, as obrigatórias primeiro, sem ids repetidos", () => {
    const storm = { name: "T", severity: 4, lat: 51.5, lng: 151.5, radius_km: 900, active: true };
    const s = suggestUpsells(
      draft({
        vehicle: car({ dust_filter_pct: 10 }),
        dropoff: hangar({ id: "h4", storm_alert: true, lat: 18.4, lng: 77 }),
        storms: [storm],
      }),
    );
    expect(s.length).toBeLessThanOrEqual(4);
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
    expect(s[0]!.level).toBe("required");
  });
});

const base = (over: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  users: {
    total: 20,
    confirmed: 18,
    pending_email: 2,
    new_7d: 3,
    active_30d: 10,
    with_rental: 8,
    suspended: 0,
  },
  segments: {
    pending: 2,
    never_rented: 2,
    inactive: 0,
    low_balance: 0,
    cancels_often: 0,
    suspended: 0,
  },
  rentals: { total: 20, active: 4, cancelled: 2, revenue: 100000, avg_ticket: 5000 },
  fleet: { total: 10, available: 6, maintenance: 1, storm_hold: 0, occupied: 4 },
  vehicles: [
    {
      callsign: "A-1",
      name: "A",
      daily_rate_sol: 400,
      status: "available",
      rentals_total: 5,
      rentals_active: 1,
      revenue: 30000,
      deleted_at: null,
    },
    {
      callsign: "B-1",
      name: "B",
      daily_rate_sol: 400,
      status: "available",
      rentals_total: 5,
      rentals_active: 1,
      revenue: 30000,
      deleted_at: null,
    },
    {
      callsign: "C-1",
      name: "C",
      daily_rate_sol: 400,
      status: "available",
      rentals_total: 5,
      rentals_active: 1,
      revenue: 40000,
      deleted_at: null,
    },
  ],
  ...over,
});

describe("analítica", () => {
  it("cenário saudável não inventa problemas", () => {
    const out = analyze(base());
    expect(out.map((i) => i.id)).toEqual(["all-good"]);
  });

  it("sem usuários, só informa", () => {
    const out = analyze(
      base({
        users: {
          total: 0,
          confirmed: 0,
          pending_email: 0,
          new_7d: 0,
          active_30d: 0,
          with_rental: 0,
          suspended: 0,
        },
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("empty");
  });

  it("detecta e-mails pendentes em excesso e aponta o segmento", () => {
    const out = analyze(
      base({
        users: {
          total: 20,
          confirmed: 14,
          pending_email: 6,
          new_7d: 3,
          active_30d: 10,
          with_rental: 8,
          suspended: 0,
        },
      }),
    );
    const i = out.find((x) => x.id === "pending-email");
    expect(i?.action).toMatchObject({ tab: "users", segment: "pending" });
    expect(i?.detail).toContain("6 de 20");
  });

  it("frota parada é alerta e vem primeiro", () => {
    const out = analyze(
      base({ fleet: { total: 10, available: 5, maintenance: 3, storm_hold: 0, occupied: 2 } }),
    );
    expect(out[0]).toMatchObject({ id: "fleet-down", severity: "alert" });
  });

  it("ocupação baixa e alta viram oportunidades", () => {
    expect(
      analyze(
        base({ fleet: { total: 10, available: 9, maintenance: 0, storm_hold: 0, occupied: 1 } }),
      ).some((i) => i.id === "low-occupancy"),
    ).toBe(true);
    expect(
      analyze(
        base({ fleet: { total: 10, available: 1, maintenance: 0, storm_hold: 0, occupied: 9 } }),
      ).some((i) => i.id === "high-occupancy"),
    ).toBe(true);
  });

  it("concentração de receita", () => {
    const out = analyze(
      base({
        vehicles: [
          {
            callsign: "TOP",
            name: "T",
            daily_rate_sol: 1,
            status: "available",
            rentals_total: 9,
            rentals_active: 0,
            revenue: 90000,
            deleted_at: null,
          },
          {
            callsign: "B",
            name: "B",
            daily_rate_sol: 1,
            status: "available",
            rentals_total: 1,
            rentals_active: 0,
            revenue: 5000,
            deleted_at: null,
          },
          {
            callsign: "C",
            name: "C",
            daily_rate_sol: 1,
            status: "available",
            rentals_total: 1,
            rentals_active: 0,
            revenue: 5000,
            deleted_at: null,
          },
        ],
      }),
    );
    expect(out.find((i) => i.id === "revenue-concentration")?.detail).toContain("TOP");
  });

  it("ignora veículos arquivados e cita os que nunca foram reservados", () => {
    const out = analyze(
      base({
        vehicles: [
          ...base().vehicles,
          {
            callsign: "NOVO",
            name: "N",
            daily_rate_sol: 1,
            status: "available",
            rentals_total: 0,
            rentals_active: 0,
            revenue: 0,
            deleted_at: null,
          },
          {
            callsign: "VELHO",
            name: "V",
            daily_rate_sol: 1,
            status: "available",
            rentals_total: 0,
            rentals_active: 0,
            revenue: 0,
            deleted_at: "2026-01-01",
          },
        ],
      }),
    );
    const idle = out.find((i) => i.id === "idle-vehicles");
    expect(idle?.detail).toContain("NOVO");
    expect(idle?.detail).not.toContain("VELHO");
  });

  it("nunca expõe e-mails nos textos", () => {
    const out = analyze(
      base({
        segments: {
          pending: 5,
          never_rented: 9,
          inactive: 3,
          low_balance: 4,
          cancels_often: 2,
          suspended: 1,
        },
        users: {
          total: 20,
          confirmed: 14,
          pending_email: 6,
          new_7d: 0,
          active_30d: 5,
          with_rental: 8,
          suspended: 1,
        },
      }),
    );
    expect(JSON.stringify(out)).not.toMatch(/@/);
  });
});
