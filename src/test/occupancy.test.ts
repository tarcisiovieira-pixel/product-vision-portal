import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), auth: {} },
}));

import { createRental, extendRental, cancelRental } from "@/lib/ares-actions";
import { rentalsQuery, type Rental } from "@/lib/ares-data";
import { isOccupied } from "@/lib/occupancy";
import { readDemoProfile, startDemoSession } from "@/lib/session";

const periods = [{ vehicle_id: "v1", start_sol: 10, end_sol: 15 }];

describe("isOccupied", () => {
  it.each([
    [9, 11, true],
    [12, 13, true],
    [14, 20, true],
    [5, 30, true],
    [5, 10, false],
    [15, 20, false],
  ])("período %i–%i → %s", (start, end, expected) => {
    expect(isOccupied(periods, "v1", start, end)).toBe(expected);
  });

  it("outro veículo não conflita", () => {
    expect(isOccupied(periods, "v2", 10, 15)).toBe(false);
  });
});

describe("ocupação no modo demo", () => {
  const booking = {
    vehicle: { id: "v-apx-01", callsign: "APX-01" },
    pickup: "h-oly-01",
    dropoff: "h-oly-01",
    startSol: 4222,
    endSol: 4223,
    silicaInsurance: false,
    extraO2Tank: false,
    neuralAutopilot: false,
    evaSuits: 0,
    totalCredits: 1000,
  };
  const list = () => (rentalsQuery.queryFn as unknown as () => Promise<Rental[]>)();

  beforeEach(() => {
    localStorage.clear();
    startDemoSession();
  });

  it("recusa período ocupado sem debitar", async () => {
    await expect(createRental(booking)).rejects.toThrow(/já reservado/);
    expect(readDemoProfile()?.martian_credits).toBe(25000);
  });

  it("aceita período colado ao fim da reserva existente", async () => {
    await expect(createRental({ ...booking, startSol: 4224, endSol: 4226 })).resolves.toBeTruthy();
  });

  it("cancelar libera o período", async () => {
    const seed = (await list()).find((r) => r.vehicle_id === "v-apx-01")!;
    await cancelRental(seed);
    await expect(createRental(booking)).resolves.toBeTruthy();
  });

  it("estender recusa invadir a reserva seguinte", async () => {
    const first = await createRental({ ...booking, startSol: 4219, endSol: 4221 });
    await expect(extendRental(first, 100)).rejects.toThrow(/já reservado/);
  });
});
