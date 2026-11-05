import { useMemo } from "react";
import {
  AlertTriangle,
  Battery,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  Plane,
  Rocket,
  ShieldCheck,
  Truck,
  Wind,
  Zap,
} from "lucide-react";
import {
  categoryLabel,
  getRequiredLicense,
  licenseLabel,
  statusLabel,
  type Hangar,
  type Vehicle,
  type WeatherEvent,
} from "@/lib/ares-data";

interface FleetShowcaseProps {
  vehicles: Vehicle[];
  hangars: Hangar[];
  weather: WeatherEvent[];
  selectedCategory: Vehicle["category"] | "all";
  setSelectedCategory: (cat: Vehicle["category"] | "all") => void;
  sols: number;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onInspect3D?: (vehicle: Vehicle) => void;
}

export function FleetShowcase({
  vehicles,
  hangars,
  weather,
  selectedCategory,
  setSelectedCategory,
  sols,
  onSelectVehicle,
  onInspect3D,
}: FleetShowcaseProps) {
  const filteredVehicles = useMemo(() => {
    if (selectedCategory === "all") return vehicles;
    return vehicles.filter((v) => v.category === selectedCategory);
  }, [vehicles, selectedCategory]);

  const hangarMap = useMemo(() => {
    const map = new Map<string, Hangar>();
    hangars.forEach((h) => map.set(h.id, h));
    return map;
  }, [hangars]);

  const activeStormHangars = useMemo(() => {
    const stormSet = new Set<string>();
    hangars.forEach((h) => {
      if (h.storm_alert) stormSet.add(h.id);
    });
    return stormSet;
  }, [hangars]);

  return (
    <section id="frota" className="border-t border-border/60 bg-surface/20 px-6 py-20 md:px-12">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Section Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">
              Frota ARES Mobility · Jezero Fleet
            </p>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
              Escolha seu veículo para decolar em Marte
            </h2>
            <p className="mt-2 text-muted-foreground">
              Carros voadores pressurizados, caminhões blindados para cânions e foguetes
              interplanetários classe Starship.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-telemetry border border-telemetry/30 bg-telemetry/5 px-4 py-2">
            <Zap className="h-4 w-4 shrink-0 text-telemetry" />
            <span>
              {vehicles.length} Aeronaves disponíveis em {hangars.length} Hangares
            </span>
          </div>
        </div>

        {/* Category Filter Buttons */}
        <div className="flex flex-wrap gap-2 border-b border-border/50 pb-4 font-mono text-xs">
          {[
            { id: "all", label: "Toda a Frota" },
            { id: "car_vtol", label: "Carros Voadores (VTOL)" },
            { id: "space_truck", label: "Caminhões Espaciais" },
            { id: "interplanetary_rocket", label: "Foguetes Starship" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`border px-4 py-2 uppercase tracking-wider transition ${
                selectedCategory === cat.id
                  ? "border-primary bg-primary/20 text-primary font-bold shadow-glow"
                  : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Vehicles Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredVehicles.map((v) => {
            const h = v.hangar_id ? hangarMap.get(v.hangar_id) : undefined;
            const hasStorm = v.hangar_id ? activeStormHangars.has(v.hangar_id) : false;
            const isAvailable = v.status === "available";
            const CategoryIcon =
              v.category === "car_vtol" ? Plane : v.category === "space_truck" ? Truck : Rocket;
            const estimatedTotal = v.daily_rate_sol * sols;

            return (
              <div
                key={v.id}
                className="cut-corner glass group flex flex-col justify-between border border-border/70 p-6 transition-all hover:border-primary/60 hover:shadow-[0_0_30px_rgba(255,106,0,0.15)]"
              >
                <div>
                  {/* Top Tags */}
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="flex items-center gap-1.5 text-primary font-semibold">
                      <CategoryIcon className="h-4 w-4" />
                      {categoryLabel[v.category]}
                    </span>
                    <span
                      className={`px-2 py-0.5 border ${
                        isAvailable
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          : v.status === "in_flight"
                            ? "border-telemetry/50 bg-telemetry/10 text-telemetry"
                            : "border-destructive/50 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {statusLabel[v.status]}
                    </span>
                  </div>

                  {/* Vehicle Name & Callsign */}
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-2xl font-bold text-foreground group-hover:text-primary transition">
                        {v.name}
                      </h3>
                      {v.name.includes("Apex") && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                          VIP EXECUTIVA
                        </span>
                      )}
                      {v.name.includes("Valkyrie") && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold border border-primary/40">
                          SUPER SPORT GT
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-telemetry tracking-widest">{v.callsign}</p>
                  </div>

                  {/* Hangar & Weather Tag */}
                  <div className="mt-3 flex items-center justify-between font-mono text-xs text-muted-foreground border-b border-border/40 pb-3">
                    <span>
                      Hangar: <strong className="text-foreground">{h?.name ?? "Órbita"}</strong>
                    </span>
                    {hasStorm && (
                      <span className="flex items-center gap-1 text-[10px] text-warning bg-warning/10 px-2 py-0.5 border border-warning/30">
                        <AlertTriangle className="h-3 w-3" /> Tempestade no Domo
                      </span>
                    )}
                  </div>

                  {/* Telemetry Signals */}
                  <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs text-muted-foreground">
                    <div className="border border-border/50 bg-surface/50 p-2 text-center">
                      <Battery className="mx-auto h-3.5 w-3.5 text-emerald-400 mb-1" />
                      <span className="block text-[10px] text-muted-foreground">BATERIA</span>
                      <strong className="text-foreground font-bold">{v.battery_pct}%</strong>
                    </div>

                    <div className="border border-border/50 bg-surface/50 p-2 text-center">
                      <Wind className="mx-auto h-3.5 w-3.5 text-telemetry mb-1" />
                      <span className="block text-[10px] text-muted-foreground">O₂ SUPORTE</span>
                      <strong className="text-foreground font-bold">{v.o2_hours}h</strong>
                    </div>

                    <div className="border border-border/50 bg-surface/50 p-2 text-center">
                      <Filter className="mx-auto h-3.5 w-3.5 text-warning mb-1" />
                      <span className="block text-[10px] text-muted-foreground">SÍLICA</span>
                      <strong className="text-foreground font-bold">{v.dust_filter_pct}%</strong>
                    </div>
                  </div>

                  {/* Required License Badge */}
                  <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-telemetry shrink-0" />
                    <span>
                      Licença mínima:{" "}
                      <strong className="text-telemetry">{getRequiredLicense(v.category)}</strong>
                    </span>
                  </div>
                </div>

                {/* Pricing & CTA */}
                <div className="mt-6 border-t border-border/50 pt-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="font-display text-2xl font-bold text-primary">
                        MC$ {v.daily_rate_sol.toLocaleString("pt-BR")}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground"> / sol</span>
                    </div>

                    <span className="font-mono text-[11px] text-muted-foreground">
                      Total: MC$ {estimatedTotal.toLocaleString("pt-BR")} ({sols}{" "}
                      {sols === 1 ? "Sol" : "Sols"})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectVehicle(v)}
                    className="cut-corner mt-4 flex w-full items-center justify-center gap-2 bg-mars-gradient py-3 font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow transition hover:opacity-95"
                  >
                    <span>Reservar Veículo</span>
                  </button>

                  {onInspect3D && (
                    <button
                      type="button"
                      onClick={() => onInspect3D(v)}
                      className="cut-corner mt-2 flex w-full items-center justify-center gap-2 border border-telemetry/40 bg-telemetry/10 py-2.5 font-mono text-xs uppercase tracking-wider text-telemetry transition hover:border-telemetry hover:bg-telemetry/20"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Acompanhar Percurso 3D</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
