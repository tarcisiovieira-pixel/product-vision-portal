import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { isDemoSession } from "@/lib/session";
import { InfoTip } from "@/components/InfoTip";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  CloudLightning,
  Gauge,
  Navigation,
  Radio,
  Rocket,
  Satellite,
  ShieldAlert,
  Sparkles,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import {
  hangarsQuery,
  statusLabel,
  vehiclesQuery,
  weatherQuery,
  type Vehicle,
} from "@/lib/ares-data";
import { useLiveTelemetry } from "@/lib/telemetry-engine";
import { FlightChaseViewer3D } from "@/components/FlightChaseViewer3D";

const RadarGlobe = lazy(() => import("@/components/RadarGlobe"));

export const Route = createFileRoute("/app/mars-radar")({
  head: () => ({
    meta: [
      { title: "Radar Marte — Rastreamento 3D da Frota & Percurso — ARES Mobility" },
      {
        name: "description",
        content: "Rastreamento GPS da frota e percurso 3D das naves em tempo real.",
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
  component: MarsRadar,
});

function MarsRadar() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: weather } = useSuspenseQuery(weatherQuery);

  const [selected, setSelected] = useState<string>();
  const [live, setLive] = useState(false);
  const [chasingVehicle, setChasingVehicle] = useState<Vehicle | null>(null);

  // Motor de Telemetria ao Vivo
  const { simulatedVehicles, simulatedStorms, activeAlerts } = useLiveTelemetry(
    vehicles,
    weather,
    hangars,
  );

  useEffect(() => {
    if (isDemoSession()) return; // o sandbox não tem dados ao vivo
    const ch = supabase
      .channel(`radar-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () =>
        qc.invalidateQueries({ queryKey: ["vehicles"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "weather_events" }, () =>
        qc.invalidateQueries({ queryKey: ["weather"] }),
      )
      .subscribe((s: string) => setLive(s === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const activeStorms = simulatedStorms.filter((w) => w.active);
  const sel = simulatedVehicles.find((v) => v.id === selected) || simulatedVehicles[0];
  const assignedHangar = hangars.find((h) => h.id === sel?.hangar_id);

  // Nave atualmente em voo ativo para o botão do cabeçalho
  const activeInFlightCraft =
    simulatedVehicles.find((v) => v.status === "in_flight") || simulatedVehicles[1] || sel;

  return (
    <div className="space-y-6 p-6 md:p-10">
      <PageHeader
        kicker="Radar"
        title="Frota em tempo real"
        info="Naves em voo se movem pelo globo. Clique em uma nave para ver telemetria e ações."
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2 font-mono text-xs text-telemetry">
            <Radio className="h-4 w-4 animate-pulse" />
            1.420 GHz
          </span>
          <span
            className={`flex items-center gap-2 font-mono text-xs ${live ? "text-telemetry" : "text-muted-foreground"}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-telemetry" : "bg-muted-foreground"}`}
            />
            {live ? "AO VIVO" : "SIMULAÇÃO"}
          </span>
          <button
            type="button"
            disabled={!activeInFlightCraft}
            onClick={() => activeInFlightCraft && setChasingVehicle(activeInFlightCraft)}
            className="cut-corner flex items-center gap-2 border border-telemetry/80 bg-telemetry/15 px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-telemetry hover:bg-telemetry/25 transition shadow-glow"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Acompanhar Percurso 3D ({activeInFlightCraft?.callsign ?? "—"})</span>
          </button>
        </div>
      </PageHeader>

      {/* Alertas Ativos de Risco / Tempestade */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alt) => (
            <div
              key={alt.id}
              className="flex items-center gap-3 border border-warning/50 bg-warning/10 px-4 py-2.5 font-mono text-xs text-warning"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{alt.message}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{alt.solTime}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Globo 3D com Marte, Luas, Partículas e Modelos das Naves */}
        <div className="cut-corner relative h-[640px] overflow-hidden border border-border/70 bg-[#050609] shadow-2xl">
          <Suspense
            fallback={
              <div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">
                Sincronizando com constelação de satélites...
              </div>
            }
          >
            <RadarGlobe
              vehicles={simulatedVehicles}
              hangars={hangars}
              weather={simulatedStorms}
              selected={selected}
              onSelect={setSelected}
              onChaseVehicle={(v) => setChasingVehicle(v)}
              onInspectHangar={(v) =>
                navigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } })
              }
              onOpenMaintenance={() => navigate({ to: "/app/maintenance" })}
            />
          </Suspense>

          <div className="pointer-events-none absolute bottom-4 left-4 space-y-1 font-mono text-[10px] text-muted-foreground">
            <p className="flex items-center gap-1.5 text-telemetry">
              <Zap className="h-3 w-3" /> CLIQUE EM UMA NAVE PARA VER DETALHES
            </p>
          </div>

          <div className="absolute top-4 right-4 flex items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => {
                const next = sel?.status === "in_flight" ? sel : activeInFlightCraft;
                if (next) setChasingVehicle(next);
              }}
              className="glass cut-corner flex items-center gap-1.5 border border-telemetry/60 px-3 py-1.5 text-telemetry hover:bg-telemetry/15 transition"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Chase Cam Voo</span>
            </button>
          </div>
        </div>

        {/* Painel Lateral de Controle e Telemetria */}
        <div className="space-y-4">
          {/* Veículo Selecionado */}
          {sel ? (
            <div className="glass space-y-3 border-l-2 border-l-telemetry p-4 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-telemetry font-bold">{sel.callsign}</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    sel.status === "in_flight"
                      ? "bg-telemetry/20 text-telemetry border border-telemetry/50"
                      : sel.status === "available"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : sel.status === "maintenance"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-destructive/20 text-destructive border border-destructive/40"
                  }`}
                >
                  {sel.status === "available"
                    ? "Docada no Hangar"
                    : sel.status === "in_flight"
                      ? "Em Voo Ativo"
                      : statusLabel[sel.status]}
                </span>
              </div>
              <p className="font-display text-lg text-foreground font-bold">{sel.name}</p>

              {/* Informação de Localização Fisiográfica */}
              <div className="bg-background/60 p-2 border border-border/50 text-[11px] space-y-0.5">
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">
                  {sel.status === "in_flight"
                    ? "Trajetória Orbital"
                    : "Base de Estacionamento / Garagem"}
                  :
                </span>
                <span className="font-semibold text-foreground">
                  {sel.status === "in_flight"
                    ? "Corredor Olympus-Jezero (Suborbital)"
                    : `${assignedHangar?.name ?? "Base Principal"} (${assignedHangar?.code ?? "OLY-01"})`}
                </span>
              </div>

              {sel.inStorm && (
                <div className="flex items-center gap-2 border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-warning">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>EM ÁREA DE TEMPESTADE (SEV {sel.stormSeverityWarning}/5)</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground">VELOCIDADE:</span>
                  <p className="font-bold text-foreground">
                    {sel.status === "in_flight"
                      ? `${sel.simSpeedKmh.toLocaleString("pt-BR")} km/h`
                      : "0 km/h (Estática)"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">ALTITUDE:</span>
                  <p className="font-bold text-primary">
                    {sel.status === "in_flight"
                      ? `${sel.simAltitudeKm.toFixed(1)} km`
                      : "0.0 km (Solo)"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">PRESSÃO CABINE:</span>
                  <p className="text-foreground">{sel.cabin_pressure_kpa ?? 101.3} kPa</p>
                </div>
                <div>
                  <span className="text-muted-foreground">BATERIA:</span>
                  <p className="font-bold text-emerald-400">{sel.battery_pct}%</p>
                </div>
                <div>
                  <span className="text-muted-foreground">FILTRO SÍLICA:</span>
                  <p
                    className={
                      sel.dust_filter_pct < 50 ? "text-warning font-bold" : "text-foreground"
                    }
                  >
                    {sel.dust_filter_pct}%
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">O₂ SUPORTE:</span>
                  <p className="text-foreground">{sel.o2_hours} h</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                COORD: {sel.lat.toFixed(2)}°N, {sel.lng.toFixed(2)}°E
              </p>

              {/* Botões de Ação Dinâmicos Conforme Status Real */}
              {sel.status === "in_flight" ? (
                <button
                  type="button"
                  onClick={() => setChasingVehicle(sel)}
                  className="cut-corner mt-3 flex w-full items-center justify-center gap-2 border border-telemetry bg-telemetry/15 py-2.5 font-bold uppercase tracking-wider text-telemetry hover:bg-telemetry/25 transition shadow-glow"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Acompanhar Voo em Tempo Real 3D</span>
                </button>
              ) : sel.status === "available" ? (
                <div className="space-y-2 mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: "/app/hangar-3d", search: { vehicleId: sel.id } })
                    }
                    className="cut-corner flex w-full items-center justify-center gap-2 border border-emerald-500/80 bg-emerald-500/15 py-2.5 font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/25 transition shadow-glow"
                  >
                    <Building2 className="h-4 w-4" />
                    <span>Inspecionar na Garagem / Hangar 3D</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChasingVehicle(sel)}
                    className="flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-telemetry transition pt-1"
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    <span>Simular Teste de Decolagem 3D</span>
                  </button>
                </div>
              ) : sel.status === "maintenance" ? (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/app/maintenance" })}
                  className="cut-corner mt-3 flex w-full items-center justify-center gap-2 border border-amber-500/80 bg-amber-500/15 py-2.5 font-bold uppercase tracking-wider text-amber-400 hover:bg-amber-500/25 transition"
                >
                  <Wrench className="h-4 w-4" />
                  <span>Ver Baia Técnica & Diagnóstico</span>
                </button>
              ) : (
                <div className="mt-3 border border-warning/40 bg-warning/10 p-2.5 text-center text-[11px] text-warning">
                  Aeronave protegida em abrigo subterrâneo devido à tempestade severa.
                </div>
              )}
            </div>
          ) : (
            <div className="glass p-4 font-mono text-xs text-muted-foreground">
              Selecione uma aeronave no globo ou na lista abaixo para inspecionar a telemetria ao
              vivo.
            </div>
          )}

          {/* Monitor de Tempestades */}
          <div className="glass space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-warning font-bold">
              <CloudLightning className="h-4 w-4" /> Tempestades de Areia ({activeStorms.length})
            </h2>
            {activeStorms.map((w) => (
              <div key={w.id} className="border-l-2 border-warning pl-3 font-mono text-xs">
                <p className="font-semibold text-foreground">{w.name}</p>
                <p className="text-muted-foreground">
                  Severidade {w.severity}/5
                  <InfoTip label={`Detalhes de ${w.name}`} className="ml-1.5">
                    Vento {w.wind_speed_kmh} km/h · Raio {w.pulseRadiusKm} km · Radiação{" "}
                    {w.radiation_msv ?? 0.15} mSv/h
                  </InfoTip>
                </p>
              </div>
            ))}
            {activeStorms.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma tempestade ativa no momento.</p>
            )}
          </div>

          {/* Rastreamento da Frota (FROTA GPS) com Scrollbar Futurista */}
          <div className="glass p-4">
            <h2 className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-telemetry font-bold">
              <span className="flex items-center gap-2">
                <Satellite className="h-4 w-4" /> Frota GPS ({simulatedVehicles.length})
              </span>
              <span className="text-[10px] text-muted-foreground font-normal">Ao vivo</span>
            </h2>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1.5 hud-scrollbar">
              {simulatedVehicles.map((v) => {
                const isSelected = v.id === selected;
                const isFlight = v.status === "in_flight";
                const isAvailable = v.status === "available";
                const isMaint = v.status === "maintenance";

                return (
                  <button
                    key={v.id}
                    onClick={() => setSelected(v.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 font-mono text-xs transition border ${
                      isSelected
                        ? "bg-primary/20 text-primary border-primary/60 font-bold shadow-glow"
                        : "border-border/40 hover:border-telemetry/40 hover:bg-muted/60"
                    }`}
                  >
                    <div className="text-left flex items-center gap-2">
                      <span
                        className={isSelected ? "text-primary" : "text-foreground font-semibold"}
                      >
                        {v.callsign}
                      </span>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-normal ${
                          isFlight
                            ? "bg-telemetry/20 text-telemetry"
                            : isAvailable
                              ? "bg-emerald-500/15 text-emerald-400"
                              : isMaint
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {isFlight
                          ? "Em voo"
                          : isAvailable
                            ? "Hangar"
                            : isMaint
                              ? "Manutenção"
                              : "Abrigo"}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] ${isFlight ? "text-telemetry font-bold" : "text-muted-foreground"}`}
                    >
                      {isFlight ? `${v.simSpeedKmh} km/h` : "0 km/h"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal / Visualizador de Percurso 3D (Chase Cam & Cockpit) */}
      {chasingVehicle && (
        <FlightChaseViewer3D
          vehicle={chasingVehicle}
          allVehicles={simulatedVehicles}
          hangars={hangars}
          onClose={() => setChasingVehicle(null)}
          onSelectVehicle={(v) => {
            if (v.status !== "in_flight") {
              setChasingVehicle(null);
              navigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
            } else {
              setChasingVehicle(v);
            }
          }}
          onNavigateHangar={(v) => {
            setChasingVehicle(null);
            navigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
          }}
        />
      )}
    </div>
  );
}
