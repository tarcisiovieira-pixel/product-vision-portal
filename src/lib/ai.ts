// IAs do app. O motor de regras (pasta shared/) roda no navegador e é a base de tudo;
// quando a API tem chave do Claude, ela só melhora a leitura do pedido e o texto da resposta.
import { queryOptions } from "@tanstack/react-query";
import { analyze, ruleSummary, type AnalyticsInput, type Insight } from "@shared/analytics";
import { parseNeeds, recommend, type ConsultContext, type ConsultResult } from "@shared/consult";
import { describeResult } from "@shared/consult-reply";
import { matchesSegment, SEGMENTS, type AdminOverview, type AdminUser } from "./admin";
import type { AdminVehicle } from "./admin-fleet";
import { apiEnabled, apiGet, apiPost } from "./api-client";
import { hasRealSession } from "./ares-data";
import { isDemoSession } from "./session";

export type AiMode = "llm" | "rules";

export interface AiStatus {
  generative: boolean;
  model: string | null;
}

/** Só uma conta real, com a API configurada, pode usar a IA generativa. */
const canUseApi = async () => apiEnabled() && !isDemoSession() && (await hasRealSession());

export const aiStatusQuery = queryOptions({
  queryKey: ["ai", "status"],
  staleTime: 5 * 60_000,
  queryFn: async (): Promise<AiStatus> => {
    if (!(await canUseApi())) return { generative: false, model: null };
    try {
      return await apiGet<AiStatus>("/v1/ai/status");
    } catch {
      return { generative: false, model: null };
    }
  },
});

// ---------------------------------------------------------------------------
// Consultoria
// ---------------------------------------------------------------------------
export interface ConsultResponse extends ConsultResult {
  mode: AiMode;
  /** Por que a IA generativa não foi usada, quando era esperada. */
  fallbackReason?: string;
  reply: string;
}

function localConsult(message: string, ctx: ConsultContext, reason: string): ConsultResponse {
  const result = recommend(parseNeeds(message, ctx.hangars), ctx);
  const names = new Map(ctx.vehicles.map((v) => [v.id, { name: v.name, callsign: v.callsign }]));
  return { mode: "rules", fallbackReason: reason, ...result, reply: describeResult(result, names) };
}

export async function askConsultant(
  message: string,
  local: ConsultContext,
): Promise<ConsultResponse> {
  if (isDemoSession()) return localConsult(message, local, "modo demo");
  if (!(await canUseApi())) return localConsult(message, local, "IA generativa não configurada");
  try {
    return await apiPost<ConsultResponse>("/v1/ai/consult", { message });
  } catch (error) {
    // Servidor fora do ar, dormindo ou sem a migration: o motor local responde do mesmo jeito.
    const reason = error instanceof Error ? error.message : "servidor indisponível";
    return localConsult(message, local, reason);
  }
}

// ---------------------------------------------------------------------------
// Analítica do painel
// ---------------------------------------------------------------------------
export function buildAnalyticsInput(
  overview: AdminOverview,
  users: AdminUser[],
  vehicles: AdminVehicle[],
): AnalyticsInput {
  const segments = Object.fromEntries(
    SEGMENTS.map((s) => [s.id, users.filter((u) => matchesSegment(u, s.id)).length]),
  ) as AnalyticsInput["segments"];
  return {
    users: overview.users,
    segments,
    rentals: overview.rentals,
    fleet: overview.fleet,
    vehicles: vehicles.map((v) => ({
      callsign: v.callsign,
      name: v.name,
      daily_rate_sol: v.daily_rate_sol,
      status: v.status,
      rentals_total: v.rentals_total,
      rentals_active: v.rentals_active,
      revenue: v.revenue,
      deleted_at: v.deleted_at,
    })),
  };
}

export const insightsFor = (input: AnalyticsInput): Insight[] => analyze(input);

export interface AiSummary {
  mode: AiMode;
  fallbackReason?: string;
  summary: string;
  priorities: string[];
}

export async function summarizeInsights(
  input: AnalyticsInput,
  insights: Insight[],
): Promise<AiSummary> {
  const local = (reason: string): AiSummary => ({
    mode: "rules",
    fallbackReason: reason,
    ...ruleSummary(insights),
  });
  if (isDemoSession()) return local("modo demo");
  if (!(await canUseApi())) return local("IA generativa não configurada");
  // Só agregados seguem para a API: nenhum e-mail, nome ou identificador de pessoa.
  const body = {
    totals: {
      users: input.users.total,
      pendingEmail: input.users.pending_email,
      newUsers7d: input.users.new_7d,
      activeUsers30d: input.users.active_30d,
      suspended: input.users.suspended,
      rentals: input.rentals.total,
      activeRentals: input.rentals.active,
      cancelledRentals: input.rentals.cancelled,
      revenue: Number(input.rentals.revenue),
      avgTicket: Number(input.rentals.avg_ticket),
      fleetTotal: input.fleet.total,
      fleetOccupied: input.fleet.occupied,
      fleetDown: input.fleet.maintenance + input.fleet.storm_hold,
    },
    insights: insights.slice(0, 15).map(({ id, severity, title, detail }) => ({
      id,
      severity,
      title,
      detail,
    })),
  };
  try {
    return await apiPost<AiSummary>("/v1/ai/analytics/summary", body);
  } catch (error) {
    return local(error instanceof Error ? error.message : "servidor indisponível");
  }
}
