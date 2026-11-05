import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Battery,
  CheckCircle2,
  Filter,
  Flame,
  Hammer,
  Shield,
  Sparkles,
  Wind,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Bar, toneFor } from "@/components/PageHeader";
import {
  MAINTENANCE_SERVICES,
  maintenanceLogsQuery,
  statusLabel,
  vehiclesQuery,
  wearScore,
  type Vehicle,
} from "@/lib/ares-data";

const HangarScene = lazy(() => import("@/components/HangarScene"));

export const Route = createFileRoute("/app/maintenance")({
  head: () => ({
    meta: [
      { title: "Manutenção & Diagnóstico 3D — ARES Mobility" },
      {
        name: "description",
        content: "Telemetria, hotspots 3D e ordens de manutenção da frota marciana.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery),
      context.queryClient.ensureQueryData(maintenanceLogsQuery),
    ]),
  errorComponent: ({ error }) => (
    <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>
  ),
  component: Maintenance,
});

function Maintenance() {
  const qc = useQueryClient();
  const { data: vehiclesData } = useSuspenseQuery(vehiclesQuery);
  const { data: logsData } = useSuspenseQuery(maintenanceLogsQuery);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehiclesData[0]?.id ?? "");
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>("dust");

  const currentVehicle = vehiclesData.find((v) => v.id === selectedVehicleId) ?? vehiclesData[0];
  const sortedVehicles = [...vehiclesData].sort((a, b) => wearScore(b) - wearScore(a));
  const openOrders = sortedVehicles.filter(
    (v) => v.dust_filter_pct < 50 || v.battery_pct < 40 || v.status === "maintenance",
  );

  const avgBattery = Math.round(
    vehiclesData.reduce((s, v) => s + v.battery_pct, 0) / (vehiclesData.length || 1),
  );
  const avgDustFilter = Math.round(
    vehiclesData.reduce((s, v) => s + v.dust_filter_pct, 0) / (vehiclesData.length || 1),
  );

  // Executar Serviço de Manutenção via RPC Supabase
  const executeService = useMutation({
    mutationFn: async ({ serviceKey, vehicle }: { serviceKey: string; vehicle: Vehicle }) => {
      const isDemo = typeof window !== "undefined" && !!localStorage.getItem("ares_demo_session");
      if (isDemo) {
        const cost = MAINTENANCE_SERVICES[serviceKey]?.cost ?? 450;
        const newLog = {
          id: `m-log-${Date.now()}`,
          vehicle_id: vehicle.id,
          service_type: serviceKey,
          cost_credits: cost,
          status: "completed",
          notes: `Ordem de serviço autorizada pela Central de Manutenção ARES para ${vehicle.callsign}`,
          technician_callsign: "ENG-DEMO-01",
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        };
        const currentLogs = JSON.parse(localStorage.getItem("ares_local_maintenance_logs") || "[]");
        localStorage.setItem(
          "ares_local_maintenance_logs",
          JSON.stringify([newLog, ...currentLogs]),
        );

        const demoRaw = localStorage.getItem("ares_demo_session");
        if (demoRaw) {
          const demoObj = JSON.parse(demoRaw);
          demoObj.martian_credits = Math.max(0, demoObj.martian_credits - cost);
          localStorage.setItem("ares_demo_session", JSON.stringify(demoObj));
        }
        return serviceKey;
      }

      // 1. Tenta chamar a RPC execute_maintenance
      const { data, error } = await supabase.rpc("execute_maintenance", {
        _vehicle_id: vehicle.id,
        _service_type: serviceKey,
        _notes: `Ordem de serviço autorizada pela Central de Manutenção ARES para ${vehicle.callsign}`,
      });

      if (error) {
        // Fallback defensivo com update direto na tabela caso a migration ainda não esteja propagada
        let updatePayload: Partial<Vehicle> = { status: "available" };
        if (serviceKey === "silica_clean")
          updatePayload = { dust_filter_pct: 100, status: "available" };
        if (serviceKey === "cryo_recharge")
          updatePayload = { battery_pct: 100, status: "available" };
        if (serviceKey === "o2_refill") {
          updatePayload = {
            o2_hours:
              vehicle.category === "interplanetary_rocket"
                ? 900
                : vehicle.category === "space_truck"
                  ? 120
                  : 40,
            status: "available",
          };
        }
        if (serviceKey === "thruster_calibration")
          updatePayload = { thruster_integrity: 100, status: "available" };

        const { error: updErr } = await supabase
          .from("vehicles")
          .update(updatePayload)
          .eq("id", vehicle.id);
        if (updErr) throw new Error(updErr.message);
      }
      return serviceKey;
    },
    onSuccess: (serviceKey) => {
      const s = MAINTENANCE_SERVICES[serviceKey];
      toast.success(`${s?.label ?? "Manutenção"} concluída com sucesso!`, {
        description: `Indicadores da aeronave ${currentVehicle?.callsign} restaurados para 100%.`,
      });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["maintenance_logs"] });
    },
    onError: (e) => {
      toast.error("Falha ao executar serviço de manutenção", { description: e.message });
    },
  });

  if (!currentVehicle) {
    return <div className="p-10 text-muted-foreground">Nenhum veículo cadastrado na frota.</div>;
  }

  const w = wearScore(currentVehicle);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <PageHeader kicker="Manutenção & Engenharia" title="Diagnóstico 3D & Telemetria da Frota" />

      {/* Cards de Métricas Gerais */}
      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={Battery} label="Bateria Média da Frota" value={`${avgBattery}%`} />
        <Stat icon={Filter} label="Filtro de Sílica Médio" value={`${avgDustFilter}%`} />
        <Stat
          icon={AlertTriangle}
          label="Ordens Pendentes"
          value={String(openOrders.length)}
          warn={openOrders.length > 0}
        />
      </div>

      {/* Seletor de Veículo para Inspeção 3D */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-primary">
            Aeronave em Inspeção:{" "}
            <span className="text-foreground">
              {currentVehicle.callsign} — {currentVehicle.name}
            </span>
          </h2>
          <div className="flex flex-wrap gap-1">
            {vehiclesData.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setSelectedVehicleId(v.id);
                  setSelectedHotspot(null);
                }}
                className={`border px-3 py-1 font-mono text-xs transition ${
                  v.id === currentVehicle.id
                    ? "border-primary bg-primary/20 text-primary font-semibold"
                    : "text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {v.callsign}
              </button>
            ))}
          </div>
        </div>

        {/* Hangar 3D com Hotspots Clicáveis */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="cut-corner relative h-[520px] overflow-hidden border">
            <Suspense
              fallback={
                <div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">
                  Carregando baia de diagnóstico 3D...
                </div>
              }
            >
              <HangarScene
                category={currentVehicle.category}
                callsign={currentVehicle.callsign}
                name={currentVehicle.name}
                selectedHotspot={selectedHotspot}
                onSelectHotspot={setSelectedHotspot}
                showHotspots={true}
              />
            </Suspense>

            {/* Guia de Hotspots Sobreposta */}
            <div className="pointer-events-none absolute bottom-3 left-4 space-y-1 font-mono text-[10px] text-muted-foreground">
              <p className="flex items-center gap-1.5 text-telemetry">
                <Sparkles className="h-3 w-3" /> PONTOS LUMINOSOS SÃO HOTSPOTS CLICÁVEIS DE
                DIAGNÓSTICO
              </p>
              <p>ARRASTE PARA ROTACIONAR · ROLE PARA ZOOM</p>
            </div>
          </div>

          {/* Painel do Hotspot Selecionado & Execução de Serviços */}
          <div className="glass space-y-4 p-5 font-mono text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  STATUS OPERACIONAL
                </span>
                <p className="font-display text-lg text-foreground">
                  {statusLabel[currentVehicle.status]}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  DESGASTE GERAL
                </span>
                <p
                  className={`font-display text-xl font-bold ${w > 50 ? "text-destructive" : w > 30 ? "text-warning" : "text-telemetry"}`}
                >
                  {w}/100
                </p>
              </div>
            </div>

            {/* Diagnóstico por Hotspot */}
            <div className="space-y-3">
              <p className="font-semibold uppercase tracking-widest text-primary">
                Diagnóstico de Subsistemas
              </p>

              {/* Botões para selecionar componente */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedHotspot("dust")}
                  className={`flex items-center gap-2 border p-2 text-left transition ${
                    selectedHotspot === "dust"
                      ? "border-telemetry bg-telemetry/15 text-telemetry"
                      : "hover:bg-muted"
                  }`}
                >
                  <Filter className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="block text-[10px]">Filtro Sílica</span>
                    <strong>{currentVehicle.dust_filter_pct}%</strong>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedHotspot("battery")}
                  className={`flex items-center gap-2 border p-2 text-left transition ${
                    selectedHotspot === "battery"
                      ? "border-telemetry bg-telemetry/15 text-telemetry"
                      : "hover:bg-muted"
                  }`}
                >
                  <Battery className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="block text-[10px]">Bateria</span>
                    <strong>{currentVehicle.battery_pct}%</strong>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedHotspot("o2")}
                  className={`flex items-center gap-2 border p-2 text-left transition ${
                    selectedHotspot === "o2"
                      ? "border-telemetry bg-telemetry/15 text-telemetry"
                      : "hover:bg-muted"
                  }`}
                >
                  <Wind className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="block text-[10px]">Suporte O₂</span>
                    <strong>{currentVehicle.o2_hours}h</strong>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedHotspot("thruster")}
                  className={`flex items-center gap-2 border p-2 text-left transition ${
                    selectedHotspot === "thruster"
                      ? "border-telemetry bg-telemetry/15 text-telemetry"
                      : "hover:bg-muted"
                  }`}
                >
                  <Flame className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="block text-[10px]">Propulsores</span>
                    <strong>{currentVehicle.thruster_integrity ?? 100}%</strong>
                  </div>
                </button>
              </div>

              {/* Barra de Progresso do Componente Ativo */}
              <div className="border border-muted/50 bg-background/50 p-3 space-y-2">
                {selectedHotspot === "dust" && (
                  <div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Filtro de Sílica Ciclônico</span>
                      <span>{currentVehicle.dust_filter_pct}%</span>
                    </div>
                    <div className="mt-1">
                      <Bar
                        value={currentVehicle.dust_filter_pct}
                        tone={toneFor(currentVehicle.dust_filter_pct)}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {currentVehicle.dust_filter_pct < 50
                        ? "CRÍTICO: Saturação severa por tempestade de poeira marciana. Risco de quebra de admissão."
                        : "NOMINAL: Nível de retenção microparticulada dentro dos limites de segurança."}
                    </p>
                    <button
                      disabled={executeService.isPending}
                      onClick={() =>
                        executeService.mutate({
                          serviceKey: "silica_clean",
                          vehicle: currentVehicle,
                        })
                      }
                      className="cut-corner mt-3 flex w-full items-center justify-center gap-2 bg-mars-gradient py-2 font-mono text-xs uppercase tracking-wider text-primary-foreground disabled:opacity-50"
                    >
                      <Hammer className="h-3.5 w-3.5" />
                      Limpeza Ultrassônica (MC$ 450)
                    </button>
                  </div>
                )}

                {selectedHotspot === "battery" && (
                  <div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Células de Grafeno-Lítio</span>
                      <span>{currentVehicle.battery_pct}%</span>
                    </div>
                    <div className="mt-1">
                      <Bar
                        value={currentVehicle.battery_pct}
                        tone={toneFor(currentVehicle.battery_pct)}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Aquecedores térmicos de célula operantes a −40°C.
                    </p>
                    <button
                      disabled={executeService.isPending}
                      onClick={() =>
                        executeService.mutate({
                          serviceKey: "cryo_recharge",
                          vehicle: currentVehicle,
                        })
                      }
                      className="cut-corner mt-3 flex w-full items-center justify-center gap-2 bg-mars-gradient py-2 font-mono text-xs uppercase tracking-wider text-primary-foreground disabled:opacity-50"
                    >
                      <Battery className="h-3.5 w-3.5" />
                      Recarga Criogênica (MC$ 600)
                    </button>
                  </div>
                )}

                {selectedHotspot === "o2" && (
                  <div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tanque Criogênico de O₂</span>
                      <span>{currentVehicle.o2_hours} horas</span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Pressurização nominal de cabine: {currentVehicle.cabin_pressure_kpa ?? 101.3}{" "}
                      kPa.
                    </p>
                    <button
                      disabled={executeService.isPending}
                      onClick={() =>
                        executeService.mutate({ serviceKey: "o2_refill", vehicle: currentVehicle })
                      }
                      className="cut-corner mt-3 flex w-full items-center justify-center gap-2 bg-mars-gradient py-2 font-mono text-xs uppercase tracking-wider text-primary-foreground disabled:opacity-50"
                    >
                      <Wind className="h-3.5 w-3.5" />
                      Abastecimento O₂ (MC$ 350)
                    </button>
                  </div>
                )}

                {selectedHotspot === "thruster" && (
                  <div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Integridade dos Bocais de Plasma
                      </span>
                      <span>{currentVehicle.thruster_integrity ?? 100}%</span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Geometria magnética alinhada. Cavitação nula.
                    </p>
                    <button
                      disabled={executeService.isPending}
                      onClick={() =>
                        executeService.mutate({
                          serviceKey: "thruster_calibration",
                          vehicle: currentVehicle,
                        })
                      }
                      className="cut-corner mt-3 flex w-full items-center justify-center gap-2 bg-mars-gradient py-2 font-mono text-xs uppercase tracking-wider text-primary-foreground disabled:opacity-50"
                    >
                      <Flame className="h-3.5 w-3.5" />
                      Calibração Magnética (MC$ 800)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico Recente de Ordens de Serviço */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Ordens de Serviço Abertas ({openOrders.length})
        </h2>
        <div className="space-y-2">
          {openOrders.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 border border-warning/40 bg-warning/5 px-4 py-3 font-mono text-xs"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="font-semibold text-foreground">
                  {v.callsign} · {v.name}
                </span>
              </div>
              <span className="text-warning">
                {[
                  v.dust_filter_pct < 50 && "Trocar filtro de sílica",
                  v.battery_pct < 40 && "Recarga criogênica",
                  v.status === "maintenance" && "Revisão geral em andamento",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                onClick={() => {
                  setSelectedVehicleId(v.id);
                  setSelectedHotspot("dust");
                }}
                className="cut-corner border border-warning/60 px-3 py-1 text-[11px] text-warning hover:bg-warning/20"
              >
                Inspecionar no Hangar 3D
              </button>
            </div>
          ))}
          {openOrders.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma ordem crítica aberta na frota.</p>
          )}
        </div>
      </section>

      {/* Tabela de Telemetria de Toda a Frota */}
      <section className="overflow-x-auto border">
        <table className="w-full min-w-[760px] font-mono text-xs">
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th className="p-3">Veículo</th>
              <th className="p-3">Status</th>
              <th className="p-3">Bateria</th>
              <th className="p-3">Filtro Sílica</th>
              <th className="p-3">Pressão Cabine</th>
              <th className="p-3">O₂ Autonomia</th>
              <th className="p-3">Desgaste</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedVehicles.map((v) => {
              const score = wearScore(v);
              return (
                <tr key={v.id} className="hover:bg-surface/50">
                  <td className="p-3">
                    <span className="font-semibold text-primary">{v.callsign}</span>
                    <br />
                    <span className="text-muted-foreground">{v.name}</span>
                  </td>
                  <td className="p-3">{statusLabel[v.status]}</td>
                  <td className="w-32 p-3">
                    <span>{v.battery_pct}%</span>
                    <Bar value={v.battery_pct} tone={toneFor(v.battery_pct)} />
                  </td>
                  <td className="w-32 p-3">
                    <span>{v.dust_filter_pct}%</span>
                    <Bar value={v.dust_filter_pct} tone={toneFor(v.dust_filter_pct)} />
                  </td>
                  <td className="p-3">{v.cabin_pressure_kpa ?? 101.3} kPa</td>
                  <td className="p-3">{v.o2_hours} h</td>
                  <td
                    className={`p-3 font-semibold ${score > 50 ? "text-destructive" : score > 30 ? "text-warning" : "text-telemetry"}`}
                  >
                    {score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="cut-corner glass p-5">
      <Icon className={`h-5 w-5 ${warn ? "text-warning" : "text-telemetry"}`} />
      <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
