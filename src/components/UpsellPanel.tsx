import { useMemo, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import type { AddonKey } from "@shared/addons";
import {
  suggestUpsells,
  upsellSummary,
  type UpsellDraft,
  type UpsellSuggestion,
} from "@shared/upsell";

const LEVEL: Record<UpsellSuggestion["level"], { label: string; className: string }> = {
  required: { label: "Obrigatório", className: "text-warning" },
  recommended: { label: "Recomendado", className: "text-telemetry" },
  info: { label: "Sugestão", className: "text-muted-foreground" },
};

/**
 * Sugestões de adicionais e alternativas, sempre com o fato que as motivou e o custo exato.
 * Nada é aplicado sozinho e cada sugestão pode ser dispensada.
 */
export function UpsellPanel({
  draft,
  onApplyAddon,
  onDismissAddon,
}: {
  draft: UpsellDraft;
  onApplyAddon: (addon: AddonKey) => void;
  /** O cliente dispensou um adicional: vira memória para a IA não insistir. */
  onDismissAddon?: (addon: AddonKey) => void;
}) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const suggestions = useMemo(
    () => suggestUpsells(draft).filter((s) => !dismissed.has(s.id)),
    [draft, dismissed],
  );
  if (suggestions.length === 0) return null;

  return (
    <section
      aria-label={`Sugestões para ${draft.vehicle.callsign}`}
      data-testid="upsell-panel"
      className="mt-4 space-y-2 border border-border/60 bg-background/40 p-3"
    >
      <h4 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Lightbulb className="h-3 w-3 text-telemetry" /> Sugestões · motor de regras
      </h4>
      <ul className="space-y-2">
        {suggestions.map((s) => (
          <li key={s.id} className="space-y-1 text-xs" data-testid="upsell-item">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-foreground">
                <span
                  className={`mr-1.5 font-mono text-[10px] uppercase ${LEVEL[s.level].className}`}
                >
                  {LEVEL[s.level].label}
                </span>
                {s.title}
              </p>
              {s.level !== "required" && (
                <button
                  type="button"
                  aria-label={`Dispensar: ${s.title}`}
                  onClick={() => {
                    setDismissed((prev) => new Set(prev).add(s.id));
                    if (s.addon) onDismissAddon?.(s.addon);
                  }}
                  className="shrink-0 text-muted-foreground transition hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-muted-foreground">{s.evidence}</p>
            <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
              <span className="text-muted-foreground">{upsellSummary(s)}</span>
              {s.addon ? (
                <button
                  type="button"
                  disabled={!s.affordable}
                  onClick={() => onApplyAddon(s.addon!)}
                  title="Vale para todos os veículos desta tela"
                  className="border border-telemetry/60 bg-telemetry/10 px-2 py-1 uppercase tracking-wider text-telemetry transition hover:bg-telemetry/20 disabled:opacity-40"
                >
                  {s.affordable ? "Adicionar" : "Sem saldo"}
                </button>
              ) : (
                <span className="text-muted-foreground">Veja a opção nesta lista</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
