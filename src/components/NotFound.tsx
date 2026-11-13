import { Link, useRouterState } from "@tanstack/react-router";
import { AresLogo } from "@/components/AresLogo";

/** Tela 404: mantém o clima do produto e leva o usuário de volta a um caminho útil. */
export function NotFound() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background px-6 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 60%)",
        }}
      />
      <header className="relative z-10">
        <AresLogo />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center">
        <div className="max-w-xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">
            Erro 404 · sinal perdido
          </p>
          <h1
            className="mt-4 font-display text-8xl font-bold leading-none tracking-tight text-transparent md:text-9xl"
            style={{
              backgroundImage: "linear-gradient(135deg, var(--primary), var(--telemetry))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            404
          </h1>
          <h2 className="mt-6 font-display text-2xl font-semibold text-foreground">
            Esta rota não existe em Marte
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            O endereço pode ter sido digitado errado, ou a página foi movida. Nenhuma tempestade
            apagou seus dados: é só voltar para uma base conhecida.
          </p>

          <p
            className="mx-auto mt-6 max-w-full truncate border border-border/60 bg-surface/50 px-3 py-2 font-mono text-xs text-muted-foreground"
            data-testid="not-found-path"
          >
            <span className="text-primary">DESTINO&nbsp;›</span> {path}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="cut-corner bg-mars-gradient px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-primary-foreground shadow-glow transition hover:opacity-90"
            >
              Voltar ao início
            </Link>
            <Link
              to="/app/booking"
              className="cut-corner border border-telemetry/60 bg-telemetry/10 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-telemetry transition hover:bg-telemetry/20"
            >
              Ir para a Locadora
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
