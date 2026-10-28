import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertTriangle, CloudLightning, Gauge, Plane, Rocket, Satellite, Truck, Wind } from "lucide-react";
import { AresLogo } from "@/components/AresLogo";

const MarsGlobe = lazy(() => import("@/components/MarsGlobe"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ARES Mobility — Locação de frota voadora em Marte" },
      { name: "description", content: "A primeira locadora de veículos voadores e interplanetários de Marte. Reserve VTOLs, caminhões espaciais e foguetes com telemetria em tempo real." },
      { property: "og:title", content: "ARES Mobility — Mobilidade em Marte" },
      { property: "og:description", content: "Reserve VTOLs, caminhões espaciais e foguetes com clima e telemetria em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pains = [
  { icon: CloudLightning, title: "Tempestades imprevisíveis", text: "Rotas inteiras somem sob poeira por semanas. Colonos ficam presos sem aviso." },
  { icon: AlertTriangle, title: "Frota sem visibilidade", text: "Ninguém sabe onde está cada veículo, quanto O₂ resta ou quando o filtro satura." },
  { icon: Wind, title: "Reservas analógicas", text: "Hangares isolados, planilhas e rádio. Reservar um foguete leva Sols." },
];

const solutions = [
  { icon: Plane, title: "VTOL CyberCabs", text: "Carros voadores pressurizados para 2–4 colonos entre domos." },
  { icon: Truck, title: "Heavy Space Trucks", text: "Blindados para carga pesada e exploração de cânions." },
  { icon: Rocket, title: "Interplanetary Rockets", text: "Classe Starship: Fobos, Deimos, Lua e Terra." },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 md:px-12">
        <AresLogo />
        <Link to="/login" className="cut-corner bg-mars-gradient px-5 py-2 text-sm font-semibold uppercase tracking-widest text-primary-foreground">
          Acessar
        </Link>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-screen items-center">
        <div className="absolute inset-0 md:left-1/3">
          <ClientOnly fallback={null}>
            <Suspense fallback={null}><MarsGlobe /></Suspense>
          </ClientOnly>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="relative z-10 max-w-2xl px-6 md:px-12">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.4em] text-telemetry">Sol 4.218 · Jezero Station · online</p>
          <h1 className="font-display text-5xl font-bold leading-[0.95] md:text-7xl">
            Mobilidade para quem <span className="text-primary">mora em Marte.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Alugue veículos voadores, caminhões espaciais e foguetes — com clima e telemetria ao vivo em cada rota.
          </p>
          <div className="pointer-events-auto mt-10 flex gap-4">
            <Link to="/login" className="cut-corner bg-mars-gradient px-8 py-4 font-semibold uppercase tracking-widest text-primary-foreground shadow-glow">
              Reservar agora
            </Link>
            <a href="#visao" className="cut-corner glass px-8 py-4 font-semibold uppercase tracking-widest">Conhecer</a>
          </div>
        </motion.div>
      </section>

      {/* Visão */}
      <section id="visao" className="hud-grid relative border-t px-6 py-28 md:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">01 · Visão</p>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
            Tornar cada cratera de Marte a um voo de distância.
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            A experiência de reserva de uma grande locadora, unida à telemetria de um controle de missão. Um só lugar para reservar, rastrear e manter a frota que move a colônia.
          </p>
        </div>
      </section>

      {/* Dor */}
      <section className="border-t px-6 py-28 md:px-12">
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

      {/* Solução */}
      <section className="border-t px-6 py-28 md:px-12">
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
              { icon: Satellite, t: "Radar areográfico 3D", d: "Posição GPS de toda a frota em tempo real." },
              { icon: CloudLightning, t: "Validador climático", d: "Alerta no checkout se a rota cruza tempestades." },
              { icon: Gauge, t: "Manutenção preditiva", d: "Propulsores, filtros de sílica e escudo térmico." },
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

      <section className="border-t px-6 py-24 text-center md:px-12">
        <h2 className="font-display text-4xl font-bold">Pronto para decolar?</h2>
        <Link to="/login" className="cut-corner mt-8 inline-block bg-mars-gradient px-10 py-4 font-semibold uppercase tracking-widest text-primary-foreground shadow-glow">
          Entrar na colônia
        </Link>
        <p className="mt-16 font-mono text-xs text-muted-foreground">© ARES MOBILITY · Olympus Mons Hub · MC$</p>
      </section>
    </div>
  );
}
