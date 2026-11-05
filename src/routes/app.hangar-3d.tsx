import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { CalendarRange, Compass, Radio, ShieldCheck } from "lucide-react";
import { PageHeader, Bar, toneFor } from "@/components/PageHeader";
import {
  categoryLabel,
  getRequiredLicense,
  hangarsQuery,
  statusLabel,
  vehiclesQuery,
} from "@/lib/ares-data";

const HangarScene = lazy(() => import("@/components/HangarScene"));

export const Route = createFileRoute("/app/hangar-3d")({
  validateSearch: (search: Record<string, unknown>) => ({
    vehicleId: typeof search.vehicleId === "string" ? search.vehicleId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Hangar 3D — ARES Mobility" },
      { name: "description", content: "Inspeção 3D dos veículos da frota marciana." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery),
      context.queryClient.ensureQueryData(hangarsQuery),
    ]),
  errorComponent: ({ error }) => (
    <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>
  ),
  component: Hangar,
});

function Hangar() {
  const search = Route.useSearch();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const [id, setId] = useState(() =>
    search.vehicleId && vehicles.some((x) => x.id === search.vehicleId)
      ? search.vehicleId
      : vehicles[0]?.id,
  );

  useEffect(() => {
    if (search.vehicleId && vehicles.some((x) => x.id === search.vehicleId)) {
      setId(search.vehicleId);
    }
  }, [search.vehicleId, vehicles]);

  const v = vehicles.find((x) => x.id === id) ?? vehicles[0];

  if (!v) return <p className="p-10 text-muted-foreground">Nenhum veículo no hangar.</p>;
  const hangar = hangars.find((h) => h.id === v.hangar_id);

  return (
    <div className="space-y-6 p-6 md:p-10">
      <PageHeader kicker="Hangar 3D" title="Inspeção e Engenharia dos Veículos">
        <Link
          to="/app/mars-radar"
          className="cut-corner flex items-center gap-2 border border-telemetry/60 bg-telemetry/10 px-3.5 py-1.5 font-mono text-xs font-semibold text-telemetry hover:bg-telemetry/20 transition"
        >
          <Radio className="h-3.5 w-3.5" />
          <span>Ver Radar Marte</span>
        </Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr_300px]">
        {/* Lista de Seleção de Aeronaves */}
        <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-1 hud-scrollbar">
          {vehicles.map((x) => (
            <button
              key={x.id}
              onClick={() => setId(x.id)}
              className={`block w-full border px-3 py-2 text-left transition ${
                x.id === v.id
                  ? "border-primary bg-primary/10 shadow-glow"
                  : "hover:border-primary/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-primary font-bold">{x.callsign}</span>
                <span
                  className={`text-[9px] font-mono uppercase px-1 rounded ${
                    x.status === "in_flight"
                      ? "bg-telemetry/20 text-telemetry"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {statusLabel[x.status]}
                </span>
              </div>
              <span className="block text-sm font-semibold">{x.name}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {categoryLabel[x.category]}
                </span>
                {x.name.includes("Apex") && (
                  <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                    VIP
                  </span>
                )}
                {x.name.includes("Valkyrie") && (
                  <span className="text-[9px] px-1 rounded bg-primary/20 text-primary font-bold border border-primary/30">
                    GT SPORT
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Visualizador 3D Procedural */}
        <div className="cut-corner relative h-[540px] overflow-hidden border border-border/80 bg-[#06070a] shadow-2xl">
          <Suspense
            fallback={
              <div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">
                Renderizando geometrias procedurais do hangar...
              </div>
            }
          >
            <HangarScene category={v.category} callsign={v.callsign} name={v.name} />
          </Suspense>
          <div className="pointer-events-none absolute bottom-3 left-3 space-y-0.5 font-mono text-[10px] text-muted-foreground">
            <p className="text-telemetry">MODO: INSPEÇÃO TÉCNICA EM GARAGEM DOCADA</p>
            <p>ARRASTE PARA GIRAR · ROLE PARA ZOOM</p>
          </div>
        </div>

        {/* Especificações e Ficha Técnica */}
        <div className="glass space-y-4 p-5 font-mono text-xs">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold">
                {categoryLabel[v.category]}
              </p>
              {v.name.includes("Apex") && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                  LINHA EXECUTIVA VIP
                </span>
              )}
              {v.name.includes("Valkyrie") && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold border border-primary/40">
                  LINHA SUPER SPORT GT
                </span>
              )}
            </div>
            <h2 className="font-display text-2xl font-bold">{v.name}</h2>
            <p className="text-muted-foreground">{v.callsign}</p>
          </div>

          <div className="space-y-1 border-t pt-2">
            <p>
              Status: <span className="text-telemetry font-semibold">{statusLabel[v.status]}</span>
            </p>
            <p>
              Hangar Atual:{" "}
              <span className="text-foreground">
                {hangar?.name ?? "—"} ({hangar?.code ?? "—"})
              </span>
            </p>
            <p className="flex items-center gap-1.5 text-telemetry">
              <ShieldCheck className="h-3.5 w-3.5" />
              Licença Exigida: {getRequiredLicense(v.category)}
            </p>
          </div>

          <div className="space-y-3 border-t pt-2">
            <Metric label="Bateria de Grafeno" value={v.battery_pct} />
            <Metric label="Filtro de Sílica" value={v.dust_filter_pct} />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pressão Cabine</span>
              <span>{v.cabin_pressure_kpa ?? 101.3} kPa</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Propulsores</span>
              <span>{v.thruster_integrity ?? 100}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">O₂ Restante</span>
              <span>{v.o2_hours} h</span>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-muted-foreground">Diária Base:</p>
            <p className="font-display text-2xl font-bold text-foreground">
              MC$ {Number(v.daily_rate_sol).toLocaleString("pt-BR")}
              <span className="text-xs font-normal text-muted-foreground"> / Sol</span>
            </p>
            <Link
              to="/app/booking"
              className="cut-corner mt-4 flex items-center justify-center gap-2 bg-mars-gradient py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-glow"
            >
              <CalendarRange className="h-4 w-4" />
              Alugar na Locadora
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span>{value}%</span>
      </div>
      <Bar value={value} tone={toneFor(value)} />
    </div>
  );
}
