// Trava o bug em que dados demo apareciam em contas reais recém-criadas.
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  error: null as { message: string } | null,
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const result = () => ({ data: db.error ? null : (db.rows[table] ?? []), error: db.error });
    const chain = {
      select: () => chain,
      order: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data: db.rows[table]?.[0] ?? null,
        error: db.error,
      }),
      single: async () => ({ data: db.rows[table]?.[0] ?? null, error: db.error }),
      then: (ok: (value: unknown) => unknown) => Promise.resolve(result()).then(ok),
    };
    return chain;
  };
  return { supabase: { from: builder, rpc: db.rpc, auth: {} } };
});

import {
  maintenanceLogsQuery,
  profileQuery,
  rentalsQuery,
  vehicleSalesQuery,
  type Rental,
} from "@/lib/ares-data";
import { buyVehicle, cancelRental, createRental, extendRental } from "@/lib/ares-actions";
import {
  adjustDemoCredits,
  clearDemoState,
  enterRealSession,
  isDemoSession,
  readDemoProfile,
  readDemoRentals,
  startDemoSession,
} from "@/lib/session";
import { SEED_RENTALS, SEED_VEHICLE_SALES } from "@/lib/ares-seed-data";

const run = <T>(q: { queryFn?: unknown }) => (q.queryFn as () => Promise<T>)();

const booking = {
  vehicle: { id: "11111111-1111-4111-8111-111111111111", callsign: "CC-X2-01" },
  pickup: "22222222-2222-4222-8222-222222222222",
  dropoff: "22222222-2222-4222-8222-222222222222",
  startSol: 4219,
  endSol: 4222,
  silicaInsurance: false,
  extraO2Tank: false,
  neuralAutopilot: false,
  evaSuits: 0,
  stormBarrier: false,
  totalCredits: 3000,
};

beforeEach(() => {
  localStorage.clear();
  db.rows = {};
  db.error = null;
  db.rpc.mockReset();
});

describe("conta real", () => {
  it("sem reservas vê lista vazia, nunca o seed", async () => {
    expect(await run<Rental[]>(rentalsQuery)).toEqual([]);
  });

  it("sem logs de manutenção vê lista vazia", async () => {
    expect(await run(maintenanceLogsQuery)).toEqual([]);
  });

  it("ignora reservas demo que sobraram no navegador", async () => {
    localStorage.setItem("ares_demo_rentals", JSON.stringify(SEED_RENTALS));
    expect(await run<Rental[]>(rentalsQuery)).toEqual([]);
  });

  it("perfil vem do banco, nunca do fallback demo", async () => {
    db.rows["profiles"] = [{ id: "p1", space_credential_id: "ARS-REAL" }];
    expect(await run(profileQuery)).toEqual(db.rows["profiles"]?.[0]);
  });

  it("falha do banco em reservas vira erro, não dados falsos", async () => {
    db.error = { message: "boom" };
    await expect(run(rentalsQuery)).rejects.toThrow("boom");
  });

  it("reserva vai para o servidor e não toca no sandbox demo", async () => {
    db.rpc.mockResolvedValue({ data: "rental-id", error: null });
    db.rows["rentals"] = [{ id: "rental-id" }];
    await createRental(booking);
    expect(db.rpc).toHaveBeenCalledWith("book_vehicle", expect.anything());
    expect(readDemoRentals()).toEqual([]);
    expect(isDemoSession()).toBe(false);
  });

  it("erro de negócio chega ao usuário em vez de sucesso local", async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: "Saldo insuficiente" } });
    await expect(createRental(booking)).rejects.toThrow("Saldo insuficiente");
    expect(readDemoRentals()).toEqual([]);
  });

  it("anúncio de vitrine não pode ser comprado com conta real", async () => {
    await expect(buyVehicle(SEED_VEHICLE_SALES[0]!)).rejects.toThrow(/modo demo/);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("estender e cancelar usam RPC", async () => {
    db.rpc.mockResolvedValue({ data: 5, error: null });
    const rental = { id: "r1", total_credits: 10 } as Rental;
    await extendRental(rental, 100);
    await cancelRental(rental);
    expect(db.rpc).toHaveBeenCalledWith("extend_rental", { _rental_id: "r1" });
    expect(db.rpc).toHaveBeenCalledWith("cancel_rental", { _rental_id: "r1" });
  });
});

describe("modo demo", () => {
  it("só existe após startDemoSession", () => {
    expect(isDemoSession()).toBe(false);
    startDemoSession();
    expect(isDemoSession()).toBe(true);
    expect(readDemoProfile()?.martian_credits).toBe(25000);
  });

  it("mostra o seed sem acessar o banco", async () => {
    startDemoSession();
    expect((await run<Rental[]>(rentalsQuery)).length).toBe(SEED_RENTALS.length);
    expect(await run(vehicleSalesQuery)).toHaveLength(SEED_VEHICLE_SALES.length);
  });

  it("reserva debita saldo local e não chama RPC", async () => {
    startDemoSession();
    await createRental(booking);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(readDemoProfile()?.martian_credits).toBe(22000);
    expect((await run<Rental[]>(rentalsQuery)).length).toBe(SEED_RENTALS.length + 1);
  });

  it("recusa reserva acima do saldo", async () => {
    startDemoSession();
    await expect(createRental({ ...booking, totalCredits: 999999 })).rejects.toThrow(/Saldo/);
  });

  it("cancelar devolve créditos sem duplicar a reserva do seed", async () => {
    startDemoSession();
    const seed = { ...SEED_RENTALS[0]!, total_credits: 100 };
    await cancelRental(seed);
    expect(readDemoProfile()?.martian_credits).toBe(25100);
    const list = await run<Rental[]>(rentalsQuery);
    expect(list.filter((r) => r.id === seed.id)).toHaveLength(1);
    expect(list.find((r) => r.id === seed.id)?.status).toBe("cancelled");
  });

  it("nova sessão demo não herda saldo gasto", () => {
    startDemoSession();
    adjustDemoCredits(-5000);
    expect(startDemoSession().martian_credits).toBe(25000);
  });
});

describe("transição demo → conta real", () => {
  it("login real apaga o sandbox e o cache", () => {
    const qc = new QueryClient();
    qc.setQueryData(["rentals"], SEED_RENTALS);
    startDemoSession();
    enterRealSession(qc);
    expect(isDemoSession()).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(qc.getQueryData(["rentals"])).toBeUndefined();
  });

  it("clearDemoState é seguro sem sessão", () => {
    expect(() => clearDemoState()).not.toThrow();
  });
});
