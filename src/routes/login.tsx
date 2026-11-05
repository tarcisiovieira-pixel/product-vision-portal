import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { errorMessage } from "@/lib/utils";
import { lazy, Suspense, useState, useEffect } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertCircle, Fingerprint, Lock, Mail, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { AresLogo } from "@/components/AresLogo";
import { supabase } from "@/integrations/supabase/client";

const MarsGlobe = lazy(() => import("@/components/MarsGlobe"));

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window !== "undefined" && localStorage.getItem("ares_demo_session")) {
      throw redirect({ to: "/app/booking" });
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      throw redirect({ to: "/app/booking" });
    }
  },
  head: () => ({
    meta: [
      { title: "Acesso do Colono — ARES Mobility" },
      {
        name: "description",
        content: "Entre com sua credencial espacial para reservar e acompanhar sua frota em Marte.",
      },
      { property: "og:title", content: "Acesso do Colono — ARES Mobility" },
      { property: "og:description", content: "Entre com sua credencial espacial ARES." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

const licenses = [
  { id: "atmospheric", label: "Atmosférico" },
  { id: "heavy_cargo", label: "Carga Pesada" },
  { id: "orbital", label: "Orbital" },
] as const;

type PilotLicenseType = (typeof licenses)[number]["id"];

const DEMO_EMAIL = "demo@aresmobility.com";
const DEMO_PASSWORD = "DemoMars#2026";

function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [license, setLicense] = useState<PilotLicenseType>("atmospheric");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Checa se já existe sessão no cliente
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("ares_demo_session")) {
      nav({ to: "/app/booking", replace: true });
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        nav({ to: "/app/booking", replace: true });
      }
    });
  }, [nav]);

  const handleDemoAccess = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      // 1. Tentar login direto via Supabase Auth com timeout resiliente de 2.5s
      const signInPromise = supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Supabase timeout")), 2500),
      );
      const { data: signInData, error: signInError } = await Promise.race([
        signInPromise,
        timeoutPromise,
      ]);

      if (!signInError && signInData?.session) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("ares_demo_session");
        }
        toast.success("Acesso Demo liberado via Supabase! Bem-vindo a Marte, Comandante.");
        await nav({ to: "/app/booking", replace: true });
        return;
      }
    } catch {
      // continua para fallback resiliente instantâneo
    }

    // 2. Fallback resiliente: Login instantâneo independente de confirmação de e-mail ou limites SMTP
    const demoProfile = {
      id: "00000000-0000-0000-0000-000000000001",
      user_id: "demo-commander-ares",
      space_credential_id: "ARS-DEMO-01",
      pilot_license: "orbital" as PilotLicenseType,
      martian_credits: 25000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("ares_demo_session", JSON.stringify(demoProfile));
    }
    toast.success("Acesso Demo liberado! Bem-vindo a Marte, Comandante.", {
      description: "Credencial ARS-DEMO-01 ativa · Licença Orbital · MC$ 25.000",
    });
    await nav({ to: "/app/booking", replace: true });
    setLoading(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    try {
      if (mode === "in") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("ares_demo_session");
          }
          toast.success("Sessão orbital iniciada!");
          await nav({ to: "/app/booking", replace: true });
        }
      } else {
        const autoCredId =
          credentialId.trim() || `ARS-${Math.floor(1000 + Math.random() * 9000)}-EXP`;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              space_credential_id: autoCredId,
              pilot_license: license,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("ares_demo_session");
          }
          toast.success("Credencial registrada com sucesso! 25.000 créditos liberados.");
          await nav({ to: "/app/booking", replace: true });
        } else {
          toast.success("Credencial criada com sucesso!");
          toast.info(
            "Confirmação de e-mail ativa no Supabase. Para entrar agora sem aguardar confirmação, utilize o botão 'Acesso Rápido Demo'.",
          );
          setMode("in");
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      let message = errorMessage(err) || "Erro na autenticação. Verifique os dados inseridos.";
      if (message.toLowerCase().includes("email not confirmed")) {
        message =
          "Confirmação de e-mail pendente no Supabase. Dica: use o botão 'Acesso Rápido Demo' acima para testar imediatamente, ou confirme o link no seu e-mail / desative 'Confirm email' no painel Supabase (Authentication > Providers > Email).";
      } else if (message.toLowerCase().includes("invalid login credentials")) {
        message = "Credenciais inválidas. Verifique seu e-mail e senha de acesso.";
      }
      setAuthError(message);
      toast.error("Falha na autenticação", { description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scanline relative grid min-h-screen overflow-hidden lg:grid-cols-[1fr_480px]">
      <div className="absolute inset-0 lg:right-[480px]">
        <ClientOnly fallback={null}>
          <Suspense fallback={null}>
            <MarsGlobe />
          </Suspense>
        </ClientOnly>
      </div>

      {/* HUD overlay */}
      <div className="pointer-events-none relative hidden flex-col justify-between p-10 lg:flex">
        <div className="pointer-events-auto">
          <AresLogo />
        </div>
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
        <div className="mb-10 lg:hidden">
          <AresLogo />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">
          Terminal de acesso
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">
          {mode === "in" ? "Bem-vindo de volta, colono." : "Registrar credencial"}
        </h1>

        {/* Abas Entrar / Cadastrar */}
        <div className="mt-6 grid grid-cols-2 gap-2 border-b border-border/50 pb-2">
          <button
            type="button"
            onClick={() => {
              setMode("in");
              setAuthError(null);
            }}
            className={`py-2 text-center font-mono text-xs uppercase tracking-wider transition ${
              mode === "in"
                ? "border-b-2 border-primary font-bold text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("up");
              setAuthError(null);
            }}
            className={`py-2 text-center font-mono text-xs uppercase tracking-wider transition ${
              mode === "up"
                ? "border-b-2 border-primary font-bold text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cadastrar
          </button>
        </div>

        {/* Botão de Acesso Rápido Demo */}
        <div className="mt-4">
          <button
            type="button"
            disabled={loading}
            onClick={handleDemoAccess}
            className="cut-corner group flex w-full items-center justify-center gap-2 border border-telemetry/60 bg-telemetry/10 py-3.5 font-mono text-xs font-semibold uppercase tracking-widest text-telemetry transition-all hover:bg-telemetry/20 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] disabled:opacity-50"
          >
            <Zap className="h-4 w-4 text-telemetry transition-transform group-hover:scale-110" />
            <span>Acesso Rápido Demo</span>
            <span className="text-[10px] text-telemetry/70">(Sem cadastro)</span>
          </button>
          <div className="mt-2 text-center">
            <span className="font-mono text-[10px] text-muted-foreground">
              ou utilize suas credenciais espaciais abaixo
            </span>
          </div>
        </div>

        {authError && (
          <div className="mt-4 flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Falha de Autorização</p>
              <p className="text-[11px] leading-relaxed">{authError}</p>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4 font-mono text-xs">
          <div>
            <label className="text-muted-foreground">E-MAIL DO COLONO</label>
            <div className="mt-1.5 flex items-center border bg-background/50 px-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colono@jezero.mars"
                className="w-full bg-transparent p-2 text-foreground focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-muted-foreground">CÓDIGO DE ACESSO</label>
            <div className="mt-1.5 flex items-center border bg-background/50 px-3">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-transparent p-2 text-foreground focus:outline-none"
              />
            </div>
          </div>

          {mode === "up" && (
            <div className="space-y-4">
              <div>
                <label className="text-muted-foreground">
                  ID DA CREDENCIAL ESPACIAL (OPCIONAL)
                </label>
                <div className="mt-1.5 flex items-center border bg-background/50 px-3">
                  <Fingerprint className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={credentialId}
                    onChange={(e) => setCredentialId(e.target.value)}
                    placeholder="ARS-4218-XXXX"
                    className="w-full bg-transparent p-2 text-foreground uppercase focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-muted-foreground">Habilitação de piloto</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {licenses.map((lic) => (
                    <button
                      key={lic.id}
                      type="button"
                      onClick={() => setLicense(lic.id)}
                      className={`border p-2 text-center text-[11px] uppercase transition ${
                        license === lic.id
                          ? "border-primary bg-primary/20 text-primary font-bold"
                          : "text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      {lic.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 border border-telemetry/40 bg-telemetry/5 p-3 text-[11px] text-telemetry">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  Bônus inaugural: 25.000 Créditos Marcianos creditados na ativação da credencial.
                </span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="cut-corner mt-4 w-full bg-mars-gradient py-3.5 font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow disabled:opacity-50"
          >
            {loading
              ? "Sincronizando com Jezero..."
              : mode === "in"
                ? "Acessar Terminal"
                : "Emitir Credencial"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between font-mono text-xs text-muted-foreground">
          {mode === "in" ? (
            <>
              <span>Primeiro ciclo em Marte?</span>
              <button
                onClick={() => {
                  setMode("up");
                  setAuthError(null);
                }}
                className="text-primary hover:underline"
              >
                Criar credencial
              </button>
            </>
          ) : (
            <>
              <span>Já possui credencial?</span>
              <button
                onClick={() => {
                  setMode("in");
                  setAuthError(null);
                }}
                className="text-primary hover:underline"
              >
                Acessar terminal
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
