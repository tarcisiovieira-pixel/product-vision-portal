import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { PageHeader, Bar, toneFor } from "@/components/PageHeader";
import { categoryLabel, hangarsQuery, statusLabel, vehiclesQuery } from "@/lib/ares-data";

const HangarScene = lazy(() => import("@/components/HangarScene"));

export const Route = createFileRoute("/app/hangar-3d")({
  head: () => ({ meta: [{ title: "Hangar 3D — ARES Mobility" }, { name: "description", content: "Inspeção 3D dos veículos da frota marciana." }] }),
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(vehiclesQuery), context.queryClient.ensureQueryData(hangarsQuery)]),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>,
  component: Hangar,
});

function Hangar() {
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const [id, setId] = useState(vehicles[0]?.id);
  const v = vehicles.find((x) => x.id === id) ?? vehicles[0];
  if (!v) return <p className="p-10 text-muted-foreground">Nenhum veículo no hangar.</p>;
  const hangar = hangars.find((h) => h.id === v.hangar_id);

  return (
    <div className="space-y-6 p-6 md:p-10">
      <PageHeader kicker="Hangar 3D" title="Inspeção de veículo" />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr_280px]">
        <div className="space-y-1">
          {vehicles.map((x) => (
            <button key={x.id} onClick={() => setId(x.id)} className={`block w-full border px-3 py-2 text-left transition ${x.id === v.id ? "border-primary bg-primary/10" : "hover:border-primary/40"}`}>
              <span className="block font-mono text-xs text-primary">{x.callsign}</span>
              <span className="block text-sm">{x.name}</span>
            </button>
          ))}
        </div>
        <div className="cut-corner relative h-[520px] overflow-hidden border">
          <Suspense fallback={<div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">Carregando hangar...</div>}>
            <HangarScene category={v.category} />
          </Suspense>
          <p className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] text-muted-foreground">ARRASTE PARA GIRAR · ROLE PARA ZOOM</p>
        </div>
        <div className="glass space-y-4 p-5 font-mono text-xs">
          <p className="text-muted-foreground">{categoryLabel[v.category]}</p>
          <h2 className="font-display text-2xl">{v.name}</h2>
          <p>Status: <span className="text-telemetry">{statusLabel[v.status]}</span></p>
          <p>Hangar: {hangar?.name ?? "—"}</p>
          <Metric label="Bateria" value={v.battery_pct} />
          <Metric label="Filtro de sílica" value={v.dust_filter_pct} />
          <p>O₂ restante: {v.o2_hours} h</p>
          <p>Altitude: {v.altitude_km} km</p>
          <p>Diária: MC$ {Number(v.daily_rate_sol).toLocaleString("pt-BR")}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}%</span></div>
      <Bar value={value} tone={toneFor(value)} />
    </div>
  );
}
