// IA analítica: lê os números do painel e aponta o que merece decisão hoje.
//
// Trabalha só com dados agregados (contagens, somas, indicativos de veículos). Nunca recebe
// e-mails nem dados pessoais, porque este é o resumo que pode seguir para o modelo de linguagem.

export type InsightSeverity = "alert" | "warning" | "opportunity" | "info";

export interface InsightAction {
  label: string;
  tab: "users" | "fleet";
  /** Segmento de usuários a filtrar (ids de UserSegment). */
  segment?: "pending" | "never_rented" | "inactive" | "low_balance" | "cancels_often" | "suspended";
}

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action?: InsightAction;
}

export interface AnalyticsInput {
  users: {
    total: number;
    confirmed: number;
    pending_email: number;
    new_7d: number;
    active_30d: number;
    with_rental: number;
    suspended: number;
  };
  /** Contagem de usuários por segmento de atenção. */
  segments: Record<
    "pending" | "never_rented" | "inactive" | "low_balance" | "cancels_often" | "suspended",
    number
  >;
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
    maintenance: number;
    storm_hold: number;
    occupied: number;
  };
  vehicles: {
    callsign: string;
    name: string;
    daily_rate_sol: number;
    status: string;
    rentals_total: number;
    rentals_active: number;
    revenue: number;
    deleted_at: string | null;
  }[];
}

const pct = (part: number, total: number) => (total > 0 ? part / total : 0);
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const brl = (n: number) => `MC$ ${Math.round(n).toLocaleString("pt-BR")}`;

const RANK: Record<InsightSeverity, number> = { alert: 0, warning: 1, opportunity: 2, info: 3 };

export function analyze(input: AnalyticsInput): Insight[] {
  const out: Insight[] = [];
  const { users, segments, rentals, fleet } = input;
  const live = input.vehicles.filter((v) => !v.deleted_at);

  if (users.total === 0) {
    return [
      {
        id: "empty",
        severity: "info",
        title: "Ainda não há usuários",
        detail: "Os indicadores aparecem assim que as primeiras contas forem criadas.",
      },
    ];
  }

  const pendingShare = pct(users.pending_email, users.total);
  if (users.pending_email >= 3 && pendingShare >= 0.15) {
    out.push({
      id: "pending-email",
      severity: "warning",
      title: "Muitos cadastros sem confirmar o e-mail",
      detail: `${users.pending_email} de ${users.total} contas (${fmtPct(pendingShare)}) não entram porque não confirmaram o e-mail. Vale revisar o texto e a entrega da mensagem de confirmação.`,
      action: { label: "Ver contas pendentes", tab: "users", segment: "pending" },
    });
  }

  if (segments.never_rented > 0 && pct(segments.never_rented, users.confirmed) >= 0.3) {
    out.push({
      id: "never-rented",
      severity: "opportunity",
      title: "Contas confirmadas que nunca reservaram",
      detail: `${segments.never_rented} usuários (${fmtPct(pct(segments.never_rented, users.confirmed))} dos confirmados) ainda não fizeram a primeira reserva. É a maior oportunidade de ativação.`,
      action: { label: "Ver quem nunca reservou", tab: "users", segment: "never_rented" },
    });
  }

  if (segments.inactive > 0) {
    out.push({
      id: "inactive",
      severity: "warning",
      title: "Clientes que sumiram",
      detail: `${segments.inactive} ${segments.inactive === 1 ? "cliente já reservou" : "clientes já reservaram"}, mas não entram há mais de 30 dias. Risco de perda.`,
      action: { label: "Ver inativos", tab: "users", segment: "inactive" },
    });
  }

  if (segments.low_balance > 0) {
    out.push({
      id: "low-balance",
      severity: "opportunity",
      title: "Saldo insuficiente para uma diária",
      detail: `${segments.low_balance} usuários têm menos de MC$ 1.000 e não conseguem reservar. Uma recarga ou campanha pode destravar reservas.`,
      action: { label: "Ver saldo baixo", tab: "users", segment: "low_balance" },
    });
  }

  if (segments.cancels_often > 0) {
    out.push({
      id: "cancels",
      severity: "warning",
      title: "Cancelamentos recorrentes",
      detail: `${segments.cancels_often} usuários cancelaram metade ou mais das reservas. Pode indicar preço, disponibilidade ou clima.`,
      action: { label: "Ver quem cancela", tab: "users", segment: "cancels_often" },
    });
  }

  if (rentals.total >= 5 && pct(rentals.cancelled, rentals.total) >= 0.25) {
    out.push({
      id: "cancel-rate",
      severity: "warning",
      title: "Taxa de cancelamento alta",
      detail: `${fmtPct(pct(rentals.cancelled, rentals.total))} das reservas foram canceladas (${rentals.cancelled} de ${rentals.total}).`,
    });
  }

  if (fleet.total > 0) {
    const occupancy = pct(fleet.occupied, fleet.total);
    const unavailable = fleet.maintenance + fleet.storm_hold;
    if (unavailable > 0 && pct(unavailable, fleet.total) >= 0.2) {
      out.push({
        id: "fleet-down",
        severity: "alert",
        title: "Parte da frota parada",
        detail: `${unavailable} de ${fleet.total} veículos estão em manutenção ou retidos por tempestade (${fmtPct(pct(unavailable, fleet.total))}).`,
        action: { label: "Abrir a frota", tab: "fleet" },
      });
    }
    if (occupancy < 0.3) {
      out.push({
        id: "low-occupancy",
        severity: "opportunity",
        title: "Frota com pouca ocupação",
        detail: `Só ${fmtPct(occupancy)} da frota está em uso. Há espaço para promoção ou revisão de preços.`,
        action: { label: "Abrir a frota", tab: "fleet" },
      });
    } else if (occupancy >= 0.8) {
      out.push({
        id: "high-occupancy",
        severity: "opportunity",
        title: "Frota quase lotada",
        detail: `${fmtPct(occupancy)} da frota está em uso. Considere ampliar a frota ou reajustar as diárias.`,
        action: { label: "Abrir a frota", tab: "fleet" },
      });
    }
  }

  const idle = live.filter((v) => v.rentals_total === 0 && v.status === "available");
  if (idle.length > 0 && rentals.total >= 5) {
    out.push({
      id: "idle-vehicles",
      severity: "info",
      title: "Veículos que nunca foram reservados",
      detail: `${idle.length === 1 ? "O veículo" : "Os veículos"} ${idle
        .slice(0, 4)
        .map((v) => v.callsign)
        .join(
          ", ",
        )}${idle.length > 4 ? " e outros" : ""} ${idle.length === 1 ? "não tem" : "não têm"} nenhuma reserva. Reveja diária e localização, ou arquive.`,
      action: { label: "Revisar na frota", tab: "fleet" },
    });
  }

  const totalRevenue = live.reduce((sum, v) => sum + Number(v.revenue), 0);
  const top = [...live].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0];
  if (top && totalRevenue > 0 && live.length >= 3 && Number(top.revenue) / totalRevenue >= 0.5) {
    out.push({
      id: "revenue-concentration",
      severity: "warning",
      title: "Receita concentrada em um veículo",
      detail: `${top.callsign} responde por ${fmtPct(Number(top.revenue) / totalRevenue)} da receita da frota (${brl(Number(top.revenue))}). Uma parada dele pesa muito no resultado.`,
      action: { label: "Abrir a frota", tab: "fleet" },
    });
  }

  if (users.suspended > 0) {
    out.push({
      id: "suspended",
      severity: "info",
      title: "Contas suspensas",
      detail: `${users.suspended} ${users.suspended === 1 ? "conta está suspensa" : "contas estão suspensas"}. Confirme se algum caso já pode ser reativado.`,
      action: { label: "Ver suspensos", tab: "users", segment: "suspended" },
    });
  }

  if (users.new_7d === 0 && users.total >= 5) {
    out.push({
      id: "no-signups",
      severity: "warning",
      title: "Nenhum cadastro novo em 7 dias",
      detail: "O crescimento parou na última semana.",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "all-good",
      severity: "info",
      title: "Nada fora do normal",
      detail: "Os indicadores estão dentro dos limites. Continue acompanhando.",
    });
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** Resumo em texto sem modelo de linguagem: serve de reserva e para o modo demo. */
export function ruleSummary(insights: readonly Pick<Insight, "severity" | "title" | "detail">[]): {
  summary: string;
  priorities: string[];
} {
  const first = insights[0];
  if (!first) return { summary: "Sem dados suficientes para analisar.", priorities: [] };
  const attention = insights.filter((i) => i.severity === "alert" || i.severity === "warning");
  const opportunities = insights.filter((i) => i.severity === "opportunity");
  return {
    summary:
      first.severity === "info"
        ? first.detail
        : `${attention.length} ${attention.length === 1 ? "ponto de atenção" : "pontos de atenção"} e ${opportunities.length} ${opportunities.length === 1 ? "oportunidade" : "oportunidades"}. O mais importante: ${first.title.toLowerCase()}.`,
    priorities: insights
      .filter((i) => i.severity !== "info")
      .slice(0, 3)
      .map((i) => i.title),
  };
}
