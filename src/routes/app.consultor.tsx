import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, Compass, Send, Sparkles } from "lucide-react";
import type { ConsultContext } from "@shared/consult";
import { ADDON_CATALOG } from "@shared/addons";
import { PageHeader } from "@/components/PageHeader";
import { aiStatusQuery, askConsultant, type ConsultResponse } from "@/lib/ai";
import {
  categoryLabel,
  hangarsQuery,
  profileQuery,
  vehiclesQuery,
  weatherQuery,
} from "@/lib/ares-data";

export const Route = createFileRoute("/app/consultor")({
  head: () => ({
    meta: [
      { title: "Consultor IA — ARES Mobility" },
      {
        name: "description",
        content: "Conte o que você precisa e a IA indica o veículo, o trajeto e os adicionais.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery),
      context.queryClient.ensureQueryData(hangarsQuery),
      context.queryClient.ensureQueryData(weatherQuery),
    ]),
  errorComponent: ({ error }) => (
    <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>
  ),
  component: Consultor,
});

/** Parâmetros que abrem a Locadora já preenchida com a indicação. */
function prefillFor(rec: ConsultResponse["recommendations"][number]) {
  const search: { vehicle: string; pickup?: string; dropoff?: string; sols: number } = {
    vehicle: rec.vehicleId,
    sols: rec.days,
  };
  if (rec.pickupId) search.pickup = rec.pickupId;
  const dropoff = rec.dropoffId ?? rec.pickupId;
  if (dropoff) search.dropoff = dropoff;
  return search;
}

const money = (value: number) => `MC$ ${value.toLocaleString("pt-BR")}`;

const EXAMPLES = [
  "Somos 3 pessoas e queremos ir de Olympus a Jezero por 2 dias, o mais barato possível.",
  "Preciso levar 2 toneladas de equipamento de Valles até Gale.",
  "Viagem de casal, quero luxo e conforto, sem tempestade no caminho.",
  "Quero ir para a Lua com 4 pessoas.",
];

function Consultor() {
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: weather } = useSuspenseQuery(weatherQuery);
  const { data: profile } = useQuery(profileQuery);
  const { data: status } = useQuery(aiStatusQuery);
  const [message, setMessage] = useState("");

  const ctx = useMemo<ConsultContext>(
    () => ({
      vehicles,
      hangars,
      storms: weather,
      license: profile?.pilot_license ?? null,
      credits: profile ? Number(profile.martian_credits) : null,
    }),
    [vehicles, hangars, weather, profile],
  );

  const ask = useMutation({ mutationFn: (text: string) => askConsultant(text, ctx) });
  const result: ConsultResponse | undefined = ask.data;
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const hangarById = useMemo(() => new Map(hangars.map((h) => [h.id, h])), [hangars]);

  const submit = () => {
    const text = message.trim();
    if (text.length >= 3 && !ask.isPending) ask.mutate(text);
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <PageHeader
        kicker="Inteligência"
        title="Consultor IA"
        info="Descreva a viagem com as suas palavras. A IA entende o pedido, confere o catálogo, a sua habilitação, o saldo e o clima, e indica até 3 veículos com o custo exato."
      >
        <span
          className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] ${
            status?.generative
              ? "border-telemetry/60 bg-telemetry/10 text-telemetry"
              : "border-border text-muted-foreground"
          }`}
          title={
            status?.generative
              ? "O Claude lê o seu pedido e escreve a resposta. Veículos e preços vêm do catálogo."
              : "Sem IA generativa: o pedido é lido por regras. As indicações são as mesmas."
          }
        >
          <Sparkles className="h-3.5 w-3.5" />
          {status?.generative ? "IA generativa (Claude)" : "Motor de regras"}
        </span>
      </PageHeader>

      <section className="glass space-y-3 p-5" aria-label="Pedido">
        <label className="block font-mono text-xs text-muted-foreground" htmlFor="pedido">
          Conte o que você precisa
        </label>
        <textarea
          id="pedido"
          rows={3}
          maxLength={600}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          }}
          placeholder="Ex.: Somos 3 pessoas, de Olympus a Jezero, por 2 dias, até MC$ 3.000"
          className="w-full border border-border bg-background/50 px-3 py-2 font-mono text-sm text-foreground focus:border-telemetry focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setMessage(example)}
                className="border border-border px-2 py-1 text-left font-mono text-[11px] text-muted-foreground transition hover:border-telemetry hover:text-telemetry"
              >
                {example}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={message.trim().length < 3 || ask.isPending}
            className="inline-flex items-center gap-2 border border-telemetry/60 bg-telemetry/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-telemetry transition hover:bg-telemetry/20 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            {ask.isPending ? "Analisando..." : "Pedir indicação"}
          </button>
        </div>
      </section>

      {ask.isError && (
        <p role="alert" className="font-mono text-xs text-destructive">
          Não foi possível consultar agora. Tente novamente.
        </p>
      )}

      {result && (
        <section aria-label="Resposta" className="space-y-4">
          <div className="glass flex gap-3 p-5">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-telemetry" />
            <div className="space-y-2">
              <p className="text-sm text-foreground" data-testid="consult-reply">
                {result.reply}
              </p>
              {result.fallbackReason && result.mode === "rules" && status?.generative && (
                <p className="font-mono text-[11px] text-muted-foreground">
                  Resposta do motor de regras: {result.fallbackReason}.
                </p>
              )}
              {result.missing.length > 0 && result.recommendations.length > 0 && (
                <ul className="font-mono text-[11px] text-muted-foreground">
                  {result.missing.slice(0, 3).map((q) => (
                    <li key={q}>· {q}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {result.recommendations.map((rec, index) => {
              const v = vehicleById.get(rec.vehicleId);
              if (!v) return null;
              const pickup = rec.pickupId ? hangarById.get(rec.pickupId) : undefined;
              const dropoff = rec.dropoffId ? hangarById.get(rec.dropoffId) : undefined;
              return (
                <article
                  key={rec.vehicleId}
                  data-testid="consult-card"
                  className={`glass flex flex-col gap-3 p-5 ${index === 0 ? "border-telemetry/70" : ""}`}
                >
                  <header>
                    {index === 0 && (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-telemetry">
                        Melhor indicação · {rec.score}/100
                      </p>
                    )}
                    <h2 className="font-display text-lg font-bold">{v.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      {v.callsign} · {categoryLabel[v.category]}
                    </p>
                  </header>

                  <p className="font-display text-2xl font-bold text-foreground">
                    {money(rec.estimate.total)}
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                      {rec.days} {rec.days === 1 ? "sol" : "sóis"}
                    </span>
                  </p>
                  {rec.addons.length > 0 && (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Inclui: {rec.addons.map((a) => ADDON_CATALOG[a].label).join(", ")} (
                      {money(rec.estimate.addons)})
                    </p>
                  )}

                  {pickup && (
                    <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      <Compass className="h-3.5 w-3.5 text-primary" />
                      {pickup.name}
                      {dropoff ? ` → ${dropoff.name}` : ""}
                      {rec.route
                        ? ` · ${rec.route.distanceKm.toLocaleString("pt-BR")} km · ${rec.route.hours} h`
                        : ""}
                    </p>
                  )}

                  <ul className="space-y-1 text-xs text-foreground">
                    {rec.reasons.map((reason) => (
                      <li key={reason}>✓ {reason}</li>
                    ))}
                  </ul>
                  {rec.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="flex gap-1.5 border border-warning/40 bg-warning/10 p-2 text-xs text-warning"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {warning}
                    </p>
                  ))}

                  <Link
                    to="/app/booking"
                    search={prefillFor(rec)}
                    className="mt-auto border border-telemetry/60 bg-telemetry/10 px-3 py-2 text-center font-mono text-xs font-semibold uppercase tracking-wider text-telemetry transition hover:bg-telemetry/20"
                  >
                    Reservar este
                  </Link>
                </article>
              );
            })}
          </div>

          {result.notes.length > 0 && (
            <ul className="font-mono text-[11px] text-muted-foreground">
              {result.notes.map((note) => (
                <li key={note}>· {note}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
