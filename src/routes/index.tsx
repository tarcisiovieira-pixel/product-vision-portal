import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CloudLightning,
  Gauge,
  Plane,
  Rocket,
  Satellite,
  Truck,
  Wind,
} from "lucide-react";
import { AresLogo } from "@/components/AresLogo";
import {
  hangarsQuery,
  profileQuery,
  vehiclesQuery,
  weatherQuery,
  type Vehicle,
} from "@/lib/ares-data";
import { LandingSearchWidget } from "@/components/LandingSearchWidget";
import { FleetShowcase } from "@/components/FleetShowcase";
import { MarketplaceShowcase } from "@/components/MarketplaceShowcase";
import { BookingWizardModal } from "@/components/BookingWizardModal";
import { FlightChaseViewer3D } from "@/components/FlightChaseViewer3D";

const MarsGlobe = lazy(() => import("@/components/MarsGlobe"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ARES Mobility — A Localiza de Carros Voadores e Foguetes em Marte" },
      {
        name: "description",
        content:
          "A primeira locadora de veículos voadores e interplanetários de Marte. Reserve VTOLs, caminhões espaciais e foguetes com telemetria e clima em tempo real.",
      },
      { property: "og:title", content: "ARES Mobility — Mobilidade em Marte" },
      {
        property: "og:description",
        content: "Reserve VTOLs, caminhões espaciais e foguetes com clima e telemetria em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pains = [
  {
    icon: CloudLightning,
    title: "Tempestades imprevisíveis",
    text: "Rotas inteiras somem sob poeira por semanas. Colonos ficam presos sem aviso prévio.",
  },
  {
    icon: AlertTriangle,
    title: "Frota sem visibilidade",
    text: "Ninguém sabe onde está cada veículo, quanto O₂ resta ou quando o filtro de sílica satura.",
  },
  {
    icon: Wind,
    title: "Reservas analógicas",
    text: "Hangares isolados, rádio analógico e planilhas de papel. Alugar um foguete levava Sols.",
  },
];

const solutions = [
  {
    icon: Plane,
    title: "VTOL CyberCabs",
    text: "Carros voadores pressurizados para 2 a 4 colonos entre domos habitacionais.",
  },
  {
    icon: Truck,
    title: "Heavy Space Trucks",
    text: "Blindados para transporte de carga pesada e expedições em cânions marcianos.",
  },
  {
    icon: Rocket,
    title: "Interplanetary Rockets",
    text: "Classe Starship com alcance orbital: Fobos, Deimos, Lua e Terra.",
  },
];

function Landing() {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    navigate = useNavigate();
  } catch {
    navigate = null;
  }
  const { data: vehicles = [] } = useQuery(vehiclesQuery);
  const { data: hangars = [] } = useQuery(hangarsQuery);
  const { data: weather = [] } = useQuery(weatherQuery);
  const { data: profile } = useQuery(profileQuery);

  // Estados do buscador estilo Localiza
  const [pickup, setPickup] = useState(hangars[0]?.id ?? "");
  const [dropoff, setDropoff] = useState(hangars[0]?.id ?? "");
  const [startSol, setStartSol] = useState(4219);
  const [sols, setSols] = useState(3);
  const [selectedCategory, setSelectedCategory] = useState<Vehicle["category"] | "all">("all");

  // Veículo em processo de aluguel pelo Wizard
  const [wizardVehicle, setWizardVehicle] = useState<Vehicle | null>(null);
  const [chasingVehicle, setChasingVehicle] = useState<Vehicle | null>(null);

  const handleSearchScroll = () => {
    const el = document.getElementById("frota");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Header Fixo */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5 md:px-12">
        <AresLogo />
        <div className="flex items-center gap-4">
          <a
            href="#frota"
            className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground md:inline-block"
          >
            Locadora de Frota
          </a>
          <a
            href="#seminovos"
            className="hidden font-mono text-xs uppercase tracking-widest text-telemetry hover:text-foreground md:inline-block font-semibold"
          >
            Compra & Venda (Seminovos)
          </a>
          <Link
            to="/app/my-rentals"
            className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground md:inline-block"
          >
            Minhas Reservas
          </Link>
          <Link
            to="/login"
            className="cut-corner bg-mars-gradient px-5 py-2 text-sm font-semibold uppercase tracking-widest text-primary-foreground shadow-glow"
          >
            Acessar Terminal
          </Link>
        </div>
      </header>

      {/* Hero com Globo 3D e Buscador Estilo Localiza */}
      <section className="relative flex min-h-[92vh] flex-col justify-center pt-24 pb-12">
        {/* Fundo 3D Interativo do Planeta Marte */}
        <div className="absolute inset-0">
          <ClientOnly fallback={null}>
            <Suspense fallback={null}>
              <MarsGlobe position={[1.65, 0, 0]} />
            </Suspense>
          </ClientOnly>
        </div>

        {/* Vinheta lateral suave para contraste de leitura */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-full md:w-3/5 bg-gradient-to-r from-background via-background/85 via-35% to-transparent z-[1]" />

        {/* Chamada Principal */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-3xl px-6 md:px-12 mb-8"
        >
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.4em] text-telemetry">
            Sol 4.218 · Jezero Station Fleet · Online
          </p>
          <h1 className="font-display text-5xl font-bold leading-[0.95] md:text-7xl">
            Mobilidade para quem <span className="text-primary">mora em Marte.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            A primeira locadora de veículos espaciais de Marte. Reserve carros voadores VTOL,
            caminhões e foguetes sem burocracia, com telemetria e clima em tempo real.
          </p>
        </motion.div>

        {/* Buscador de Locação Estilo Localiza */}
        <div className="relative z-20 px-6 md:px-12 mt-2">
          <LandingSearchWidget
            hangars={hangars}
            pickup={pickup || hangars[0]?.id || ""}
            setPickup={setPickup}
            dropoff={dropoff || hangars[0]?.id || ""}
            setDropoff={setDropoff}
            startSol={startSol}
            setStartSol={setStartSol}
            sols={sols}
            setSols={setSols}
            category={selectedCategory}
            setCategory={setSelectedCategory}
            onSearch={handleSearchScroll}
          />
        </div>
      </section>

      {/* Vitrine de Veículos Disponíveis para Locação */}
      <FleetShowcase
        vehicles={vehicles}
        hangars={hangars}
        weather={weather}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        sols={sols}
        onSelectVehicle={(vehicle) => setWizardVehicle(vehicle)}
        onInspect3D={(vehicle) => setChasingVehicle(vehicle)}
      />

      {/* Acompanhamento 3D de Voo e Percurso */}
      {chasingVehicle && (
        <FlightChaseViewer3D
          vehicle={chasingVehicle}
          allVehicles={vehicles}
          hangars={hangars}
          onClose={() => setChasingVehicle(null)}
          onSelectVehicle={(v) => {
            if (v.status !== "in_flight" || (v.speed_kmh || 0) <= 0) {
              setChasingVehicle(null);
              if (navigate) {
                navigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
              } else if (typeof window !== "undefined") {
                window.location.href = `/app/hangar-3d?vehicleId=${v.id}`;
              }
            } else {
              setChasingVehicle(v);
            }
          }}
          onNavigateHangar={(v) => {
            setChasingVehicle(null);
            if (navigate) {
              navigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
            } else if (typeof window !== "undefined") {
              window.location.href = `/app/hangar-3d?vehicleId=${v.id}`;
            }
          }}
        />
      )}

      {/* Vitrine de Compra & Venda / Seminovos Espaciais */}
      <MarketplaceShowcase hangars={hangars} currentProfile={profile} />

      {/* Modal / Wizard de Aluguel em 4 Passos */}
      {wizardVehicle && (
        <BookingWizardModal
          vehicle={wizardVehicle}
          hangars={hangars}
          weather={weather}
          initialPickup={pickup || hangars[0]?.id}
          initialDropoff={dropoff || hangars[0]?.id}
          initialStartSol={startSol}
          initialSols={sols}
          currentProfile={profile}
          onClose={() => setWizardVehicle(null)}
        />
      )}

      {/* Seção 01: Visão */}
      <section id="visao" className="hud-grid relative border-t px-6 py-24 md:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">01 · Visão</p>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
            Tornar cada cratera de Marte a um voo de distância.
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            A conveniência de reserva de uma grande locadora terrena unida ao rigor de telemetria de
            um centro espacial. Um só portal para reservar, rastrear e realizar diagnósticos 3D da
            frota marciana.
          </p>
        </div>
      </section>

      {/* Seção 02: A Dor */}
      <section className="border-t px-6 py-24 md:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-destructive">02 · A dor</p>
          <h2 className="mt-4 font-display text-4xl font-bold">Se locomover em Marte ainda é um risco.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {pains.map((p) => (
              <div key={p.title} className="cut-corner glass p-6">
                <p.icon className="h-6 w-6 text-warning" />
                <h3 className="mt-4 font-display text-xl font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seção 03: A Solução */}
      <section className="border-t px-6 py-24 md:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-telemetry">03 · A solução</p>
          <h2 className="mt-4 font-display text-4xl font-bold">Uma frota inteligente, sempre à vista.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {solutions.map((s) => (
              <div key={s.title} className="cut-corner border border-primary/30 bg-surface p-6">
                <s.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Satellite,
                t: "Radar areográfico 3D",
                d: "Posição GPS de toda a frota em tempo real.",
              },
              {
                icon: CloudLightning,
                t: "Validador climático",
                d: "Alerta no checkout se a rota cruza tempestades de areia.",
              },
              {
                icon: Gauge,
                t: "Manutenção preditiva 3D",
                d: "Diagnóstico com hotspots em filtros de sílica e escudos térmicos.",
              },
            ].map((f) => (
              <div key={f.t} className="flex gap-4 p-4">
                <f.icon className="h-5 w-5 shrink-0 text-telemetry" />
                <div>
                  <p className="font-semibold">{f.t}</p>
                  <p className="text-sm text-muted-foreground">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="border-t px-6 py-24 text-center md:px-12">
        <h2 className="font-display text-4xl font-bold">Pronto para decolar em Marte?</h2>
        <a
          href="#frota"
          className="cut-corner mt-8 inline-block bg-mars-gradient px-10 py-4 font-semibold uppercase tracking-widest text-primary-foreground shadow-glow"
        >
          Ver Veículos Disponíveis
        </a>
        <p className="mt-16 font-mono text-xs text-muted-foreground">
          © ARES MOBILITY · Olympus Mons Hub · MC$ Créditos Marcianos
        </p>
      </section>
    </div>
  );
}
