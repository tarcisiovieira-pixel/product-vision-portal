// CRUD de veículos do painel administrativo.
// A permissão real está no banco; aqui há apresentação, validação de formulário e o sandbox do demo.
import { queryOptions } from "@tanstack/react-query";
import {
  CALLSIGN_PATTERN,
  MODEL_CATALOG,
  inferModelKey,
  isModelKey,
  modelCategory,
  normalizeCallsign,
  specsOf,
  type ModelKey,
  type VehicleCategory,
} from "@shared/fleet";
import type { AdminAuditEntry } from "./admin";
import { apiEnabled, apiGet, apiPost, apiPut } from "./api-client";
import type { FleetVehicle } from "./ares-data";
import { SEED_HANGARS, SEED_RENTALS, SEED_VEHICLES } from "./ares-seed-data";
import { rpc } from "./rpc";
import {
  isDemoSession,
  readDemoAudit,
  readDemoRentals,
  readDemoVehicles,
  writeDemoAudit,
  writeDemoVehicles,
} from "./session";

export type VehicleStatus = "available" | "in_flight" | "maintenance" | "storm_hold";

export interface AdminVehicle {
  id: string;
  name: string;
  callsign: string;
  category: VehicleCategory;
  model_key: ModelKey;
  daily_rate_sol: number;
  hangar_id: string | null;
  hangar_name: string | null;
  status: VehicleStatus;
  seats: number;
  cargo_kg: number;
  range_km: number;
  description: string | null;
  deleted_at: string | null;
  created_at: string;
  rentals_total: number;
  rentals_active: number;
  revenue: number;
}

export interface VehicleForm {
  name: string;
  callsign: string;
  modelKey: ModelKey;
  dailyRate: number;
  hangarId: string | null;
  status: VehicleStatus;
  seats: number;
  cargoKg: number;
  rangeKm: number;
  description: string;
  reason: string;
}

export type FormErrors = Partial<Record<keyof VehicleForm, string>>;

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Disponível",
  in_flight: "Em voo",
  maintenance: "Em manutenção",
  storm_hold: "Retido por tempestade",
};

const inRange = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max;

/** Mesmas regras que o banco aplica ao salvar: o formulário avisa antes, o banco decide. */
export function validateVehicleForm(f: VehicleForm): FormErrors {
  const errors: FormErrors = {};
  const name = f.name.trim();
  if (name.length < 3 || name.length > 80) errors.name = "Use de 3 a 80 caracteres.";
  if (!CALLSIGN_PATTERN.test(normalizeCallsign(f.callsign))) {
    errors.callsign = "Use de 3 a 20 letras maiúsculas, números ou hífen.";
  }
  if (!isModelKey(f.modelKey)) errors.modelKey = "Escolha um modelo 3D.";
  if (!(f.dailyRate > 0) || f.dailyRate > 1_000_000) {
    errors.dailyRate = "A diária deve estar entre MC$ 1 e MC$ 1.000.000.";
  }
  if (!inRange(f.seats, 1, 500)) errors.seats = "Informe de 1 a 500 assentos.";
  if (!inRange(f.cargoKg, 0, 10_000_000)) errors.cargoKg = "Informe de 0 a 10.000.000 kg.";
  if (!inRange(f.rangeKm, 1, 1_000_000_000))
    errors.rangeKm = "Informe uma autonomia maior que zero.";
  if (f.description.length > 400) errors.description = "No máximo 400 caracteres.";
  if (f.reason.trim().length < 3) errors.reason = "Informe o motivo (vai para a auditoria).";
  return errors;
}

export function formFromTemplate(
  key: ModelKey,
  reason = "",
  hangarId: string | null = null,
): VehicleForm {
  const d = MODEL_CATALOG[key].defaults;
  return {
    name: d.name,
    callsign: "",
    modelKey: key,
    dailyRate: d.daily_rate_sol,
    hangarId,
    status: "available",
    seats: d.seats,
    cargoKg: d.cargo_kg,
    rangeKm: d.range_km,
    description: d.description,
    reason,
  };
}

export function formFromVehicle(v: AdminVehicle): VehicleForm {
  return {
    name: v.name,
    callsign: v.callsign,
    modelKey: v.model_key,
    dailyRate: v.daily_rate_sol,
    hangarId: v.hangar_id,
    status: v.status,
    seats: v.seats,
    cargoKg: v.cargo_kg,
    rangeKm: v.range_km,
    description: v.description ?? "",
    reason: "",
  };
}

// ---------------------------------------------------------------------------
// Sandbox do demo: a frota fictícia pode ser criada, editada e arquivada no navegador.
// ---------------------------------------------------------------------------
function materialize(v: FleetVehicle): FleetVehicle {
  const model = inferModelKey(v);
  const specs = specsOf(v);
  return {
    ...v,
    model_key: model,
    seats: specs.seats,
    cargo_kg: specs.cargo_kg,
    range_km: specs.range_km,
    description: v.description ?? MODEL_CATALOG[model].defaults.description,
    deleted_at: v.deleted_at ?? null,
  };
}

/** Frota do demo: a editada pelo usuário, ou a de exemplo na primeira vez. */
export function demoFleet(): FleetVehicle[] {
  return readDemoVehicles<FleetVehicle>() ?? (SEED_VEHICLES as FleetVehicle[]).map(materialize);
}

function demoRentalStats(vehicleId: string) {
  const local = readDemoRentals();
  const ids = new Set(local.map((r) => r.id));
  const all = [...local, ...SEED_RENTALS.filter((r) => !ids.has(r.id))].filter(
    (r) => r.vehicle_id === vehicleId,
  );
  const active = all.filter((r) => r.status === "confirmed" || r.status === "in_flight").length;
  const revenue = all
    .filter((r) => r.status !== "cancelled")
    .reduce((total, r) => total + Number(r.total_credits), 0);
  return { total: all.length, active, revenue };
}

export function demoFleetCounts() {
  const live = demoFleet().filter((v) => !v.deleted_at);
  const count = (status: VehicleStatus) => live.filter((v) => v.status === status).length;
  return {
    total: live.length,
    available: count("available"),
    in_flight: count("in_flight"),
    maintenance: count("maintenance"),
    storm_hold: count("storm_hold"),
    occupied: live.filter((v) => demoRentalStats(v.id).active > 0).length,
  };
}

function demoAdminVehicles(): AdminVehicle[] {
  const hangarName = new Map<string, string>(SEED_HANGARS.map((h) => [h.id, h.name]));
  return demoFleet()
    .map((v): AdminVehicle => {
      const stats = demoRentalStats(v.id);
      const model = inferModelKey(v);
      const specs = specsOf({ ...v, model_key: model });
      return {
        id: v.id,
        name: v.name,
        callsign: v.callsign,
        category: v.category,
        model_key: model,
        daily_rate_sol: Number(v.daily_rate_sol),
        hangar_id: v.hangar_id,
        hangar_name: v.hangar_id ? (hangarName.get(v.hangar_id) ?? null) : null,
        status: v.status,
        seats: specs.seats,
        cargo_kg: specs.cargo_kg,
        range_km: specs.range_km,
        description: v.description ?? null,
        deleted_at: v.deleted_at ?? null,
        created_at: v.created_at,
        rentals_total: stats.total,
        rentals_active: stats.active,
        revenue: stats.revenue,
      };
    })
    .sort(
      (a, b) =>
        Number(!!a.deleted_at) - Number(!!b.deleted_at) ||
        a.category.localeCompare(b.category) ||
        a.callsign.localeCompare(b.callsign),
    );
}

function pushDemoAudit(action: string, details: Record<string, unknown>) {
  const entry: AdminAuditEntry = {
    id: `demo-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    details,
    created_at: new Date().toISOString(),
    admin_email: "comandante@ares.test",
    target_email: null,
  };
  writeDemoAudit([entry, ...readDemoAudit<AdminAuditEntry>()]);
}

function demoSave(id: string | null, form: VehicleForm): void {
  const problems = validateVehicleForm(form);
  const first = Object.values(problems)[0];
  if (first) throw new Error(first);

  const fleet = demoFleet();
  const callsign = normalizeCallsign(form.callsign);
  if (fleet.some((v) => v.callsign === callsign && v.id !== id)) {
    throw new Error("Já existe um veículo com este indicativo (inclusive arquivado).");
  }
  const category = modelCategory(form.modelKey);
  const hangar = SEED_HANGARS.find((h) => h.id === form.hangarId);
  const existing = id ? fleet.find((v) => v.id === id) : undefined;
  if (id && !existing) throw new Error("Veículo não encontrado.");
  if (existing?.deleted_at) throw new Error("Restaure o veículo antes de editar.");
  if (form.status === "in_flight" && existing?.status !== "in_flight") {
    throw new Error('O status "em voo" não pode ser definido manualmente.');
  }
  if (existing && category !== existing.category && demoRentalStats(existing.id).active > 0) {
    throw new Error("Não é possível trocar a categoria de um veículo com reservas ativas.");
  }

  const now = new Date().toISOString();
  const base = {
    name: form.name.trim(),
    callsign,
    category,
    model_key: form.modelKey,
    daily_rate_sol: form.dailyRate,
    hangar_id: form.hangarId,
    status: form.status,
    seats: form.seats,
    cargo_kg: form.cargoKg,
    range_km: form.rangeKm,
    description: form.description.trim() || null,
    updated_at: now,
  };

  if (!existing) {
    const created = {
      ...base,
      id: `demo-v-${Date.now().toString(36)}`,
      lat: hangar?.lat ?? 0,
      lng: hangar?.lng ?? 0,
      altitude_km: 0,
      battery_pct: 100,
      o2_hours: category === "interplanetary_rocket" ? 900 : category === "space_truck" ? 120 : 40,
      dust_filter_pct: 100,
      cabin_pressure_kpa: 101.3,
      thruster_integrity: 100,
      speed_kmh: 0,
      heat_shield_pct: 100,
      deleted_at: null,
      created_at: now,
    } as FleetVehicle;
    writeDemoVehicles([...fleet, created]);
    pushDemoAudit("vehicle_created", { callsign, name: base.name, reason: form.reason.trim() });
    return;
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(base)) {
    const from = (existing as unknown as Record<string, unknown>)[key];
    if (key !== "updated_at" && from !== to) changes[key] = { from, to };
  }
  writeDemoVehicles(
    fleet.map((v) => (v.id === existing.id ? ({ ...v, ...base } as FleetVehicle) : v)),
  );
  pushDemoAudit("vehicle_updated", { callsign, reason: form.reason.trim(), changes });
}

function demoArchive(id: string, reason: string, restore: boolean): void {
  if (reason.trim().length < 3) throw new Error("Informe o motivo.");
  const fleet = demoFleet();
  const v = fleet.find((x) => x.id === id);
  if (!v) throw new Error("Veículo não encontrado.");
  if (restore && !v.deleted_at) throw new Error("Este veículo não está arquivado.");
  if (!restore) {
    if (v.deleted_at) throw new Error("Este veículo já está arquivado.");
    if (demoRentalStats(id).active > 0) {
      throw new Error(
        "Veículo com reservas ativas: aguarde terminar ou cancele antes de arquivar.",
      );
    }
  }
  writeDemoVehicles(
    fleet.map((x) =>
      x.id === id
        ? ({ ...x, deleted_at: restore ? null : new Date().toISOString() } as FleetVehicle)
        : x,
    ),
  );
  pushDemoAudit(restore ? "vehicle_restored" : "vehicle_archived", {
    callsign: v.callsign,
    reason: reason.trim(),
  });
}

// ---------------------------------------------------------------------------
// Consultas e ações
// ---------------------------------------------------------------------------
export const adminVehiclesQuery = queryOptions({
  queryKey: ["admin", "vehicles"],
  queryFn: async (): Promise<AdminVehicle[]> => {
    if (isDemoSession()) return demoAdminVehicles();
    const rows = apiEnabled()
      ? (await apiGet<{ items: AdminVehicle[] }>("/v1/admin/vehicles")).items
      : await rpc<AdminVehicle[]>("admin_list_vehicles");
    return rows.map((v) => ({
      ...v,
      daily_rate_sol: Number(v.daily_rate_sol),
      revenue: Number(v.revenue),
      rentals_total: Number(v.rentals_total),
      rentals_active: Number(v.rentals_active),
    }));
  },
});

const apiBody = (f: VehicleForm) => ({
  name: f.name.trim(),
  callsign: normalizeCallsign(f.callsign),
  modelKey: f.modelKey,
  dailyRate: f.dailyRate,
  hangarId: f.hangarId,
  status: f.status,
  seats: f.seats,
  cargoKg: f.cargoKg,
  rangeKm: f.rangeKm,
  description: f.description.trim() || null,
  reason: f.reason.trim(),
});

export async function saveVehicle(id: string | null, form: VehicleForm): Promise<void> {
  if (isDemoSession()) return demoSave(id, form);
  if (apiEnabled()) {
    if (id) await apiPut(`/v1/admin/vehicles/${id}`, apiBody(form));
    else await apiPost("/v1/admin/vehicles", apiBody(form));
    return;
  }
  await rpc("admin_save_vehicle", {
    _id: id,
    _name: form.name.trim(),
    _callsign: normalizeCallsign(form.callsign),
    _model_key: form.modelKey,
    _daily_rate: form.dailyRate,
    _hangar_id: form.hangarId,
    _status: form.status,
    _seats: form.seats,
    _cargo_kg: form.cargoKg,
    _range_km: form.rangeKm,
    _description: form.description.trim() || null,
    _reason: form.reason.trim(),
  });
}

export async function archiveVehicle(id: string, reason: string): Promise<void> {
  if (isDemoSession()) return demoArchive(id, reason, false);
  if (apiEnabled()) {
    await apiPost(`/v1/admin/vehicles/${id}/archive`, { reason: reason.trim() });
    return;
  }
  await rpc("admin_archive_vehicle", { _id: id, _reason: reason.trim() });
}

export async function restoreVehicle(id: string, reason: string): Promise<void> {
  if (isDemoSession()) return demoArchive(id, reason, true);
  if (apiEnabled()) {
    await apiPost(`/v1/admin/vehicles/${id}/restore`, { reason: reason.trim() });
    return;
  }
  await rpc("admin_restore_vehicle", { _id: id, _reason: reason.trim() });
}
