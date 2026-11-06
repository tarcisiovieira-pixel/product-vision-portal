// Painel administrativo. A permissão real está no banco; aqui só há apresentação.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "./ares-data";
import { DEMO_ADMIN_AUDIT, DEMO_ADMIN_OVERVIEW, DEMO_ADMIN_USERS } from "./admin-demo";
import { apiEnabled, apiGet, apiPost } from "./api-client";
import { isDemoSession } from "./session";

export interface AdminOverview {
  generated_at: string;
  users: {
    total: number;
    confirmed: number;
    pending_email: number;
    new_7d: number;
    new_30d: number;
    active_30d: number;
    with_rental: number;
    suspended: number;
  };
  rentals: {
    total: number;
    active: number;
    cancelled: number;
    revenue: number;
    avg_ticket: number;
  };
  fleet: {
    total: number;
    available: number;
    in_flight: number;
    maintenance: number;
    storm_hold: number;
    occupied: number;
  };
  finance: {
    credits_circulating: number;
    maintenance_revenue: number;
    marketplace_revenue: number;
    marketplace_sales: number;
  };
  signups_by_day: { day: string; count: number }[];
  top_vehicles: { callsign: string; name: string; rentals: number; revenue: number }[];
}

export interface AdminUser {
  user_id: string;
  email: string;
  credential: string | null;
  pilot_license: Profile["pilot_license"] | null;
  credits: number;
  reputation: number;
  flight_hours: number;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  rentals_total: number;
  rentals_active: number;
  rentals_cancelled: number;
  spent: number;
  suspended: boolean;
  suspended_reason: string | null;
  is_admin: boolean;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  admin_email: string | null;
  target_email: string | null;
}

type RpcClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// Em caso de falha fica falso: antes da migration, o painel simplesmente não aparece.
export const adminStatusQuery = queryOptions({
  queryKey: ["admin", "status"],
  queryFn: async (): Promise<boolean> => {
    if (isDemoSession()) return true;
    try {
      return await rpc<boolean>("is_admin");
    } catch {
      return false;
    }
  },
});

export const adminOverviewQuery = queryOptions({
  queryKey: ["admin", "overview"],
  queryFn: async (): Promise<AdminOverview> => {
    if (isDemoSession()) return DEMO_ADMIN_OVERVIEW;
    if (apiEnabled()) return apiGet<AdminOverview>("/v1/admin/overview");
    return rpc<AdminOverview>("admin_overview");
  },
});

export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: async (): Promise<AdminUser[]> => {
    if (isDemoSession()) return DEMO_ADMIN_USERS;
    const rows = apiEnabled()
      ? (await apiGet<{ items: AdminUser[] }>("/v1/admin/users")).items
      : await rpc<AdminUser[]>("admin_list_users");
    return rows.map((u) => ({
      ...u,
      credits: Number(u.credits),
      spent: Number(u.spent),
      rentals_total: Number(u.rentals_total),
      rentals_active: Number(u.rentals_active),
      rentals_cancelled: Number(u.rentals_cancelled),
    }));
  },
});

export const adminAuditQuery = queryOptions({
  queryKey: ["admin", "audit"],
  queryFn: async (): Promise<AdminAuditEntry[]> => {
    if (isDemoSession()) return DEMO_ADMIN_AUDIT;
    if (apiEnabled()) {
      return (await apiGet<{ items: AdminAuditEntry[] }>("/v1/admin/audit?limit=20")).items;
    }
    return rpc<AdminAuditEntry[]>("admin_list_audit", { _limit: 20 });
  },
});

function assertNotDemo(): void {
  if (isDemoSession()) throw new Error("No modo demo o painel é somente leitura.");
}

export async function adjustCredits(userId: string, delta: number, reason: string): Promise<void> {
  assertNotDemo();
  if (apiEnabled()) {
    await apiPost(`/v1/admin/users/${userId}/credits`, { delta, reason });
    return;
  }
  await rpc("admin_adjust_credits", { _user_id: userId, _delta: delta, _reason: reason });
}

export async function setLicense(
  userId: string,
  license: Profile["pilot_license"],
  reason: string,
): Promise<void> {
  assertNotDemo();
  if (apiEnabled()) {
    await apiPost(`/v1/admin/users/${userId}/license`, { license, reason });
    return;
  }
  await rpc("admin_set_license", { _user_id: userId, _license: license, _reason: reason });
}

export async function setSuspended(
  userId: string,
  suspended: boolean,
  reason: string,
): Promise<void> {
  assertNotDemo();
  if (apiEnabled()) {
    await apiPost(`/v1/admin/users/${userId}/suspension`, { suspended, reason });
    return;
  }
  await rpc("admin_set_suspended", { _user_id: userId, _suspended: suspended, _reason: reason });
}

// ---------------------------------------------------------------------------
// Regras de atenção: viram contadores clicáveis e filtros da tabela.
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
export const LOW_BALANCE = 1000;
export const INACTIVE_DAYS = 30;

export type UserSegment =
  "all" | "pending" | "never_rented" | "inactive" | "low_balance" | "cancels_often" | "suspended";

export const SEGMENTS: { id: Exclude<UserSegment, "all">; label: string; hint: string }[] = [
  {
    id: "pending",
    label: "E-mail pendente",
    hint: "Cadastro feito, mas sem confirmar o e-mail: ainda não consegue entrar.",
  },
  {
    id: "never_rented",
    label: "Nunca reservaram",
    hint: "Conta confirmada e sem nenhuma reserva: oportunidade de ativação.",
  },
  {
    id: "inactive",
    label: `Inativos há ${INACTIVE_DAYS}+ dias`,
    hint: `Já reservaram, mas não entram há mais de ${INACTIVE_DAYS} dias: risco de perda.`,
  },
  {
    id: "low_balance",
    label: "Saldo baixo",
    hint: `Menos de MC$ ${LOW_BALANCE.toLocaleString("pt-BR")}: não conseguem pagar uma diária.`,
  },
  {
    id: "cancels_often",
    label: "Cancelam muito",
    hint: "Duas ou mais reservas canceladas, e ao menos metade do total.",
  },
  { id: "suspended", label: "Suspensos", hint: "Contas impedidas de reservar e comprar." },
];

export function matchesSegment(u: AdminUser, segment: UserSegment, now = Date.now()): boolean {
  switch (segment) {
    case "all":
      return true;
    case "pending":
      return !u.email_confirmed;
    case "never_rented":
      return u.email_confirmed && u.rentals_total === 0;
    case "inactive": {
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
      return u.rentals_total > 0 && now - last > INACTIVE_DAYS * DAY_MS;
    }
    case "low_balance":
      return u.email_confirmed && u.credits < LOW_BALANCE;
    case "cancels_often":
      return u.rentals_cancelled >= 2 && u.rentals_cancelled / u.rentals_total >= 0.5;
    case "suspended":
      return u.suspended;
  }
}

/** Fração de 0 a 1, sem dividir por zero. */
export const ratio = (part: number, total: number) => (total > 0 ? part / total : 0);

export const percent = (value: number) =>
  `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const CSV_COLUMNS: [string, (u: AdminUser) => string | number][] = [
  ["email", (u) => u.email],
  ["credencial", (u) => u.credential ?? ""],
  ["habilitacao", (u) => u.pilot_license ?? ""],
  ["creditos", (u) => u.credits],
  ["reservas", (u) => u.rentals_total],
  ["ativas", (u) => u.rentals_active],
  ["canceladas", (u) => u.rentals_cancelled],
  ["gasto", (u) => u.spent],
  ["cadastro", (u) => u.created_at],
  ["ultimo_acesso", (u) => u.last_sign_in_at ?? ""],
  ["suspenso", (u) => (u.suspended ? "sim" : "nao")],
];

function csvCell(value: string | number): string {
  let text = String(value);
  // Evita que uma planilha execute fórmula escrita em um campo do usuário.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function usersToCsv(users: AdminUser[]): string {
  const header = CSV_COLUMNS.map(([name]) => name).join(",");
  const rows = users.map((u) => CSV_COLUMNS.map(([, get]) => csvCell(get(u))).join(","));
  return [header, ...rows].join("\n");
}
