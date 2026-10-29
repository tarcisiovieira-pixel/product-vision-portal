import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { CloudLightning, Satellite } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { hangarsQuery, statusLabel, vehiclesQuery, weatherQuery } from "@/lib/ares-data";

const RadarGlobe = lazy(() => import("@/components/RadarGlobe"));

export const Route = createFileRoute("/app/mars-radar")({
  head: () => ({ meta: [{ title: "Radar Marte — ARES Mobility" }, { name: "description", content: "Rastreamento GPS da frota e tempestades de areia em tempo real." }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery),
      context.queryClient.ensureQueryData(hangarsQuery),
      context.queryClient.ensureQueryData(weatherQuery),
    ]),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>,
  component: MarsRadar,
});

function MarsRadar() {
  const qc = useQueryClient();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: weather } = useSuspenseQuery(weatherQuery);
  const [selected, setSelected] = useState<string>();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const ch = supabase
      .channel(`radar-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => qc.invalidateQueries({ queryKey: ["vehicles"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "weather_events" }, () => qc.invalidateQueries({ queryKey: ["weather"] }))
      .subscribe((s: string) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const active = weather.filter((w) => w.active);
  const sel = vehicles.find((v) => v.id === selected);

  return (
    <div className="space-y-6 p-6 md:p-10">
      <PageHeader kicker="Radar Marte" title="Rastreamento da frota">
        <span className={`flex items-center gap-2 font-mono text-xs ${live ? "text-telemetry" : "text-muted-foreground"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-telemetry" : "bg-muted-foreground"}`} />
          {live ? "AO VIVO" : "CONECTANDO..."}
        </span>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="cut-corner h-[560px] overflow-hidden border">
          <Suspense fallback={<div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">Sincronizando órbita...</div>}>
            <RadarGlobe vehicles={vehicles} hangars={hangars} weather={weather} selected={selected} onSelect={setSelected} />
          </Suspense>
        </div>
        <div className="space-y-4">
          <div className="glass space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-warning"><CloudLightning className="h-4 w-4" /> Tempestades ativas</h2>
            {active.map((w) => (
              <div key={w.id} className="border-l-2 border-warning pl-3 font-mono text-xs">
                <p className="text-foreground">{w.name}</p>
                <p className="text-muted-foreground">Sev {w.severity}/5 · {w.wind_speed_kmh} km/h · raio {w.radius_km} km</p>
              </div>
            ))}
            {active.length === 0 && <p className="text-xs text-muted-foreground">Céu limpo em todos os setores.</p>}
          </div>
          <div className="glass p-4">
            <h2 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-telemetry"><Satellite className="h-4 w-4" /> Frota GPS</h2>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {vehicles.map((v) => (
                <button key={v.id} onClick={() => setSelected(v.id)} className={`flex w-full justify-between px-2 py-1.5 font-mono text-xs ${v.id === selected ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}>
                  <span>{v.callsign}</span>
                  <span className="text-muted-foreground">{v.lat.toFixed(1)}°, {v.lng.toFixed(1)}°</span>
                </button>
              ))}
            </div>
          </div>
          {sel && (
            <div className="border border-telemetry/40 p-4 font-mono text-xs">
              <p className="text-telemetry">{sel.callsign} — {sel.name}</p>
              <p>{statusLabel[sel.status]} · ALT {sel.altitude_km} km</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
