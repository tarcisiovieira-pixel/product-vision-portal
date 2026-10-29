import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Battery, CloudLightning, Plane, Rocket, Truck, Wind } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Bar, toneFor } from "@/components/PageHeader";
import {
  categoryLabel, hangarsQuery, rentalsQuery, statusLabel, vehiclesQuery, weatherQuery, type Vehicle,
} from "@/lib/ares-data";

export const Route = createFileRoute("/app/booking")({
  head: () => ({ meta: [{ title: "Locadora — ARES Mobility" }, { name: "description", content: "Reserve carros voadores, caminhões e foguetes em Marte." }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery),
      context.queryClient.ensureQueryData(hangarsQuery),
      context.queryClient.ensureQueryData(weatherQuery),
      context.queryClient.ensureQueryData(rentalsQuery),
    ]),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  component: Booking,
});

const icons = { car_vtol: Plane, space_truck: Truck, interplanetary_rocket: Rocket } as const;
const CURRENT_SOL = 4218;

function Booking() {
  const qc = useQueryClient();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: weather } = useSuspenseQuery(weatherQuery);
  const { data: rentals } = useSuspenseQuery(rentalsQuery);

  const [pickup, setPickup] = useState(hangars[0]?.id ?? "");
  const [dropoff, setDropoff] = useState(hangars[0]?.id ?? "");
  const [startSol, setStartSol] = useState(CURRENT_SOL + 1);
  const [sols, setSols] = useState(3);
  const [cat, setCat] = useState<Vehicle["category"] | "all">("all");

  const pickupHangar = hangars.find((h) => h.id === pickup);
  const list = useMemo(
    () => vehicles.filter((v) => v.hangar_id === pickup && (cat === "all" || v.category === cat)),
    [vehicles, pickup, cat],
  );
  const storm = weather.find((w) => w.active && w.severity >= 3);

  const book = useMutation({
    mutationFn: async (v: Vehicle) => {
      const { error } = await supabase.rpc("book_vehicle", {
        _vehicle_id: v.id, _pickup: pickup, _dropoff: dropoff, _start_sol: startSol, _end_sol: startSol + sols,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Reserva confirmada. Bom voo, colono!");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["rentals"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const hName = (id: string) => hangars.find((h) => h.id === id)?.name ?? "—";
  const vName = (id: string) => vehicles.find((v) => v.id === id)?.callsign ?? "—";

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <PageHeader kicker="Locadora" title="Para onde vamos hoje?">
        <span className="font-mono text-xs text-telemetry">SOL {CURRENT_SOL.toLocaleString("pt-BR")} · 09:42 LMST</span>
      </PageHeader>

      <div className="cut-corner glass grid gap-4 p-6 md:grid-cols-5">
        <Select label="Retirada" value={pickup} onChange={setPickup} options={hangars.map((h) => [h.id, h.name])} />
        <Select label="Devolução" value={dropoff} onChange={setDropoff} options={hangars.map((h) => [h.id, h.name])} />
        <NumberField label="Sol de início" value={startSol} min={CURRENT_SOL} onChange={setStartSol} />
        <NumberField label="Duração (sols)" value={sols} min={1} onChange={setSols} />
        <Select
          label="Categoria"
          value={cat}
          onChange={(v) => setCat(v as typeof cat)}
          options={[["all", "Todas"], ...Object.entries(categoryLabel)] as [string, string][]}
        />
      </div>

      {(pickupHangar?.storm_alert || storm) && (
        <div className="flex items-center gap-3 border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <CloudLightning className="h-4 w-4 shrink-0" />
          {pickupHangar?.storm_alert
            ? `Alerta de tempestade em ${pickupHangar.name} — decolagens podem ser retidas.`
            : `${storm!.name} ativa (${storm!.wind_speed_kmh} km/h) — rotas em ${storm!.sector} podem ter retenção.`}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {list.length === 0 && <p className="text-muted-foreground">Nenhum veículo nesse hangar para a categoria escolhida.</p>}
        {list.map((v) => {
          const Icon = icons[v.category];
          const total = Number(v.daily_rate_sol) * sols;
          const ok = v.status === "available";
          return (
            <div key={v.id} className="cut-corner flex flex-col border bg-surface p-6 transition hover:border-primary/60">
              <div className="flex items-center justify-between">
                <Icon className="h-7 w-7 text-primary" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{categoryLabel[v.category]}</span>
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold">{v.name}</h3>
              <p className="font-mono text-xs text-muted-foreground">{v.callsign} · <span className={ok ? "text-telemetry" : "text-warning"}>{statusLabel[v.status]}</span></p>
              <dl className="mt-4 space-y-2 font-mono text-xs">
                <Row k="O₂" v={`${v.o2_hours} h`} icon={Wind} />
                <Row k="Bateria" v={`${v.battery_pct}%`} icon={Battery} />
              </dl>
              <div className="mt-3"><Bar value={v.battery_pct} tone={toneFor(v.battery_pct)} /></div>
              <p className="mt-6 font-display text-2xl font-bold">MC$ {Number(v.daily_rate_sol).toLocaleString("pt-BR")}<span className="text-sm font-normal text-muted-foreground"> / Sol</span></p>
              <p className="font-mono text-xs text-muted-foreground">Total {sols} sols: MC$ {total.toLocaleString("pt-BR")}</p>
              <button
                disabled={!ok || book.isPending}
                onClick={() => book.mutate(v)}
                className="cut-corner mt-6 bg-mars-gradient py-3 text-sm font-semibold uppercase tracking-widest text-primary-foreground shadow-glow disabled:opacity-40"
              >
                {ok ? (book.isPending ? "Reservando..." : "Reservar") : "Indisponível"}
              </button>
            </div>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Minhas reservas</h2>
        {rentals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma reserva ainda.</p>
        ) : (
          <div className="divide-y border font-mono text-xs">
            {rentals.map((r) => (
              <div key={r.id} className="grid grid-cols-2 gap-2 p-3 md:grid-cols-5">
                <span className="text-primary">{vName(r.vehicle_id)}</span>
                <span>{hName(r.pickup_hangar_id)} → {hName(r.dropoff_hangar_id)}</span>
                <span>Sol {r.start_sol}–{r.end_sol}</span>
                <span>MC$ {Number(r.total_credits).toLocaleString("pt-BR")}</span>
                <span className="text-telemetry uppercase">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border bg-background/50 px-3 py-3 text-sm outline-none focus:border-primary">
        {options.map(([v, l]) => <option key={v} value={v} className="bg-surface">{l}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input type="number" value={value} min={min} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))} className="w-full border bg-background/50 px-3 py-3 font-mono text-sm outline-none focus:border-primary" />
    </label>
  );
}

function Row({ k, v, icon: Icon }: { k: string; v: string; icon?: typeof Wind }) {
  return (
    <div className="flex justify-between">
      <dt className="flex items-center gap-1 text-muted-foreground">{Icon && <Icon className="h-3 w-3" />}{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
