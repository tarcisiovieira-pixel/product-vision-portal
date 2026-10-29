import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Battery, Filter, Wind } from "lucide-react";
import { PageHeader, Bar, toneFor } from "@/components/PageHeader";
import { statusLabel, vehiclesQuery, wearScore } from "@/lib/ares-data";

export const Route = createFileRoute("/app/maintenance")({
  head: () => ({ meta: [{ title: "Manutenção — ARES Mobility" }, { name: "description", content: "Telemetria e ordens de manutenção da frota marciana." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(vehiclesQuery),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>,
  component: Maintenance,
});

function Maintenance() {
  const { data } = useSuspenseQuery(vehiclesQuery);
  const vehicles = [...data].sort((a, b) => wearScore(b) - wearScore(a));
  const orders = vehicles.filter((v) => v.dust_filter_pct < 50 || v.battery_pct < 40 || v.status === "maintenance");
  const avg = (k: "battery_pct" | "dust_filter_pct") => Math.round(data.reduce((s, v) => s + v[k], 0) / (data.length || 1));

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <PageHeader kicker="Manutenção" title="Telemetria da frota" />
      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={Battery} label="Bateria média" value={`${avg("battery_pct")}%`} />
        <Stat icon={Filter} label="Filtro de sílica médio" value={`${avg("dust_filter_pct")}%`} />
        <Stat icon={AlertTriangle} label="Ordens abertas" value={String(orders.length)} warn={orders.length > 0} />
      </div>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-warning">Ordens de manutenção</h2>
        <div className="space-y-2">
          {orders.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border border-warning/40 bg-warning/5 px-4 py-3 font-mono text-xs">
              <span className="text-foreground">{v.callsign} · {v.name}</span>
              <span className="text-warning">
                {[v.dust_filter_pct < 50 && "Trocar filtro de sílica", v.battery_pct < 40 && "Recarga criogênica", v.status === "maintenance" && "Revisão em andamento"].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ordem aberta.</p>}
        </div>
      </section>

      <section className="overflow-x-auto border">
        <table className="w-full min-w-[720px] font-mono text-xs">
          <thead className="bg-surface text-left text-muted-foreground">
            <tr><th className="p-3">Veículo</th><th className="p-3">Status</th><th className="p-3">Bateria</th><th className="p-3">Filtro sílica</th><th className="p-3"><Wind className="inline h-3 w-3" /> O₂</th><th className="p-3">Desgaste</th></tr>
          </thead>
          <tbody className="divide-y">
            {vehicles.map((v) => {
              const w = wearScore(v);
              return (
                <tr key={v.id}>
                  <td className="p-3"><span className="text-primary">{v.callsign}</span><br /><span className="text-muted-foreground">{v.name}</span></td>
                  <td className="p-3">{statusLabel[v.status]}</td>
                  <td className="w-32 p-3"><span>{v.battery_pct}%</span><Bar value={v.battery_pct} tone={toneFor(v.battery_pct)} /></td>
                  <td className="w-32 p-3"><span>{v.dust_filter_pct}%</span><Bar value={v.dust_filter_pct} tone={toneFor(v.dust_filter_pct)} /></td>
                  <td className="p-3">{v.o2_hours} h</td>
                  <td className={`p-3 ${w > 50 ? "text-destructive" : w > 30 ? "text-warning" : "text-telemetry"}`}>{w}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, warn }: { icon: typeof Wind; label: string; value: string; warn?: boolean }) {
  return (
    <div className="cut-corner glass p-5">
      <Icon className={`h-5 w-5 ${warn ? "text-warning" : "text-telemetry"}`} />
      <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
    </div>
  );
}
