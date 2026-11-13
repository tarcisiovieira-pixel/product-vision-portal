import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABEL, MODEL_CATALOG } from "@shared/fleet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VehicleFormDialog } from "@/components/admin/VehicleFormDialog";
import {
  STATUS_LABEL,
  adminVehiclesQuery,
  archiveVehicle,
  restoreVehicle,
  type AdminVehicle,
} from "@/lib/admin-fleet";

const money = (value: number) => `MC$ ${Number(value).toLocaleString("pt-BR")}`;
const buttonClass =
  "inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-foreground transition hover:border-telemetry hover:text-telemetry disabled:opacity-40";

function ReasonDialog({
  vehicle,
  restore,
  onClose,
}: {
  vehicle: AdminVehicle;
  restore: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: () => (restore ? restoreVehicle : archiveVehicle)(vehicle.id, reason),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin"] }),
        qc.invalidateQueries({ queryKey: ["vehicles"] }),
      ]);
      toast.success(restore ? "Veículo restaurado" : "Veículo arquivado");
      onClose();
    },
    onError: (err) => toast.error("Ação não concluída", { description: err.message }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {restore ? "Restaurar" : "Arquivar"} {vehicle.callsign}
          </DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            {restore
              ? "O veículo volta ao catálogo e pode ser reservado."
              : "Some do catálogo e não aceita novas reservas. O histórico e a receita são preservados, e dá para restaurar depois."}
          </p>
        </DialogHeader>
        <label className="block font-mono text-xs text-muted-foreground">
          Motivo (obrigatório, vai para a auditoria)
          <input
            className="mt-1.5 w-full border border-border bg-background/50 px-3 py-2 font-mono text-xs text-foreground focus:border-telemetry focus:outline-none"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={`${buttonClass} border-telemetry/60 bg-telemetry/10 text-telemetry`}
            disabled={reason.trim().length < 3 || run.isPending}
            onClick={() => run.mutate()}
          >
            {restore ? "Restaurar" : "Arquivar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminFleet() {
  const { data: vehicles, error, isPending } = useQuery(adminVehiclesQuery);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<AdminVehicle | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ vehicle: AdminVehicle; restore: boolean } | null>(null);

  if (isPending) {
    return (
      <p className="glass p-5 font-mono text-xs text-muted-foreground">Carregando a frota...</p>
    );
  }
  if (error || !vehicles) {
    return (
      <p role="alert" className="glass p-5 font-mono text-xs text-destructive">
        Não foi possível carregar a frota: {error?.message ?? "erro desconhecido"}. Se o banco ainda
        não recebeu a migration do catálogo, aplique-a primeiro.
      </p>
    );
  }

  const archivedCount = vehicles.filter((v) => v.deleted_at).length;
  const rows = vehicles.filter((v) => showArchived || !v.deleted_at);

  return (
    <section aria-label="Frota" className="glass p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-primary">
          Frota · {vehicles.length - archivedCount} veículos ativos
        </h2>
        <div className="flex items-center gap-3">
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Mostrar arquivados ({archivedCount})
            </label>
          )}
          <button
            type="button"
            className={`${buttonClass} border-telemetry/60 bg-telemetry/10 text-telemetry`}
            onClick={() => setEditing("new")}
          >
            <Plus className="h-3.5 w-3.5" /> Novo veículo
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left font-mono text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Indicativo</th>
              <th className="pr-3">Veículo</th>
              <th className="pr-3">Modelo 3D</th>
              <th className="pr-3">Diária</th>
              <th className="pr-3">Hangar</th>
              <th className="pr-3">Status</th>
              <th className="pr-3">Reservas</th>
              <th className="pr-3">Receita</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr
                key={v.id}
                data-testid={`vehicle-row-${v.callsign}`}
                className={`border-t border-border/40 ${v.deleted_at ? "opacity-50" : ""}`}
              >
                <td className="py-2 pr-3 font-semibold text-foreground">{v.callsign}</td>
                <td className="pr-3">
                  {v.name}
                  <span className="block text-[10px] text-muted-foreground">
                    {CATEGORY_LABEL[v.category]}
                  </span>
                </td>
                <td className="pr-3">{MODEL_CATALOG[v.model_key].label}</td>
                <td className="pr-3">{money(v.daily_rate_sol)}</td>
                <td className="pr-3">{v.hangar_name ?? "—"}</td>
                <td className="pr-3">{v.deleted_at ? "Arquivado" : STATUS_LABEL[v.status]}</td>
                <td className="pr-3">
                  {v.rentals_total}
                  {v.rentals_active > 0 && (
                    <span className="text-telemetry"> ({v.rentals_active} ativas)</span>
                  )}
                </td>
                <td className="pr-3">{money(v.revenue)}</td>
                <td className="py-2">
                  <div className="flex justify-end gap-1.5">
                    {v.deleted_at ? (
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => setConfirm({ vehicle: v, restore: true })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={buttonClass}
                          aria-label={`Editar ${v.callsign}`}
                          onClick={() => setEditing(v)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          aria-label={`Arquivar ${v.callsign}`}
                          onClick={() => setConfirm({ vehicle: v, restore: false })}
                        >
                          <Archive className="h-3.5 w-3.5" /> Arquivar
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <VehicleFormDialog
          key={editing === "new" ? "new" : editing.id}
          vehicle={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {confirm && (
        <ReasonDialog
          key={confirm.vehicle.id}
          vehicle={confirm.vehicle}
          restore={confirm.restore}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
