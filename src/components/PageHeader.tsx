import { InfoTip } from "@/components/InfoTip";

export function PageHeader({
  kicker,
  title,
  info,
  children,
}: {
  kicker: string;
  title: string;
  /** Explicação da tela, exibida no ícone de informação ao lado do título. */
  info?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-primary">{kicker}</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-bold md:text-4xl">
          {title}
          {info && (
            <InfoTip label={`Sobre: ${title}`} side="right">
              {info}
            </InfoTip>
          )}
        </h1>
      </div>
      {children}
    </div>
  );
}

export function Bar({
  value,
  tone = "telemetry",
}: {
  value: number;
  tone?: "telemetry" | "warning" | "destructive";
}) {
  const cls =
    tone === "warning" ? "bg-warning" : tone === "destructive" ? "bg-destructive" : "bg-telemetry";
  return (
    <div className="h-1 bg-muted">
      <div className={`h-full ${cls}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function toneFor(pct: number) {
  return pct < 30 ? "destructive" : pct < 60 ? "warning" : "telemetry";
}
