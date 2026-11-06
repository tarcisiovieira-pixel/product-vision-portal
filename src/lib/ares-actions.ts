// Todas as ESCRITAS do app passam por aqui.
//  - Demo: sandbox local (nada vai para o banco).
//  - Conta real: API Fastify quando VITE_API_URL está definida; senão, RPC direta.
// Em conta real, um erro é sempre mostrado ao usuário: nunca há "sucesso" local.
import { supabase } from "@/integrations/supabase/client";
import { MAINTENANCE_SERVICES, type Rental, type Vehicle, type VehicleSaleItem } from "./ares-data";
import { apiEnabled, apiPost } from "./api-client";
import { isActiveRental, isOccupied } from "./occupancy";
import { SEED_RENTALS } from "./ares-seed-data";
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

function createDemoRental(input: BookingInput): Rental {
  if (isOccupied(demoActivePeriods(), input.vehicle.id, input.startSol, input.endSol)) {
    throw new Error(OCCUPIED_MESSAGE);
  }
  assertDemoBalance(input.totalCredits);
  adjustDemoCredits(-input.totalCredits);
  const rental: Rental = {
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
    preflight_checked: false,
    postflight_checked: false,
    quantum_key: `Q-KEY#${Date.now().toString(36).toUpperCase().slice(-8)}`,
    status: "confirmed",
    created_at: new Date().toISOString(),
  };
  writeDemoRentals([rental, ...readDemoRentals()]);
  return rental;
}

async function resolveIds(input: BookingInput): Promise<BookingInput> {
  // A vitrine pública usa IDs locais; ao logar, traduz para os IDs reais do banco.
  if (isPersistedId(input.vehicle.id) && isPersistedId(input.pickup)) return input;
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, callsign")
    .eq("callsign", input.vehicle.callsign)
    .maybeSingle();
  const { data: hangars } = await supabase.from("hangars").select("id").order("name");
  const first = hangars?.[0]?.id;
  if (!vehicle || !first) {
    throw new Error("Este veículo é só de vitrine e não pode ser reservado com conta real.");
  }
  return {
    ...input,
    vehicle,
    pickup: isPersistedId(input.pickup) ? input.pickup : first,
    dropoff: isPersistedId(input.dropoff) ? input.dropoff : first,
  };
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
        })
      ).id
    : await callRpc<string>("book_vehicle", {
        _vehicle_id: b.vehicle.id,
        _pickup: b.pickup,
        _dropoff: b.dropoff,
        _start_sol: b.startSol,
        _end_sol: b.endSol,
        _silica_insurance: b.silicaInsurance,
        _extra_o2_tank: b.extraO2Tank,
        _neural_autopilot_l5: b.neuralAutopilot,
        _extra_eva_suits: b.evaSuits,
      });

  const { data, error } = await supabase.from("rentals").select("*").eq("id", rentalId).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function extendRental(rental: Rental, dailyRate: number): Promise<number> {
  if (isDemoSession()) {
    const newEnd = (rental.end_sol ?? rental.start_sol) + 1;
    if (isOccupied(demoActivePeriods(rental.id), rental.vehicle_id, rental.start_sol, newEnd)) {
      throw new Error(OCCUPIED_MESSAGE);
    }
    assertDemoBalance(dailyRate);
    adjustDemoCredits(-dailyRate);
    const updated = {
      ...rental,
      end_sol: newEnd,
      total_credits: Number(rental.total_credits) + dailyRate,
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
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Entre com sua conta para anunciar.");
  const { error } = await supabase.from("vehicle_sales").insert({
    name: item.name,
    callsign: item.callsign,
    category: item.category,
    price_credits: item.price_credits,
    sol_manufactured: item.sol_manufactured,
    flight_hours: item.flight_hours,
    hull_integrity_pct: item.hull_integrity_pct,
    battery_condition_pct: item.battery_condition_pct,
    condition: item.condition,
    hangar_id: isPersistedId(item.hangar_id ?? "") ? item.hangar_id : null,
    seller_name: item.seller_name,
    seller_user_id: data.user.id,
    features: item.features,
    status: "available_for_sale",
  });
  if (error) throw new Error(error.message);
}
