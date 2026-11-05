import { useState } from "react";
import { Calendar, Compass, MapPin, Plane, Rocket, Search, Truck } from "lucide-react";
import type { Hangar, Vehicle } from "@/lib/ares-data";

interface LandingSearchWidgetProps {
  hangars: Hangar[];
  pickup: string;
  setPickup: (id: string) => void;
  dropoff: string;
  setDropoff: (id: string) => void;
  startSol: number;
  setStartSol: (sol: number) => void;
  sols: number;
  setSols: (sols: number) => void;
  category: Vehicle["category"] | "all";
  setCategory: (cat: Vehicle["category"] | "all") => void;
  onSearch: () => void;
}

export function LandingSearchWidget({
  hangars,
  pickup,
  setPickup,
  dropoff,
  setDropoff,
  startSol,
  setStartSol,
  sols,
  setSols,
  category,
  setCategory,
  onSearch,
}: LandingSearchWidgetProps) {
  const [sameLocation, setSameLocation] = useState(true);

  const handlePickupChange = (id: string) => {
    setPickup(id);
    if (sameLocation) {
      setDropoff(id);
    }
  };

  const handleToggleSameLocation = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSameLocation(checked);
    if (checked) {
      setDropoff(pickup);
    }
  };

  return (
    <div className="cut-corner glass relative z-20 mx-auto w-full max-w-5xl border border-primary/30 p-4 shadow-2xl backdrop-blur-xl md:p-6">
      {/* Category Tabs */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-border/50 pb-3">
        {[
          { id: "all", label: "Toda a Frota", icon: Compass },
          { id: "car_vtol", label: "Carros Voadores (VTOL)", icon: Plane },
          { id: "space_truck", label: "Caminhões Espaciais", icon: Truck },
          { id: "interplanetary_rocket", label: "Foguetes Starship", icon: Rocket },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = category === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id as any)}
              className={`flex items-center gap-2 border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition ${
                isActive
                  ? "border-primary bg-primary/20 text-primary font-bold shadow-glow"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Search Inputs Grid */}
      <div className="grid gap-4 md:grid-cols-4 font-mono text-xs">
        {/* Retirada */}
        <div className="space-y-1.5 md:col-span-1">
          <label className="flex items-center gap-1.5 text-muted-foreground font-semibold">
            <MapPin className="h-3.5 w-3.5 text-primary" /> HANGAR DE RETIRADA
          </label>
          <select
            value={pickup}
            onChange={(e) => handlePickupChange(e.target.value)}
            className="w-full border border-border/80 bg-background/90 p-3 text-foreground focus:border-primary focus:outline-none"
          >
            {hangars.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.code})
              </option>
            ))}
          </select>
        </div>

        {/* Devolução */}
        <div className="space-y-1.5 md:col-span-1">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-muted-foreground font-semibold">
              <MapPin className="h-3.5 w-3.5 text-telemetry" /> DEVOLUÇÃO
            </label>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={sameLocation}
                onChange={handleToggleSameLocation}
                className="accent-primary"
              />
              Mesmo local
            </label>
          </div>
          <select
            disabled={sameLocation}
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            className="w-full border border-border/80 bg-background/90 p-3 text-foreground focus:border-telemetry focus:outline-none disabled:opacity-60"
          >
            {hangars.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.code})
              </option>
            ))}
          </select>
        </div>

        {/* Período em Sols */}
        <div className="space-y-1.5 md:col-span-1">
          <label className="flex items-center gap-1.5 text-muted-foreground font-semibold">
            <Calendar className="h-3.5 w-3.5 text-primary" /> SOL INICIAL & DIAS
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={4218}
              value={startSol}
              onChange={(e) => setStartSol(Number(e.target.value))}
              className="w-full border border-border/80 bg-background/90 p-3 text-foreground focus:border-primary focus:outline-none"
              title="Sol Inicial"
            />
            <select
              value={sols}
              onChange={(e) => setSols(Number(e.target.value))}
              className="w-full border border-border/80 bg-background/90 p-3 text-foreground focus:border-primary focus:outline-none"
              title="Duração em Sols"
            >
              {[1, 2, 3, 5, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "Sol" : "Sols"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CTA Button */}
        <div className="flex items-end md:col-span-1">
          <button
            type="button"
            onClick={onSearch}
            className="cut-corner flex h-[46px] w-full items-center justify-center gap-2 bg-mars-gradient font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow transition hover:opacity-95"
          >
            <Search className="h-4 w-4" />
            <span>Pesquisar Frota</span>
          </button>
        </div>
      </div>
    </div>
  );
}
