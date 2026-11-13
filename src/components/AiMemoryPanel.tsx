import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { memoryLabel, type MemoryItem } from "@shared/memory";
import { forgetAll, forgetItem, memoryQuery, setMemoryEnabled } from "@/lib/ai-memory";
import { hangarsQuery } from "@/lib/ares-data";

const SOURCE_LABEL: Record<MemoryItem["source"], string> = {
  stated: "você disse",
  inferred: "deduzido",
  feedback: "você dispensou",
};

/**
 * Tudo o que a IA lembra sobre a conta, à vista: o usuário apaga item por item, apaga tudo
 * ou desliga. A memória guarda só preferências de viagem, nunca e-mail, nome ou texto livre.
 */
export function AiMemoryPanel() {
  const qc = useQueryClient();
  const { data: memory } = useQuery(memoryQuery);
  const { data: hangars = [] } = useQuery(hangarsQuery);
  const refresh = () => qc.invalidateQueries({ queryKey: ["ai", "memory"] });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setMemoryEnabled(enabled),
    onSuccess: refresh,
    onError: (e) => toast.error("Não foi possível alterar", { description: e.message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => forgetItem(id),
    onSuccess: refresh,
    onError: (e) => toast.error("Não foi possível apagar", { description: e.message }),
  });
  const clear = useMutation({
    mutationFn: () => forgetAll(),
    onSuccess: async () => {
      await refresh();
      toast.success("Memória apagada");
    },
    onError: (e) => toast.error("Não foi possível apagar", { description: e.message }),
  });

  if (!memory?.available) return null;
  const hangarsLite = hangars.map((h) => ({ ...h }));

  return (
    <details className="glass p-5" data-testid="ai-memory">
      <summary className="flex cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
        <Brain className="h-4 w-4" /> Memória da IA ·{" "}
        {memory.enabled ? `${memory.items.length} lembrança(s)` : "desligada"}
      </summary>

      <div className="mt-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          A IA lembra preferências de viagem que você diz com clareza (&quot;sempre prefiro o mais
          barato&quot;) e usa o seu histórico de reservas para sugerir melhor. Só guarda
          preferências, nunca e-mail, nome ou texto livre. Se a IA generativa estiver ligada, o
          resumo dessas preferências é enviado ao provedor junto com o pedido. Você vê, apaga ou
          desliga tudo aqui.
        </p>

        <label className="flex items-center gap-2 font-mono text-xs text-foreground">
          <input
            type="checkbox"
            checked={memory.enabled}
            disabled={toggle.isPending}
            onChange={(e) => toggle.mutate(e.target.checked)}
          />
          Usar memória e histórico nas respostas da IA
        </label>

        {memory.enabled &&
          (memory.items.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              Nada guardado ainda. Experimente dizer, por exemplo: &quot;Eu sempre prefiro o mais
              barato e costumo viajar com 2 pessoas&quot;.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {memory.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 border border-border/50 px-3 py-2 text-xs"
                >
                  <span className="text-foreground">
                    {memoryLabel(item.topic, item.value, hangarsLite)}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      ({SOURCE_LABEL[item.source]})
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Apagar: ${memoryLabel(item.topic, item.value, hangarsLite)}`}
                    onClick={() => remove.mutate(item.id)}
                    className="text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {memory.items.length > 0 && (
          <button
            type="button"
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
            className="border border-destructive/60 bg-destructive/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-destructive transition hover:bg-destructive/20 disabled:opacity-40"
          >
            Apagar toda a memória
          </button>
        )}
      </div>
    </details>
  );
}
