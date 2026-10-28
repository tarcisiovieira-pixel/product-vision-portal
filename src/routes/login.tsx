import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Fingerprint, Lock, Mail, ShieldCheck } from "lucide-react";
import { AresLogo } from "@/components/AresLogo";

const MarsGlobe = lazy(() => import("@/components/MarsGlobe"));

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Acesso do Colono — ARES Mobility" },
      { name: "description", content: "Entre com sua credencial espacial para reservar e acompanhar sua frota em Marte." },
      { property: "og:title", content: "Acesso do Colono — ARES Mobility" },
      { property: "og:description", content: "Entre com sua credencial espacial ARES." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

const licenses = ["Atmosférico", "Carga Pesada", "Orbital"] as const;

function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [license, setLicense] = useState<(typeof licenses)[number]>("Atmosférico");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => nav({ to: "/painel" }), 1200);
  };

  return (
    <div className="scanline relative grid min-h-screen overflow-hidden lg:grid-cols-[1fr_480px]">
      <div className="absolute inset-0 lg:right-[480px]">
        <ClientOnly fallback={null}>
          <Suspense fallback={null}><MarsGlobe /></Suspense>
        </ClientOnly>
      </div>

      {/* HUD overlay */}
      <div className="pointer-events-none relative hidden flex-col justify-between p-10 lg:flex">
        <div className="pointer-events-auto"><AresLogo /></div>
        <div className="space-y-2 font-mono text-xs text-telemetry">
          <p>LAT 18.65°N · LON 133.8°W · OLYMPUS MONS HUB</p>
          <p>PRESSÃO EXT 0.006 atm · TEMP −63 °C</p>
          <p className="text-warning">⚠ TEMPESTADE · SETOR ACIDALIA · 34% COBERTURA</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
        className="glass relative z-10 flex flex-col justify-center border-y-0 border-r-0 px-8 py-12 md:px-12"
      >
        <div className="mb-10 lg:hidden"><AresLogo /></div>
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">Terminal de acesso</p>
        <h1 className="mt-3 font-display text-4xl font-bold">
          {mode === "in" ? "Bem-vindo de volta, colono." : "Registrar credencial"}
        </h1>

        <div className="mt-8 grid grid-cols-2 border">
          {(["in", "up"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`py-2 text-sm uppercase tracking-widest transition ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {m === "in" ? "Entrar" : "Cadastrar"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "up" && (
            <Field icon={Fingerprint} label="ID de credencial espacial" placeholder="ARS-0000-XXXX" />
          )}
          <Field icon={Mail} label="E-mail" type="email" placeholder="colono@jezero.mars" />
          <Field icon={Lock} label="Senha" type="password" placeholder="••••••••" />

          {mode === "up" && (
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Habilitação de piloto</p>
              <div className="grid grid-cols-3 gap-2">
                {licenses.map((l) => (
                  <button type="button" key={l} onClick={() => setLicense(l)} className={`border px-2 py-2 text-xs transition ${license === l ? "border-telemetry text-telemetry" : "text-muted-foreground"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button disabled={loading} className="cut-corner mt-4 flex w-full items-center justify-center gap-2 bg-mars-gradient py-4 font-semibold uppercase tracking-widest text-primary-foreground shadow-glow disabled:opacity-70">
            <ShieldCheck className="h-5 w-5" />
            {loading ? "Sincronizando com a órbita..." : mode === "in" ? "Iniciar sessão" : "Criar credencial"}
          </button>
        </form>
        <p className="mt-8 font-mono text-[10px] text-muted-foreground">CANAL CRIPTOGRAFADO · LATÊNCIA TERRA 14m 02s</p>
      </motion.div>
    </div>
  );
}

function Field({ icon: Icon, label, ...props }: { icon: typeof Mail; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3 border bg-background/50 px-3 focus-within:border-primary">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <input required {...props} className="w-full bg-transparent py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/50" />
      </div>
    </label>
  );
}
