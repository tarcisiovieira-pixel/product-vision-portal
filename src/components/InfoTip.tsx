import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Ícone de informação: abre no hover, no foco do teclado e no toque.
 * Use para tirar explicações longas da tela e deixar só o essencial visível.
 */
export function InfoTip({
  children,
  label = "Mais informações",
  side = "top",
  className,
}: {
  children: ReactNode;
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-testid="info-tip"
            // O Radix fecha no clique; reabrir no frame seguinte habilita o toque em celular.
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              requestAnimationFrame(() => setOpen(true));
            }}
            className={cn(
              "inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center align-middle text-muted-foreground transition hover:text-telemetry focus-visible:text-telemetry focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry",
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="z-[60] max-w-xs border border-telemetry/40 bg-surface px-3 py-2 font-sans text-xs normal-case leading-relaxed tracking-normal text-foreground shadow-lg"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
