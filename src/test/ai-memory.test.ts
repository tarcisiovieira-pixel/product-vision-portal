import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock("@/lib/rpc", () => ({ rpc: rpcMock }));
vi.mock("@/lib/api-client", () => ({
  apiEnabled: () => false,
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

import type { ConsultContext, ConsultHangar, ConsultVehicle } from "@shared/consult";
import { suggestUpsells } from "@shared/upsell";
import {
  dismissAddon,
  dismissedAddons,
  forgetAll,
  forgetItem,
  lastSnapshot,
  readMemory,
  remember,
  setMemoryEnabled,
} from "@/lib/ai-memory";
import { askConsultant } from "@/lib/ai";
import { SEED_HANGARS, SEED_VEHICLES, SEED_WEATHER } from "@/lib/ares-seed-data";
import { startDemoSession } from "@/lib/session";

const ctx = (): ConsultContext => ({
  vehicles: SEED_VEHICLES as unknown as ConsultVehicle[],
  hangars: SEED_HANGARS as unknown as ConsultHangar[],
  storms: SEED_WEATHER as unknown as ConsultContext["storms"],
  license: "orbital",
  credits: 25000,
});

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
  startDemoSession();
});

describe("memória no demo (sandbox)", () => {
  it("começa ligada e vazia", async () => {
    expect(await readMemory()).toEqual({ enabled: true, items: [], available: true });
  });

  it("guarda, substitui valor único e apaga", async () => {
    await remember({ topic: "priority", value: "economy" });
    await remember({ topic: "priority", value: "comfort" });
    await remember({ topic: "party_size", value: "2" });
    const { items } = await readMemory();
    expect(items.filter((i) => i.topic === "priority").map((i) => i.value)).toEqual(["comfort"]);
    expect(items).toHaveLength(2);

    await forgetItem(items[0]!.id);
    expect((await readMemory()).items).toHaveLength(1);
    await forgetAll();
    expect((await readMemory()).items).toEqual([]);
  });

  it("desligada, não grava nem usa", async () => {
    await setMemoryEnabled(false);
    expect(await remember({ topic: "priority", value: "economy" })).toBe(false);
    expect((await readMemory()).items).toEqual([]);
  });

  it("recusa tópico desconhecido", async () => {
    expect(await remember({ topic: "senha" as never, value: "123" })).toBe(false);
  });

  it("dispensas acumulam, expiram e o upsell para de insistir (menos no obrigatório)", async () => {
    await dismissAddon("silica_insurance");
    await dismissAddon("extra_o2_tank");
    let items = (await readMemory()).items;
    expect(dismissedAddons(items).sort()).toEqual(["extra_o2_tank", "silica_insurance"]);

    const base = {
      vehicle: { ...(SEED_VEHICLES[0] as unknown as ConsultVehicle), dust_filter_pct: 10 },
      pickup: SEED_HANGARS[0] as unknown as ConsultHangar,
      dropoff: SEED_HANGARS[3] as unknown as ConsultHangar, // Acidalia: alerta de tempestade
      days: 2,
      addons: {},
      storms: [],
    };
    const before = suggestUpsells(base);
    expect(before.some((s) => s.addon === "silica_insurance")).toBe(true);
    const after = suggestUpsells({ ...base, dismissed: dismissedAddons(items) });
    expect(after.some((s) => s.addon === "silica_insurance")).toBe(false);
    expect(after.some((s) => s.addon === "storm_barrier_shield" && s.level === "required")).toBe(
      true,
    );

    // expiradas somem
    const raw = JSON.parse(localStorage.getItem("ares_demo_ai_memory")!);
    raw.items.forEach((i: { expires_at: string }) => (i.expires_at = "2020-01-01T00:00:00Z"));
    localStorage.setItem("ares_demo_ai_memory", JSON.stringify(raw));
    items = (await readMemory()).items;
    expect(items).toEqual([]);
  });
});

describe("consultoria com memória (demo)", () => {
  it("anota o que o usuário diz como hábito e usa na próxima consulta", async () => {
    const first = await askConsultant(
      "Eu sempre prefiro o mais barato e costumo viajar com 2 pessoas",
      ctx(),
    );
    expect(first.remembered?.map((r) => r.topic).sort()).toEqual(["party_size", "priority"]);

    const second = await askConsultant("preciso de um veículo", ctx());
    expect(second.needs).toMatchObject({ priority: "economy", passengers: 2 });
    expect(second.memoryUsed?.map((u) => u.topic).sort()).toEqual(["party_size", "priority"]);
  });

  it("pedido pontual não é anotado", async () => {
    const res = await askConsultant(
      "Somos 3 pessoas, de Olympus para Jezero, o mais barato",
      ctx(),
    );
    expect(res.remembered).toEqual([]);
    expect((await readMemory()).items).toEqual([]);
  });

  it("memória desligada: não aplica, não anota", async () => {
    await remember({ topic: "party_size", value: "2" });
    await setMemoryEnabled(false);
    const res = await askConsultant("Eu sempre prefiro o mais barato", ctx());
    expect(res.memoryEnabled).toBe(false);
    expect(res.memoryUsed).toEqual([]);
    expect(res.remembered).toEqual([]);
  });

  it("assunto fora do escopo não grava", async () => {
    const res = await askConsultant("Eu sempre prefiro futebol, o mais barato", ctx());
    expect(res.offTopic).toBe(true);
    expect((await readMemory()).items).toEqual([]);
  });

  it("o histórico de reservas orienta o hangar de saída", async () => {
    const rentals = [1, 2, 3].map((n) => ({
      vehicle_id: "v-cc-01",
      pickup_hangar_id: "h-gal-05",
      status: "completed",
      start_sol: n * 10,
      end_sol: n * 10 + 2,
    }));
    const res = await askConsultant("preciso de um veículo para 2 pessoas", ctx(), rentals);
    expect(res.needs.originId).toBe("h-gal-05");
    expect(res.memoryUsed?.some((u) => u.topic === "history")).toBe(true);
  });
});

describe("conta real", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sem sessão, não há memória disponível", async () => {
    expect((await readMemory()).available).toBe(false);
  });

  it("histórico do painel no demo é fictício e marcado pela data", async () => {
    startDemoSession();
    const totals = {
      users: 20,
      pendingEmail: 4,
      newUsers7d: 2,
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
    const prev = await lastSnapshot(totals);
    expect(prev!.data.users).toBe(16);
    expect(prev!.data.revenue).toBe(82000);
  });
});
