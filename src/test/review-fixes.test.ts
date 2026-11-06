// Regras da revisão de código no front: sem dados falsos para conta real,
// hangar mapeado por código, clima, relógio de sols e anúncio pela função segura.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  error: null as { message: string } | null,
  session: false,
  rpc: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const chain = {
      select: () => chain,
      order: () => chain,
      eq: () => chain,
      insert: (...args: unknown[]) => db.insert(table, ...args),
      maybeSingle: async () => ({ data: db.rows[table]?.[0] ?? null, error: db.error }),
      single: async () => ({ data: db.rows[table]?.[0] ?? null, error: db.error }),
      then: (ok: (value: unknown) => unknown) =>
        Promise.resolve({ data: db.error ? null : (db.rows[table] ?? []), error: db.error }).then(
          ok,
        ),
    };
    return chain;
  };
  return {
    supabase: {
      from: builder,
      rpc: db.rpc,
      auth: {
        getSession: async () => ({ data: { session: db.session ? { user: { id: "u1" } } : null } }),
        getUser: async () => ({ data: { user: db.session ? { id: "u1" } : null } }),
      },
    },
  };
});

import {
  DEMO_SOL,
  addonsPerSol,
  currentSolQuery,
  hangarsQuery,
  rentalsQuery,
  vehiclesQuery,
  weatherQuery,
  type Rental,
  type VehicleSaleItem,
} from "@/lib/ares-data";
import {
  cancelRental,
  createRental,
  extendRental,
  publishListing,
  type BookingInput,
} from "@/lib/ares-actions";
import {
  SEED_HANGARS,
  SEED_RENTALS,
  SEED_VEHICLES,
  SEED_VEHICLE_SALES,
} from "@/lib/ares-seed-data";
import { adjustDemoCredits, readDemoProfile, startDemoSession } from "@/lib/session";

const run = <T>(q: { queryFn?: unknown }) => (q.queryFn as () => Promise<T>)();

const REAL_VEHICLE = "11111111-1111-4111-8111-111111111111";
const REAL_OLY = "22222222-2222-4222-8222-222222222221";
const REAL_JEZ = "22222222-2222-4222-8222-222222222222";

const booking = (over: Partial<BookingInput> = {}): BookingInput => ({
  vehicle: { id: "v-apx-01", callsign: "APX-01" },
  pickup: "h-oly-01",
  dropoff: "h-oly-01",
  startSol: DEMO_SOL + 10,
  endSol: DEMO_SOL + 12,
  silicaInsurance: false,
  extraO2Tank: false,
  neuralAutopilot: false,
  evaSuits: 0,
  stormBarrier: false,
  totalCredits: 1000,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  db.rows = {};
  db.error = null;
  db.session = false;
  db.rpc.mockReset();
  db.insert.mockReset();
});

describe("catálogo: dados de exemplo só para demo e visitante", () => {
  it("visitante sem sessão vê a vitrine local", async () => {
    expect(await run(vehiclesQuery)).toEqual(SEED_VEHICLES);
    expect(await run(hangarsQuery)).toEqual(SEED_HANGARS);
  });

  it("demo vê a vitrine local mesmo que o banco responda", async () => {
    startDemoSession();
    db.session = true;
    db.rows["vehicles"] = [{ id: "real" }];
    expect(await run(vehiclesQuery)).toEqual(SEED_VEHICLES);
  });

  it("conta real vê o banco, mesmo vazio", async () => {
    db.session = true;
    db.rows["vehicles"] = [];
    expect(await run(vehiclesQuery)).toEqual([]);
    db.rows["weather_events"] = [{ id: "w1" }];
    expect(await run(weatherQuery)).toEqual([{ id: "w1" }]);
  });

  it("conta real com o banco fora do ar recebe o erro, não uma frota inventada", async () => {
    db.session = true;
    db.error = { message: "banco fora do ar" };
    await expect(run(vehiclesQuery)).rejects.toThrow("banco fora do ar");
    await expect(run(hangarsQuery)).rejects.toThrow("banco fora do ar");
  });
});

describe("relógio de sols", () => {
  it("visitante e demo usam o sol congelado", async () => {
    expect(await run(currentSolQuery)).toBe(DEMO_SOL);
  });

  it("conta real lê o relógio do servidor", async () => {
    db.session = true;
    db.rpc.mockResolvedValue({ data: 4230, error: null });
    expect(await run(currentSolQuery)).toBe(4230);
  });

  it("banco sem a migration cai no sol do demo, sem quebrar a tela", async () => {
    db.session = true;
    db.rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect(await run(currentSolQuery)).toBe(DEMO_SOL);
    db.rpc.mockRejectedValue(new Error("rede"));
    expect(await run(currentSolQuery)).toBe(DEMO_SOL);
  });

  it("conta real atualiza o status das reservas antes de listar", async () => {
    db.session = true;
    db.rpc.mockResolvedValue({ data: null, error: null });
    db.rows["rentals"] = [];
    await run<Rental[]>(rentalsQuery);
    expect(db.rpc).toHaveBeenCalledWith("refresh_rental_status");
  });

  it("listar não quebra se o banco ainda não tem a função", async () => {
    db.session = true;
    db.rpc.mockRejectedValue(new Error("missing"));
    db.rows["rentals"] = [{ id: "r1" }];
    expect(await run<Rental[]>(rentalsQuery)).toEqual([{ id: "r1" }]);
  });
});

describe("conta real: hangar mapeado pelo código, nunca chutado", () => {
  beforeEach(() => {
    db.session = true;
    db.rows["vehicles"] = [{ id: REAL_VEHICLE, callsign: "APX-01" }];
    db.rows["hangars"] = [
      { id: "real-acidalia", code: "ACI-04" },
      { id: REAL_OLY, code: "OLY-01" },
      { id: REAL_JEZ, code: "JEZ-02" },
    ];
    db.rows["rentals"] = [{ id: "novo" }];
    db.rpc.mockResolvedValue({ data: "novo", error: null });
  });

  it("Olympus da vitrine vira o Olympus do banco, não o primeiro da lista", async () => {
    await createRental(booking({ pickup: "h-oly-01", dropoff: "h-jez-02" }));
    const [, args] = db.rpc.mock.calls.find(([fn]) => fn === "book_vehicle")!;
    expect(args._pickup).toBe(REAL_OLY);
    expect(args._dropoff).toBe(REAL_JEZ);
    expect(args._vehicle_id).toBe(REAL_VEHICLE);
  });

  it("hangar sem equivalente no banco recusa em vez de usar outro", async () => {
    db.rows["hangars"] = [{ id: "real-acidalia", code: "ACI-04" }];
    await expect(createRental(booking())).rejects.toThrow(/não existe no banco/);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("veículo de vitrine sem par no banco recusa", async () => {
    db.rows["vehicles"] = [];
    await expect(createRental(booking())).rejects.toThrow(/só de vitrine/);
  });

  it("IDs que já são do banco passam direto", async () => {
    await createRental(
      booking({
        vehicle: { id: REAL_VEHICLE, callsign: "APX-01" },
        pickup: REAL_OLY,
        dropoff: REAL_JEZ,
      }),
    );
    const [, args] = db.rpc.mock.calls.find(([fn]) => fn === "book_vehicle")!;
    expect(args._pickup).toBe(REAL_OLY);
  });

  it("sem a barreira o argumento novo não é enviado (banco antigo continua válido)", async () => {
    await createRental(booking({ stormBarrier: false }));
    const [, args] = db.rpc.mock.calls.find(([fn]) => fn === "book_vehicle")!;
    expect(args).not.toHaveProperty("_storm_barrier");
  });

  it("com a barreira envia o argumento", async () => {
    await createRental(booking({ stormBarrier: true }));
    const [, args] = db.rpc.mock.calls.find(([fn]) => fn === "book_vehicle")!;
    expect(args._storm_barrier).toBe(true);
  });

  it("banco sem a função de preços não reserva em silêncio sem cobrar a barreira", async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.book_vehicle in the schema cache" },
    });
    await expect(createRental(booking({ stormBarrier: true }))).rejects.toThrow(
      /ainda não recebeu a atualização/,
    );
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("modo demo aplica as mesmas regras do banco", () => {
  beforeEach(() => {
    startDemoSession();
  });

  it.each([
    ["sol no passado", { startSol: DEMO_SOL - 1, endSol: DEMO_SOL + 1 }, /passado/],
    ["mais de 90 sols", { startSol: DEMO_SOL + 1, endSol: DEMO_SOL + 100 }, /máximo 90/],
    ["período invertido", { startSol: DEMO_SOL + 5, endSol: DEMO_SOL + 2 }, /Período inválido/],
    ["trajes EVA negativos", { evaSuits: -3 }, /Trajes EVA/],
    ["trajes EVA demais", { evaSuits: 7 }, /Trajes EVA/],
    ["tempestade sem barreira", { pickup: "h-aci-04" }, /barreira anti-tempestade/],
    ["tempestade na devolução", { dropoff: "h-aci-04" }, /barreira anti-tempestade/],
  ])("recusa %s e não cobra", async (_nome, over, pattern) => {
    await expect(createRental(booking(over))).rejects.toThrow(pattern);
    expect(readDemoProfile()?.martian_credits).toBe(25000);
  });

  it("tempestade com a barreira liga a reserva e registra a barreira", async () => {
    const rental = await createRental(booking({ pickup: "h-aci-04", stormBarrier: true }));
    expect(rental).toMatchObject({ storm_barrier: true });
  });

  it("cancelar uma reserva que já começou é recusado", async () => {
    const started = SEED_RENTALS.find((r) => r.status === "in_flight")!;
    await expect(cancelRental(started)).rejects.toThrow(/já iniciada/);
    const begun = { ...SEED_RENTALS.find((r) => r.status === "confirmed")!, start_sol: DEMO_SOL };
    await expect(cancelRental(begun)).rejects.toThrow(/já iniciada/);
    expect(readDemoProfile()?.martian_credits).toBe(25000);
  });

  it("estender cobra a diária mais os adicionais da reserva", async () => {
    const rental = await createRental(
      booking({
        vehicle: { id: "v-cc-01", callsign: "CC-X2-01" },
        silicaInsurance: true,
        extraO2Tank: true,
        neuralAutopilot: true,
        evaSuits: 3,
        stormBarrier: true,
        totalCredits: 500,
      }),
    );
    const before = Number(readDemoProfile()?.martian_credits);
    await extendRental(rental, 420);
    const addons = 120 + 180 + 350 + 300 + 220;
    expect(before - Number(readDemoProfile()?.martian_credits)).toBe(420 + addons);
  });

  it("estender não passa de 90 sols no total", async () => {
    adjustDemoCredits(1_000_000);
    const rental = await createRental(
      booking({
        vehicle: { id: "v-cc-01", callsign: "CC-X2-01" },
        startSol: DEMO_SOL + 30,
        endSol: DEMO_SOL + 120,
        totalCredits: 10,
      }),
    );
    await expect(extendRental(rental, 420)).rejects.toThrow(/máximo 90/);
  });
});

describe("preço dos adicionais", () => {
  it("espelha a conta do banco", () => {
    expect(addonsPerSol({})).toBe(0);
    expect(addonsPerSol({ extra_eva_suits: -4 })).toBe(0);
    expect(
      addonsPerSol({
        silica_insurance: true,
        extra_o2_tank: true,
        neural_autopilot_l5: true,
        extra_eva_suits: 2,
        storm_barrier: true,
      }),
    ).toBe(120 + 180 + 350 + 200 + 220);
  });
});

describe("anúncios: só pela função segura do banco", () => {
  const item = (over: Partial<VehicleSaleItem> = {}): VehicleSaleItem => ({
    ...SEED_VEHICLE_SALES[0]!,
    id: "sale-user-1",
    hangar_id: "h-oly-01",
    price_credits: 500,
    ...over,
  });

  beforeEach(() => {
    db.session = true;
    db.rows["hangars"] = [{ id: REAL_OLY, code: "OLY-01" }];
    db.rpc.mockResolvedValue({ data: "novo", error: null });
  });

  it("publica por create_listing, nunca por insert direto", async () => {
    await publishListing(item());
    expect(db.insert).not.toHaveBeenCalled();
    const [fn, args] = db.rpc.mock.calls[0]!;
    expect(fn).toBe("create_listing");
    expect(args._price).toBe(500);
    expect(args._hangar_id).toBe(REAL_OLY);
  });

  it.each([0, -1000000])("recusa preço %s antes de chamar o banco", async (price) => {
    await expect(publishListing(item({ price_credits: price }))).rejects.toThrow(/maior que zero/);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("mostra o erro do banco ao usuário", async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: "Já existe um anúncio com este indicativo" },
    });
    await expect(publishListing(item())).rejects.toThrow(/Já existe um anúncio/);
  });
});
