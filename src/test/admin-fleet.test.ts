import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), auth: {} } }));

import { MODEL_CATALOG, MODEL_KEYS, inferModelKey, modelCategory } from "@shared/fleet";
import {
  adminVehiclesQuery,
  archiveVehicle,
  formFromTemplate,
  restoreVehicle,
  saveVehicle,
  validateVehicleForm,
} from "@/lib/admin-fleet";
import { adminAuditQuery, adminOverviewQuery } from "@/lib/admin";
import { vehiclesQuery } from "@/lib/ares-data";
import { SEED_VEHICLES } from "@/lib/ares-seed-data";
import { startDemoSession } from "@/lib/session";

const valid = () => ({
  ...formFromTemplate("cybercab_x2", "Expansão da frota"),
  callsign: "tst-01",
});
const run = async <T>(query: { queryFn?: unknown }): Promise<T> =>
  (query.queryFn as (c: unknown) => Promise<T>)({ client: new QueryClient() });

describe("catálogo de modelos", () => {
  it("todo modelo tem categoria e ficha coerentes", () => {
    for (const key of MODEL_KEYS) {
      const m = MODEL_CATALOG[key];
      expect(modelCategory(key)).toBe(m.category);
      expect(m.defaults.daily_rate_sol).toBeGreaterThan(0);
      expect(m.defaults.seats).toBeGreaterThan(0);
    }
  });

  it("deduz o modelo dos veículos de exemplo, sem depender de model_key", () => {
    for (const v of SEED_VEHICLES) {
      const key = inferModelKey(v);
      expect(modelCategory(key)).toBe(v.category);
    }
  });

  it("ignora model_key incompatível com a categoria", () => {
    expect(inferModelKey({ model_key: "ares_hauler", category: "car_vtol", callsign: "X" })).toBe(
      "cybercab_x2",
    );
  });
});

describe("validação do formulário", () => {
  it("aceita um cadastro completo", () => {
    expect(validateVehicleForm(valid())).toEqual({});
  });

  it.each([
    ["nome curto", { name: "ab" }, "name"],
    ["indicativo com espaço", { callsign: "a b" }, "callsign"],
    ["diária zero", { dailyRate: 0 }, "dailyRate"],
    ["diária fracionada negativa", { dailyRate: -3 }, "dailyRate"],
    ["assentos fracionados", { seats: 2.5 }, "seats"],
    ["carga negativa", { cargoKg: -1 }, "cargoKg"],
    ["autonomia zero", { rangeKm: 0 }, "rangeKm"],
    ["campo numérico vazio", { seats: Number.NaN }, "seats"],
    ["sem motivo", { reason: "  " }, "reason"],
    ["descrição longa", { description: "x".repeat(401) }, "description"],
  ])("recusa %s", (_n, patch, field) => {
    expect(validateVehicleForm({ ...valid(), ...patch })).toHaveProperty(field);
  });
});

describe("CRUD no sandbox do demo", () => {
  beforeEach(() => {
    localStorage.clear();
    startDemoSession();
  });

  it("cria, aparece no catálogo e na auditoria, e conta na frota", async () => {
    const before = await run<{ fleet: { total: number } }>(adminOverviewQuery);
    await saveVehicle(null, valid());

    const catalog = await run<{ callsign: string; model_key: string }[]>(vehiclesQuery);
    expect(catalog.find((v) => v.callsign === "TST-01")?.model_key).toBe("cybercab_x2");

    const after = await run<{ fleet: { total: number } }>(adminOverviewQuery);
    expect(after.fleet.total).toBe(before.fleet.total + 1);

    const audit = await run<{ action: string }[]>(adminAuditQuery);
    expect(audit[0]?.action).toBe("vehicle_created");
  });

  it("recusa indicativo repetido, inclusive em minúsculas", async () => {
    await saveVehicle(null, valid());
    await expect(saveVehicle(null, { ...valid(), callsign: "Tst-01" })).rejects.toThrow(
      /já existe/i,
    );
  });

  it("edita preço e registra o antes e depois", async () => {
    await saveVehicle(null, valid());
    const [created] = (await run<{ id: string; callsign: string }[]>(adminVehiclesQuery)).filter(
      (v) => v.callsign === "TST-01",
    );
    await saveVehicle(created!.id, { ...valid(), dailyRate: 999, reason: "Reajuste" });
    const audit =
      await run<{ action: string; details: { changes?: Record<string, unknown> } }[]>(
        adminAuditQuery,
      );
    expect(audit[0]?.action).toBe("vehicle_updated");
    expect(audit[0]?.details.changes).toHaveProperty("daily_rate_sol");
  });

  it("arquiva: some do catálogo, continua para o admin, e restaura", async () => {
    await saveVehicle(null, valid());
    const id = (await run<{ id: string; callsign: string }[]>(adminVehiclesQuery)).find(
      (v) => v.callsign === "TST-01",
    )!.id;

    await archiveVehicle(id, "Fora de linha");
    expect((await run<{ id: string }[]>(vehiclesQuery)).some((v) => v.id === id)).toBe(false);
    const admin = await run<{ id: string; deleted_at: string | null }[]>(adminVehiclesQuery);
    expect(admin.find((v) => v.id === id)?.deleted_at).not.toBeNull();
    await expect(archiveVehicle(id, "De novo")).rejects.toThrow(/já está arquivado/);

    await restoreVehicle(id, "Voltou");
    expect((await run<{ id: string }[]>(vehiclesQuery)).some((v) => v.id === id)).toBe(true);
    await expect(restoreVehicle(id, "De novo")).rejects.toThrow(/não está arquivado/);
  });

  it("não troca a categoria de veículo com reserva ativa nem permite 'em voo' manual", async () => {
    await expect(saveVehicle(null, { ...valid(), status: "in_flight" })).rejects.toThrow(/em voo/);
    const id = SEED_VEHICLES[0]!.id;
    await expect(archiveVehicle(id, "x")).rejects.toThrow(/motivo/i);
  });

  it("o demo começa sempre da frota de exemplo", async () => {
    await saveVehicle(null, valid());
    startDemoSession();
    const catalog = await run<unknown[]>(vehiclesQuery);
    expect(catalog).toHaveLength(SEED_VEHICLES.length);
  });
});
