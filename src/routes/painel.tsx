import { createFileRoute, Link } from "@tanstack/react-router";
import { Battery, CloudLightning, Plane, Rocket, Truck, Wind } from "lucide-react";
import { AresLogo } from "@/components/AresLogo";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Painel do Colono — ARES Mobility" },
      { name: "description", content: "Reserve veículos e acompanhe sua frota em Marte." },
      { property: "og:title", content: "Painel do Colono — ARES Mobility" },
      { property: "og:description", content: "Reservas, clima e telemetria da frota marciana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

const hangars = ["Olympus Mons Hub", "Jezero Crater Station", "Valles Marineris Dock", "Phobos Orbital Port"];
const fleet = [
  { icon: Plane, name: "VTOL CyberCab X2", cat: "VTOL CyberCabs", range: "820 km", bat: 92, o2: "36 h", price: "MC$ 420" },
  { icon: Truck, name: "Hauler T-9 Canyon", cat: "Heavy Space Trucks", range: "1.400 km", bat: 74, o2: "120 h", price: "MC$ 1.180" },
  { icon: Rocket, name: "Ares Starship S1", cat: "Interplanetary Rockets", range: "Fobos · Lua · Terra", bat: 100, o2: "900 h", price: "MC$ 48.000" },
];

function Painel() {
  return (
    <div className="hud-grid min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4 md:px-12">
        <AresLogo />
        <div className="flex items-center gap-6 font-mono text-xs">
          <span className="text-telemetry">SOL 4.218 · 09:42 LMST</span>
          <Link to="/login" className="text-muted-foreground hover:text-foreground">Sair</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10 md:px-12">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">Reserva rápida</p>
          <h1 className="mt-2 font-display text-4xl font-bold">Para onde vamos hoje?</h1>
        </div>

        <div className="cut-corner glass grid gap-4 p-6 md:grid-cols-4">
          <Select label="Retirada" options={hangars} />
          <Select label="Devolução" options={hangars} />
          <label className="block">
            <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">Sols</span>
            <input type="number" defaultValue={3} min={1} className="w-full border bg-background/50 px-3 py-3 font-mono text-sm outline-none focus:border-primary" />
          </label>
          <button className="cut-corner self-end bg-mars-gradient py-3 font-semibold uppercase tracking-widest text-primary-foreground shadow-glow">Buscar frota</button>
        </div>

        <div className="flex items-center gap-3 border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <CloudLightning className="h-4 w-4" />
          Tempestade de poeira ativa sobre Acidalia Planitia — rotas ao norte podem ter retenção climática.
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {fleet.map((v) => (
            <div key={v.name} className="cut-corner border bg-surface p-6 transition hover:border-primary/60">
              <div className="flex items-center justify-between">
                <v.icon className="h-7 w-7 text-primary" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{v.cat}</span>
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold">{v.name}</h3>
              <dl className="mt-4 space-y-2 font-mono text-xs">
                <Row k="Autonomia" v={v.range} />
                <Row k="O₂" v={v.o2} icon={Wind} />
                <Row k="Bateria criogênica" v={`${v.bat}%`} icon={Battery} />
              </dl>
              <div className="mt-3 h-1 bg-muted"><div className="h-full bg-telemetry" style={{ width: `${v.bat}%` }} /></div>
              <p className="mt-6 font-display text-2xl font-bold">{v.price}<span className="text-sm font-normal text-muted-foreground"> / Sol</span></p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <select className="w-full border bg-background/50 px-3 py-3 text-sm outline-none focus:border-primary">
        {options.map((o) => <option key={o} className="bg-surface">{o}</option>)}
      </select>
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
