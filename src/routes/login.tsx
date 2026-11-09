import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { errorMessage } from "@/lib/utils";
import { lazy, Suspense, useState, useEffect } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertCircle, Fingerprint, Lock, Mail, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { AresLogo } from "@/components/AresLogo";
import { useQueryClient } from "@tanstack/react-query";
import { InfoTip } from "@/components/InfoTip";
import { supabase } from "@/integrations/supabase/client";
import { passwordErrorMessage } from "@/lib/password";
import { enterRealSession, isDemoSession, startDemoSession } from "@/lib/session";

const MarsGlobe = lazy(() => import("@/components/MarsGlobe"));

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (isDemoSession()) {
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

function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  // Checa se já existe sessão no cliente
  useEffect(() => {
    if (isDemoSession()) {
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
    await supabase.auth.signOut().catch(() => {});
    startDemoSession(qc);
    toast.success("Modo demo ativo", {
      description: "Dados fictícios, salvos só neste navegador.",
    });
    await nav({ to: "/app/booking", replace: true });
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    const address = email.trim();
    if (!address) {
      setAuthError("Digite seu e-mail no campo acima para receber o link.");
      return;
    }
    setLoading(true);
    setAuthError(null);
    setResetSentTo(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      // Mesma resposta exista a conta ou não: não revela quem tem cadastro.
      setResetSentTo(address);
    } catch (err) {
      setAuthError(passwordErrorMessage(err));
    } finally {
      setLoading(false);
    }
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
          enterRealSession(qc);
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
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              space_credential_id: autoCredId,
            },
          },
        });

        if (error) {
          throw error;
        }

        // O Supabase devolve identities vazio quando o e-mail já tem conta.
        if (data.user && data.user.identities?.length === 0) {
          throw new Error("Este e-mail já tem conta. Use a aba Entrar.");
        }

        if (data.session) {
          enterRealSession(qc);
          toast.success("Conta criada! 25.000 créditos liberados.");
          await nav({ to: "/app/booking", replace: true });
        } else {
          setPendingEmail(email.trim());
          setMode("in");
        }
      }
    } catch (err) {
      let message = errorMessage(err) || "Erro na autenticação. Verifique os dados inseridos.";
      if (message.toLowerCase().includes("email not confirmed")) {
        message = "E-mail ainda não confirmado. Abra o link que enviamos e tente de novo.";
      } else if (message.toLowerCase().includes("invalid login credentials")) {
        message = "E-mail ou senha incorretos.";
      } else if (message.toLowerCase().includes("rate limit")) {
        message = "Muitas tentativas. Aguarde alguns minutos ou use o modo demo.";
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
          <p className="text-warning">⚠ TEMPESTADE · ACIDALIA</p>
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
            <span>Entrar no modo demo</span>
          </button>
          <div className="mt-2 flex items-center justify-center gap-2 font-mono text-[10px] text-muted-foreground">
            <span>sem cadastro</span>
            <InfoTip>
              Explore com dados fictícios, salvos só neste navegador. Nada vai para sua conta.
            </InfoTip>
          </div>
        </div>

        {pendingEmail && !authError && (
          <div
            role="status"
            className="mt-4 flex items-start gap-2 border border-telemetry/50 bg-telemetry/10 p-3 font-mono text-xs text-telemetry"
          >
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Confirme seu e-mail</p>
              <p className="text-[11px] leading-relaxed">
                Enviamos um link para {pendingEmail}. Depois de abrir, entre aqui.
              </p>
            </div>
          </div>
        )}

        {resetSentTo && !authError && (
          <div
            role="status"
            className="mt-4 flex items-start gap-2 border border-telemetry/50 bg-telemetry/10 p-3 font-mono text-xs text-telemetry"
          >
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Verifique seu e-mail</p>
              <p className="text-[11px] leading-relaxed">
                Se existir uma conta com {resetSentTo}, enviamos um link para criar uma nova senha.
                Ele vale por pouco tempo.
              </p>
            </div>
          </div>
        )}

        {authError && (
          <div className="mt-4 flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Não foi possível entrar</p>
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
            {mode === "in" && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="mt-2 text-[11px] text-primary hover:underline disabled:opacity-50"
              >
                Esqueci minha senha
              </button>
            )}
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
              <p className="text-[11px] text-muted-foreground">
                Habilitação inicial: Atmosférico. Upgrades são liberados pela equipe ARES.
              </p>

              <div className="flex items-center gap-2 border border-telemetry/40 bg-telemetry/5 p-3 text-[11px] text-telemetry">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>25.000 créditos de boas-vindas</span>
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
