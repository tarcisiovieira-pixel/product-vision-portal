import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { AresLogo } from "@/components/AresLogo";
import { PasswordForm } from "@/components/PasswordForm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [{ title: "Redefinir senha — ARES Mobility" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPassword,
});

type Stage = "checking" | "ready" | "invalid" | "done";

/** Tempo para o Supabase ler o link do e-mail e abrir a sessão de recuperação. */
const LINK_TIMEOUT_MS = 6000;

function ResetPassword() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");

  useEffect(() => {
    let active = true;
    const move = (from: Stage, to: Stage) => setStage((s) => (active && s === from ? to : s));

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        move("checking", "ready");
      }
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) move("checking", "ready");
    });
    const timer = setTimeout(() => move("checking", "invalid"), LINK_TIMEOUT_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  const save = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setStage("done");
    toast.success("Senha alterada", { description: "Você já está conectado." });
    setTimeout(() => void navigate({ to: "/app/booking", replace: true }), 1800);
  };

  return (
    <div className="scanline flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md space-y-6 p-8">
        <AresLogo />
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">
            Segurança da conta
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">Definir nova senha</h1>
        </div>

        {stage === "checking" && (
          <p role="status" className="font-mono text-xs text-muted-foreground">
            Validando o link...
          </p>
        )}

        {stage === "ready" && <PasswordForm onSubmit={save} submitLabel="Salvar nova senha" />}

        {stage === "done" && (
          <div
            role="status"
            className="flex items-start gap-2 border border-telemetry/50 bg-telemetry/10 p-4 font-mono text-xs text-telemetry"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Senha alterada. Levando você para o app...</p>
          </div>
        )}

        {stage === "invalid" && (
          <div className="space-y-4">
            <div
              role="alert"
              className="flex items-start gap-2 border border-warning/50 bg-warning/10 p-4 font-mono text-xs text-warning"
            >
              <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Este link expirou, já foi usado ou não é válido. Peça um novo em &quot;Esqueci minha
                senha&quot;, na tela de login.
              </p>
            </div>
            <Link
              to="/login"
              className="cut-corner block w-full bg-mars-gradient py-3 text-center font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow"
            >
              Voltar ao login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
