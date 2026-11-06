import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adjustCredits, setLicense, setSuspended, type AdminUser } from "@/lib/admin";
import { licenseLabel, type Profile } from "@/lib/ares-data";
import { isDemoSession } from "@/lib/session";

const inputClass =
  "w-full border border-border bg-background/50 px-3 py-2 font-mono text-xs text-foreground focus:border-telemetry focus:outline-none";
const actionClass =
  "border border-telemetry/60 bg-telemetry/10 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-telemetry transition hover:bg-telemetry/20 disabled:opacity-40";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

export function AdminUserDialog({
  user,
  currentUserId,
  onClose,
}: {
  user: AdminUser;
  currentUserId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState("");
  const [license, setLicenseValue] = useState<Profile["pilot_license"]>(
    user.pilot_license ?? "atmospheric",
  );
  const [reason, setReason] = useState("");

  const readOnly = isDemoSession();
  const hasReason = reason.trim().length >= 3;
  const deltaValue = Number(delta);
  const validDelta = delta.trim() !== "" && Number.isInteger(deltaValue) && deltaValue !== 0;

  const run = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Alteração registrada na auditoria");
      onClose();
    },
    onError: (err) => toast.error("Ação não concluída", { description: err.message }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{user.email}</DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            {user.credential ?? "Sem credencial"}
            {user.is_admin && " · Administrador"}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 border-y border-border/60 py-4">
          <Stat label="Saldo" value={`MC$ ${user.credits.toLocaleString("pt-BR")}`} />
          <Stat label="Gasto" value={`MC$ ${user.spent.toLocaleString("pt-BR")}`} />
          <Stat label="Reservas" value={user.rentals_total} />
        </div>

        {user.suspended && (
          <p className="border border-warning/50 bg-warning/10 p-3 font-mono text-xs text-warning">
            Suspenso: {user.suspended_reason}
          </p>
        )}

        {readOnly && (
          <p className="font-mono text-xs text-muted-foreground">
            Modo demo: dados fictícios, somente leitura.
          </p>
        )}

        <div className="space-y-4">
          <label className="block font-mono text-xs text-muted-foreground">
            Motivo (obrigatório, vai para a auditoria)
            <input
              className={`mt-1.5 ${inputClass}`}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: compensação por tempestade"
            />
          </label>

          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="font-mono text-xs text-muted-foreground">
              Ajustar créditos (+ ou −)
              <input
                className={`mt-1.5 ${inputClass}`}
                type="number"
                step={100}
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="5000"
              />
            </label>
            <button
              type="button"
              className={actionClass}
              disabled={readOnly || !hasReason || !validDelta || run.isPending}
              onClick={() => run.mutate(() => adjustCredits(user.user_id, deltaValue, reason))}
            >
              Ajustar
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="font-mono text-xs text-muted-foreground">
              Habilitação
              <select
                className={`mt-1.5 ${inputClass}`}
                value={license}
                onChange={(e) => setLicenseValue(e.target.value as Profile["pilot_license"])}
              >
                {Object.entries(licenseLabel).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={actionClass}
              disabled={readOnly || !hasReason || license === user.pilot_license || run.isPending}
              onClick={() => run.mutate(() => setLicense(user.user_id, license, reason))}
            >
              Salvar
            </button>
          </div>

          {user.user_id !== currentUserId && (
            <button
              type="button"
              className={
                user.suspended
                  ? `w-full ${actionClass}`
                  : "w-full border border-destructive/60 bg-destructive/10 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-destructive transition hover:bg-destructive/20 disabled:opacity-40"
              }
              disabled={readOnly || !hasReason || run.isPending}
              onClick={() => run.mutate(() => setSuspended(user.user_id, !user.suspended, reason))}
            >
              {user.suspended ? "Reativar conta" : "Suspender conta"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
