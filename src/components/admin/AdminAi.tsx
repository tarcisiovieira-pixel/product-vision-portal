import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Sparkles } from "lucide-react";
import type { Insight, InsightAction, InsightSeverity } from "@shared/analytics";
import { totalsOf, trendInsights } from "@shared/analytics";
import { adminVehiclesQuery } from "@/lib/admin-fleet";
import { lastSnapshot, saveSnapshot } from "@/lib/ai-memory";
import { isDemoSession } from "@/lib/session";
import type { AdminOverview, AdminUser } from "@/lib/admin";
import {
  aiStatusQuery,
  buildAnalyticsInput,
  insightsFor,
  providerLabel,
  summarizeInsights,
} from "@/lib/ai";

const SEVERITY: Record<InsightSeverity, { label: string; className: string }> = {
  alert: { label: "Alerta", className: "border-destructive/60 bg-destructive/10 text-destructive" },
  warning: { label: "Atenção", className: "border-warning/60 bg-warning/10 text-warning" },
  opportunity: {
    label: "Oportunidade",
    className: "border-telemetry/60 bg-telemetry/10 text-telemetry",
  },
  info: { label: "Informativo", className: "border-border text-muted-foreground" },
};

export function AdminAi({
  overview,
  users,
  onAction,
}: {
  overview: AdminOverview;
  users: AdminUser[];
  onAction: (action: InsightAction) => void;
}) {
  const { data: vehicles = [] } = useQuery(adminVehiclesQuery);
  const { data: status } = useQuery(aiStatusQuery);

  const input = useMemo(
    () => buildAnalyticsInput(overview, users, vehicles),
    [overview, users, vehicles],
  );
  const totals = useMemo(() => totalsOf(input), [input]);
  // Memória do painel: compara com o último registro guardado.
  const { data: previous } = useQuery({
    queryKey: ["ai", "snapshot", isDemoSession()],
    queryFn: () => lastSnapshot(totals),
    staleTime: 5 * 60_000,
  });
  const insights = useMemo<Insight[]>(() => {
    const base = insightsFor(input);
    if (!previous) return base;
    const since = new Date(`${previous.taken_on}T12:00:00`).toLocaleDateString("pt-BR");
    return [...trendInsights(previous.data, totals, since), ...base];
  }, [input, previous, totals]);
  const summary = useMutation({
    mutationFn: async () => {
      const result = await summarizeInsights(input, insights);
      await saveSnapshot(totals); // guarda os números de hoje para a próxima comparação
      return result;
    },
  });

  return (
    <section aria-label="IA analítica" className="glass space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
          <Bot className="h-4 w-4" /> IA analítica · o que merece decisão hoje
        </h2>
        <span
          className="inline-flex items-center gap-1.5 border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground"
          title="Os achados vêm de regras sobre os indicadores. A IA generativa só escreve o resumo, com dados agregados: nenhum e-mail ou nome sai do painel."
        >
          <Sparkles className="h-3.5 w-3.5" />
          {status?.generative
            ? `Resumo por IA generativa (${providerLabel(status)})`
            : "Resumo por motor de regras"}
        </span>
      </div>

      <div className="space-y-2 border border-border/60 bg-background/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Resumo executivo
          </p>
          <button
            type="button"
            onClick={() => summary.mutate()}
            disabled={summary.isPending}
            className="border border-telemetry/60 bg-telemetry/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-telemetry transition hover:bg-telemetry/20 disabled:opacity-40"
          >
            {summary.isPending ? "Gerando..." : summary.data ? "Gerar de novo" : "Gerar resumo"}
          </button>
        </div>
        {summary.data ? (
          <div className="space-y-2 text-sm" data-testid="ai-summary">
            <p>{summary.data.summary}</p>
            {summary.data.priorities.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                {summary.data.priorities.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            )}
            {summary.data.fallbackReason && summary.data.mode === "rules" && status?.generative && (
              <p className="font-mono text-[11px] text-muted-foreground">
                Resumo do motor de regras: {summary.data.fallbackReason}.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Gere um resumo em linguagem natural dos achados abaixo.
          </p>
        )}
        {summary.isError && (
          <p role="alert" className="font-mono text-xs text-destructive">
            Não foi possível gerar o resumo agora.
          </p>
        )}
      </div>

      <ul className="space-y-2" data-testid="insights">
        {insights.map((insight) => (
          <li
            key={insight.id}
            className="flex flex-wrap items-start justify-between gap-3 border border-border/50 p-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                <span
                  className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase ${SEVERITY[insight.severity].className}`}
                >
                  {SEVERITY[insight.severity].label}
                </span>
                {insight.title}
              </p>
              <p className="text-xs text-muted-foreground">{insight.detail}</p>
            </div>
            {insight.action && (
              <button
                type="button"
                onClick={() => onAction(insight.action!)}
                className="shrink-0 border border-border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-foreground transition hover:border-telemetry hover:text-telemetry"
              >
                {insight.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
