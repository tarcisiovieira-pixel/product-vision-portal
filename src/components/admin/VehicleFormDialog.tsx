import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MODEL_CATALOG, MODEL_KEYS, modelCategory, type ModelKey } from "@shared/fleet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  STATUS_LABEL,
  formFromTemplate,
  formFromVehicle,
  saveVehicle,
  validateVehicleForm,
  type AdminVehicle,
  type VehicleForm,
  type VehicleStatus,
} from "@/lib/admin-fleet";
import { hangarsQuery } from "@/lib/ares-data";

// Three.js só é baixado quando o formulário abre.
const HangarScene = lazy(() => import("@/components/HangarScene"));

const inputClass =
  "w-full border border-border bg-background/50 px-3 py-2 font-mono text-xs text-foreground focus:border-telemetry focus:outline-none";
const actionClass =
  "border border-telemetry/60 bg-telemetry/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-telemetry transition hover:bg-telemetry/20 disabled:opacity-40";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block font-mono text-xs text-muted-foreground">
      {label}
      <div className="mt-1.5">{children}</div>
      {error && (
        <span role="alert" className="mt-1 block text-[11px] text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}

export function VehicleFormDialog({
  vehicle,
  onClose,
}: {
  /** Veículo a editar; ausente = cadastrar um novo. */
  vehicle: AdminVehicle | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: hangars = [] } = useQuery(hangarsQuery);
  const [form, setForm] = useState<VehicleForm>(() =>
    vehicle ? formFromVehicle(vehicle) : formFromTemplate("cybercab_x2"),
  );
  const [touched, setTouched] = useState(false);

  // Veículo novo já nasce no primeiro hangar: sem hangar, ninguém consegue reservá-lo.
  const firstHangar = hangars[0]?.id ?? null;
  useEffect(() => {
    if (!vehicle && firstHangar) setForm((f) => (f.hangarId ? f : { ...f, hangarId: firstHangar }));
  }, [vehicle, firstHangar]);
  const errors = validateVehicleForm(form);
  const shown = touched ? errors : {};
  const set = <K extends keyof VehicleForm>(key: K, value: VehicleForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const num = (key: "dailyRate" | "seats" | "cargoKg" | "rangeKm") => ({
    type: "number" as const,
    className: inputClass,
    value: Number.isFinite(form[key]) ? form[key] : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, e.target.value === "" ? Number.NaN : Number(e.target.value)),
  });

  const save = useMutation({
    mutationFn: () => saveVehicle(vehicle?.id ?? null, form),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin"] }),
        qc.invalidateQueries({ queryKey: ["vehicles"] }),
      ]);
      toast.success(vehicle ? "Veículo atualizado" : "Veículo cadastrado");
      onClose();
    },
    onError: (err) => toast.error("Não foi possível salvar", { description: err.message }),
  });

  const pickTemplate = (key: ModelKey) =>
    setForm((f) =>
      vehicle
        ? { ...f, modelKey: key }
        : { ...formFromTemplate(key, f.reason, f.hangarId), callsign: f.callsign },
    );

  const categoryChanged = vehicle && modelCategory(form.modelKey) !== vehicle.category;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-surface sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {vehicle ? `Editar ${vehicle.callsign}` : "Novo veículo"}
          </DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            O modelo 3D define a categoria. Tudo fica registrado na auditoria.
          </p>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_20rem]">
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (Object.keys(errors).length === 0) save.mutate();
            }}
          >
            <fieldset>
              <legend className="mb-2 font-mono text-xs text-muted-foreground">
                Modelo 3D {vehicle ? "" : "(preenche a ficha com valores de exemplo)"}
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MODEL_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={form.modelKey === key}
                    onClick={() => pickTemplate(key)}
                    className={`border p-2 text-left transition ${
                      form.modelKey === key
                        ? "border-telemetry bg-telemetry/10"
                        : "border-border hover:border-telemetry/50"
                    }`}
                  >
                    <span className="block font-mono text-[11px] font-semibold text-foreground">
                      {MODEL_CATALOG[key].label}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {MODEL_CATALOG[key].tagline}
                    </span>
                  </button>
                ))}
              </div>
              {categoryChanged && (
                <p className="mt-2 font-mono text-[11px] text-warning">
                  Isto troca a categoria do veículo. Não é permitido com reservas ativas.
                </p>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" error={shown.name}>
                <input
                  className={inputClass}
                  value={form.name}
                  maxLength={80}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="Indicativo (único)" error={shown.callsign}>
                <input
                  className={inputClass}
                  value={form.callsign}
                  maxLength={20}
                  placeholder="CC-10"
                  onChange={(e) => set("callsign", e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Diária (MC$)" error={shown.dailyRate}>
                <input {...num("dailyRate")} min={1} />
              </Field>
              <Field label="Hangar">
                <select
                  className={inputClass}
                  value={form.hangarId ?? ""}
                  onChange={(e) => set("hangarId", e.target.value || null)}
                >
                  <option value="">Sem hangar (não aparece para reserva)</option>
                  {hangars.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assentos" error={shown.seats}>
                <input {...num("seats")} min={1} />
              </Field>
              <Field label="Carga (kg)" error={shown.cargoKg}>
                <input {...num("cargoKg")} min={0} />
              </Field>
              <Field label="Autonomia (km)" error={shown.rangeKm}>
                <input {...num("rangeKm")} min={1} />
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as VehicleStatus)}
                >
                  {(Object.keys(STATUS_LABEL) as VehicleStatus[]).map((s) => (
                    <option
                      key={s}
                      value={s}
                      disabled={s === "in_flight" && vehicle?.status !== "in_flight"}
                    >
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Descrição" error={shown.description}>
              <textarea
                className={inputClass}
                rows={2}
                value={form.description}
                maxLength={400}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>

            <Field label="Motivo (obrigatório, vai para a auditoria)" error={shown.reason}>
              <input
                className={inputClass}
                value={form.reason}
                maxLength={300}
                placeholder="Ex.: expansão da frota"
                onChange={(e) => set("reason", e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={`${actionClass} opacity-70`}>
                Cancelar
              </button>
              <button type="submit" className={actionClass} disabled={save.isPending}>
                {save.isPending ? "Salvando..." : vehicle ? "Salvar alterações" : "Cadastrar"}
              </button>
            </div>
          </form>

          <div
            className="relative hidden h-72 border border-border/60 md:block md:h-auto md:min-h-80"
            aria-label="Prévia 3D do modelo"
          >
            <Suspense
              fallback={
                <div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">
                  Carregando prévia 3D...
                </div>
              }
            >
              <HangarScene
                category={modelCategory(form.modelKey)}
                modelKey={form.modelKey}
                name={form.name}
                callsign={form.callsign}
              />
            </Suspense>
            <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-muted-foreground">
              PRÉVIA 3D · ARRASTE PARA GIRAR
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
