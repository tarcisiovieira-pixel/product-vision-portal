// Todas as ESCRITAS do app passam por aqui.
//  - Demo: sandbox local (nada vai para o banco).
//  - Conta real: API Fastify quando VITE_API_URL está definida; senão, RPC direta.
// Em conta real, um erro é sempre mostrado ao usuário: nunca há "sucesso" local.
import { supabase } from "@/integrations/supabase/client";
import {
  DEMO_SOL,
  MAINTENANCE_SERVICES,
  addonsPerSol,
  type Rental,
  type Vehicle,
  type VehicleSaleItem,
} from "./ares-data";
import { apiEnabled, apiPost } from "./api-client";
import { isActiveRental, isOccupied } from "./occupancy";
import { SEED_HANGARS, SEED_RENTALS } from "./ares-seed-data";
import {
  DEMO_USER_ID,
  adjustDemoCredits,
  isDemoSession,
  readDemoMaintenance,
  readDemoProfile,
  readDemoRentals,
  readDemoSales,
  writeDemoMaintenance,
  writeDemoRentals,
  writeDemoSales,
} from "./session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPersistedId = (id: string) => UUID_RE.test(id);

type RpcResult = { data: unknown; error: { message: string } | null };
// RPCs novas ainda não constam em types.ts (arquivo gerado pelo Lovable).
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult> };

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const money = (n: number) => `MC$ ${n.toLocaleString("pt-BR")}`;

function assertDemoBalance(cost: number): void {
  const balance = Number(readDemoProfile()?.martian_credits ?? 0);
  if (balance < cost) {
    throw new Error(`Saldo insuficiente: custo ${money(cost)}, saldo ${money(balance)}.`);
  }
}

// ---------------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------------
export interface BookingInput {
  vehicle: Pick<Vehicle, "id" | "callsign">;
  pickup: string;
  dropoff: string;
  startSol: number;
  endSol: number;
  silicaInsurance: boolean;
  extraO2Tank: boolean;
  neuralAutopilot: boolean;
  evaSuits: number;
  stormBarrier: boolean;
  /** Total calculado pela tela. Conta real: o valor oficial é o do servidor. */
  totalCredits: number;
}

const OCCUPIED_MESSAGE = "Veículo já reservado nesse período.";

/** Reservas ativas do demo, sem duplicar as do seed já alteradas localmente. */
function demoActivePeriods(exceptId?: string) {
  const local = readDemoRentals();
  const ids = new Set(local.map((r) => r.id));
  return [...local, ...SEED_RENTALS.filter((r) => !ids.has(r.id))]
    .filter((r) => isActiveRental(r.status) && r.id !== exceptId)
    .map((r) => ({
      vehicle_id: r.vehicle_id,
      start_sol: r.start_sol,
      end_sol: r.end_sol ?? r.start_sol + 1,
    }));
}

const MAX_SOLS = 90;

/** Mesmas regras do book_vehicle, para o sandbox demo não ensinar um comportamento que o banco recusa. */
function assertBookable(input: BookingInput): void {
  if (input.endSol <= input.startSol) {
    throw new Error("Período inválido: o sol final deve ser maior que o inicial.");
  }
  if (input.startSol < DEMO_SOL) {
    throw new Error(`O sol inicial não pode estar no passado (sol atual: ${DEMO_SOL}).`);
  }
  if (input.endSol - input.startSol > MAX_SOLS) {
    throw new Error(`A reserva pode ter no máximo ${MAX_SOLS} sols.`);
  }
  if (input.evaSuits < 0 || input.evaSuits > 6) throw new Error("Trajes EVA: informe de 0 a 6.");
  const storm = SEED_HANGARS.some(
    (h) => h.storm_alert && (h.id === input.pickup || h.id === input.dropoff),
  );
  if (storm && !input.stormBarrier) {
    throw new Error("Tempestade ativa em um dos hangares: ative a barreira anti-tempestade.");
  }
}

function createDemoRental(input: BookingInput): Rental {
  assertBookable(input);
  if (isOccupied(demoActivePeriods(), input.vehicle.id, input.startSol, input.endSol)) {
    throw new Error(OCCUPIED_MESSAGE);
  }
  assertDemoBalance(input.totalCredits);
  adjustDemoCredits(-input.totalCredits);
  const rental = {
    id: `rent-${Date.now()}`,
    user_id: DEMO_USER_ID,
    vehicle_id: input.vehicle.id,
    pickup_hangar_id: input.pickup,
    dropoff_hangar_id: input.dropoff,
    start_sol: input.startSol,
    end_sol: input.endSol,
    total_credits: input.totalCredits,
    silica_insurance: input.silicaInsurance,
    extra_o2_tank: input.extraO2Tank,
    neural_autopilot_l5: input.neuralAutopilot,
    extra_eva_suits: input.evaSuits,
    storm_barrier: input.stormBarrier,
    preflight_checked: false,
    postflight_checked: false,
    quantum_key: `Q-KEY#${Date.now().toString(36).toUpperCase().slice(-8)}`,
    status: "confirmed",
    created_at: new Date().toISOString(),
  } as Rental;
  writeDemoRentals([rental, ...readDemoRentals()]);
  return rental;
}

/** Código (OLY-01) do hangar de vitrine, ou null se o ID já for do banco / desconhecido. */
async function loadHangarIdsByCode(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("hangars").select("id, code");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((h) => [h.code, h.id]));
}

function toRealHangarId(id: string, byCode: Map<string, string>): string | null {
  if (isPersistedId(id)) return id;
  const code = SEED_HANGARS.find((h) => h.id === id)?.code;
  return (code && byCode.get(code)) || null;
}

async function resolveIds(input: BookingInput): Promise<BookingInput> {
  // A vitrine pública usa IDs locais; ao logar, traduz para os IDs reais do banco.
  if (
    isPersistedId(input.vehicle.id) &&
    isPersistedId(input.pickup) &&
    isPersistedId(input.dropoff)
  ) {
    return input;
  }
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, callsign")
    .eq("callsign", input.vehicle.callsign)
    .maybeSingle();
  if (!vehicle) {
    throw new Error("Este veículo é só de vitrine e não pode ser reservado com conta real.");
  }
  const byCode = await loadHangarIdsByCode();
  const pickup = toRealHangarId(input.pickup, byCode);
  const dropoff = toRealHangarId(input.dropoff, byCode);
  // Nunca "chutar" outro hangar: a reserva precisa ser exatamente a que a tela mostrou.
  if (!pickup || !dropoff) {
    throw new Error("Hangar escolhido não existe no banco. Atualize a página e tente de novo.");
  }
  return { ...input, vehicle, pickup, dropoff };
}

async function bookViaRpc(b: BookingInput): Promise<string> {
  const args: Record<string, unknown> = {
    _vehicle_id: b.vehicle.id,
    _pickup: b.pickup,
    _dropoff: b.dropoff,
    _start_sol: b.startSol,
    _end_sol: b.endSol,
    _silica_insurance: b.silicaInsurance,
    _extra_o2_tank: b.extraO2Tank,
    _neural_autopilot_l5: b.neuralAutopilot,
    _extra_eva_suits: b.evaSuits,
  };
  // Só envia quando ligada: o padrão do banco é falso, e assim o 9º argumento continua válido.
  if (b.stormBarrier) args["_storm_barrier"] = true;
  try {
    return await callRpc<string>("book_vehicle", args);
  } catch (err) {
    // Nunca reservar sem cobrar a barreira: se o banco não tem a função nova, avisa.
    if (
      b.stormBarrier &&
      err instanceof Error &&
      err.message.includes("Could not find the function")
    ) {
      throw new Error(
        "O banco ainda não recebeu a atualização de preços. Fale com o administrador.",
      );
    }
    throw err;
  }
}

export async function createRental(input: BookingInput): Promise<Rental> {
  if (isDemoSession()) return createDemoRental(input);

  const b = await resolveIds(input);
  const rentalId = apiEnabled()
    ? (
        await apiPost<{ id: string }>("/v1/rentals", {
          vehicleId: b.vehicle.id,
          pickupHangarId: b.pickup,
          dropoffHangarId: b.dropoff,
          startSol: b.startSol,
          endSol: b.endSol,
          silicaInsurance: b.silicaInsurance,
          extraO2Tank: b.extraO2Tank,
          neuralAutopilot: b.neuralAutopilot,
          extraEvaSuits: b.evaSuits,
          stormBarrier: b.stormBarrier,
        })
      ).id
    : await bookViaRpc(b);

  const { data, error } = await supabase.from("rentals").select("*").eq("id", rentalId).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function extendRental(rental: Rental, dailyRate: number): Promise<number> {
  if (isDemoSession()) {
    const newEnd = (rental.end_sol ?? rental.start_sol) + 1;
    if (newEnd - rental.start_sol > MAX_SOLS) {
      throw new Error(`A reserva pode ter no máximo ${MAX_SOLS} sols no total.`);
    }
    if (isOccupied(demoActivePeriods(rental.id), rental.vehicle_id, rental.start_sol, newEnd)) {
      throw new Error(OCCUPIED_MESSAGE);
    }
    // Diária mais os adicionais da reserva, como no banco.
    const cost = dailyRate + addonsPerSol(rental as Parameters<typeof addonsPerSol>[0]);
    assertDemoBalance(cost);
    adjustDemoCredits(-cost);
    const updated = {
      ...rental,
      end_sol: newEnd,
      total_credits: Number(rental.total_credits) + cost,
    };
    writeDemoRentals([updated, ...readDemoRentals().filter((r) => r.id !== rental.id)]);
    return newEnd;
  }
  if (apiEnabled()) {
    const res = await apiPost<{ endSol: number }>(`/v1/rentals/${rental.id}/extend`, {});
    return res.endSol;
  }
  return callRpc<number>("extend_rental", { _rental_id: rental.id });
}

export async function cancelRental(rental: Rental): Promise<number> {
  if (isDemoSession()) {
    if (rental.status !== "confirmed" || rental.start_sol <= DEMO_SOL) {
      throw new Error("Reserva já iniciada: não pode ser cancelada.");
    }
    const refund = Number(rental.total_credits);
    adjustDemoCredits(refund);
    const updated = { ...rental, status: "cancelled" };
    writeDemoRentals([updated, ...readDemoRentals().filter((r) => r.id !== rental.id)]);
    return refund;
  }
  if (apiEnabled()) {
    const res = await apiPost<{ refunded: number }>(`/v1/rentals/${rental.id}/cancel`, {});
    return res.refunded;
  }
  return callRpc<number>("cancel_rental", { _rental_id: rental.id });
}

// ---------------------------------------------------------------------------
// Manutenção
// ---------------------------------------------------------------------------
export async function runMaintenance(
  vehicle: Pick<Vehicle, "id" | "callsign">,
  serviceKey: string,
): Promise<void> {
  const notes = `Ordem de serviço ARES para ${vehicle.callsign}`;
  if (isDemoSession()) {
    const cost = MAINTENANCE_SERVICES[serviceKey]?.cost ?? 450;
    assertDemoBalance(cost);
    adjustDemoCredits(-cost);
    writeDemoMaintenance([
      {
        id: `m-log-${Date.now()}`,
        vehicle_id: vehicle.id,
        service_type: serviceKey,
        credits_cost: cost,
        status: "completed",
        notes,
        created_at: new Date().toISOString(),
      },
      ...readDemoMaintenance(),
    ]);
    return;
  }
  if (apiEnabled()) {
    await apiPost("/v1/maintenance", { vehicleId: vehicle.id, serviceType: serviceKey, notes });
    return;
  }
  await callRpc("execute_maintenance", {
    _vehicle_id: vehicle.id,
    _service_type: serviceKey,
    _notes: notes,
  });
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------
export async function buyVehicle(sale: VehicleSaleItem): Promise<void> {
  if (isDemoSession()) {
    // No demo, compra acima do saldo vira sinal de reserva de MC$ 25.000.
    const balance = Number(readDemoProfile()?.martian_credits ?? 0);
    const debit = balance >= sale.price_credits ? sale.price_credits : 25000;
    assertDemoBalance(debit);
    adjustDemoCredits(-debit);
    const stored = readDemoSales<VehicleSaleItem>().filter((s) => s.id !== sale.id);
    writeDemoSales([{ ...sale, status: "sold" }, ...stored]);
    return;
  }
  if (!isPersistedId(sale.id)) {
    throw new Error("Anúncio de vitrine: disponível para compra apenas no modo demo.");
  }
  if (apiEnabled()) {
    await apiPost(`/v1/marketplace/${sale.id}/purchase`, {});
    return;
  }
  await callRpc("buy_marketplace_vehicle", { _sale_id: sale.id });
}

export async function publishListing(item: VehicleSaleItem): Promise<void> {
  if (isDemoSession()) {
    writeDemoSales([item, ...readDemoSales()]);
    return;
  }
  if (!(Number(item.price_credits) > 0)) throw new Error("Informe um preço maior que zero.");
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Entre com sua conta para anunciar.");

  const byCode = await loadHangarIdsByCode();
  const hangarId = item.hangar_id ? toRealHangarId(item.hangar_id, byCode) : null;

  if (apiEnabled()) {
    await apiPost("/v1/marketplace/listings", {
      name: item.name,
      callsign: item.callsign,
      category: item.category,
      price: Number(item.price_credits),
      hangarId,
      flightHours: Number(item.flight_hours),
      hullPct: item.hull_integrity_pct,
      batteryPct: item.battery_condition_pct,
      condition: item.condition,
      features: item.features,
      sellerName: item.seller_name,
    });
    return;
  }
  await callRpc("create_listing", {
    _name: item.name,
    _callsign: item.callsign,
    _category: item.category,
    _price: Number(item.price_credits),
    _hangar_id: hangarId,
    _flight_hours: Number(item.flight_hours),
    _hull_pct: item.hull_integrity_pct,
    _battery_pct: item.battery_condition_pct,
    _condition: item.condition,
    _features: item.features,
    _seller_name: item.seller_name,
  });
}
