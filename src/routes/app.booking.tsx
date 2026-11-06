import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InfoTip } from "@/components/InfoTip";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Battery,
  Bot,
  CheckCircle2,
  CloudLightning,
  Compass,
  FileCheck2,
  Gift,
  KeyRound,
  Plane,
  Radio,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Ticket,
  Truck,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { createRental } from "@/lib/ares-actions";
import { PageHeader, Bar, toneFor } from "@/components/PageHeader";
// O viewer carrega o three.js: só baixa quando alguém abre o voo.
const FlightChaseViewer3D = lazy(() =>
  import("@/components/FlightChaseViewer3D").then((m) => ({ default: m.FlightChaseViewer3D })),
);
import {
  categoryLabel,
  getRequiredLicense,
  hangarsQuery,
  isLicenseValidForCategory,
  licenseLabel,
  marsDistanceKm,
  profileQuery,
  rentalsQuery,
  SPACE_ADDONS,
  statusLabel,
  vehiclesQuery,
  weatherQuery,
  type Rental,
  type Vehicle,
  vehicleOccupancyQuery,
  currentSolQuery,
  DEMO_SOL,
} from "@/lib/ares-data";
import { isOccupied } from "@/lib/occupancy";

export const Route = createFileRoute("/app/booking")({
  head: () => ({
    meta: [
      { title: "Locadora — ARES Mobility" },
      { name: "description", content: "Reserve carros voadores, caminhões e foguetes em Marte." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery),
      context.queryClient.ensureQueryData(hangarsQuery),
      context.queryClient.ensureQueryData(weatherQuery),
      context.queryClient.ensureQueryData(rentalsQuery),
    ]),
  errorComponent: ({ error }) => (
    <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>
  ),
  component: Booking,
});

const icons = { car_vtol: Plane, space_truck: Truck, interplanetary_rocket: Rocket } as const;

function Booking() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: weather } = useSuspenseQuery(weatherQuery);
  const { data: rentals } = useSuspenseQuery(rentalsQuery);
  const { data: profile } = useQuery(profileQuery);
  const { data: occupancy = [] } = useQuery(vehicleOccupancyQuery);

  // Começa pelo hangar com mais veículos livres, para a tela nunca abrir sem opções.
  const [defaultHangar] = useState(() => {
    const free = (id: string) =>
      vehicles.filter((v) => v.hangar_id === id && v.status === "available").length;
    return [...hangars].sort((a, b) => free(b.id) - free(a.id))[0]?.id ?? "";
  });
  const [pickup, setPickup] = useState(defaultHangar);
  const [dropoff, setDropoff] = useState(defaultHangar);
  const { data: sol = DEMO_SOL } = useQuery(currentSolQuery);
  const [startInput, setStartSol] = useState<number | null>(null);
  const startSol = startInput ?? sol + 1;
  const [sols, setSols] = useState(3);
  const [cat, setCat] = useState<Vehicle["category"] | "all">("all");

  // Adicionais Marcianos & Segurança
  const [stormBarrierShield, setStormBarrierShield] = useState(true);
  const [silicaInsurance, setSilicaInsurance] = useState(true);
  const [extraO2Tank, setExtraO2Tank] = useState(false);
  const [neuralAutopilot, setNeuralAutopilot] = useState(false);
  const [evaSuits, setEvaSuits] = useState(1);

  // Chave Quântica & Modal do Boarding Pass
  const [activeBoardingPass, setActiveBoardingPass] = useState<Rental | null>(null);
  const [remoteActionNotice, setRemoteActionNotice] = useState<string | null>(null);
  const [chasingVehicle, setChasingVehicle] = useState<Vehicle | null>(null);

  const [bookingNotice, setBookingNotice] = useState<{
    type: "success" | "error";
    message: string;
    details?: string;
  } | null>(null);

  const pickupHangar = hangars.find((h) => h.id === pickup);
  const dropoffHangar = hangars.find((h) => h.id === dropoff);

  const distanceKm = useMemo(() => {
    if (!pickupHangar || !dropoffHangar) return 0;
    return marsDistanceKm(pickupHangar.lat, pickupHangar.lng, dropoffHangar.lat, dropoffHangar.lng);
  }, [pickupHangar, dropoffHangar]);

  const list = useMemo(
    () => vehicles.filter((v) => v.hangar_id === pickup && (cat === "all" || v.category === cat)),
    [vehicles, pickup, cat],
  );

  const storm = weather.find((w) => w.active && w.severity >= 3);
  // Mesma regra do banco: tempestade em um dos hangares da rota exige a barreira.
  const stormHangar = [pickupHangar, dropoffHangar].find((h) => h?.storm_alert);
  const needsBarrier = Boolean(stormHangar) && !stormBarrierShield;

  // Custo diário de adicionais
  const dailyExtrasRate = useMemo(() => {
    let rate = 0;
    if (stormBarrierShield) rate += SPACE_ADDONS.storm_barrier_shield.rate;
    if (silicaInsurance) rate += SPACE_ADDONS.silica_insurance.rate;
    if (extraO2Tank) rate += SPACE_ADDONS.extra_o2_tank.rate;
    if (neuralAutopilot) rate += SPACE_ADDONS.neural_autopilot_l5.rate;
    if (evaSuits > 0) rate += SPACE_ADDONS.extra_eva_suits.rate * evaSuits;
    return rate;
  }, [stormBarrierShield, silicaInsurance, extraO2Tank, neuralAutopilot, evaSuits]);

  const book = useMutation({
    mutationFn: async (v: Vehicle) => {
      // Validação de habilitação no frontend
      if (!isLicenseValidForCategory(profile?.pilot_license, v.category)) {
        throw new Error(
          `Habilitação insuficiente! Seu perfil possui licença "${profile?.pilot_license ? licenseLabel[profile.pilot_license] : "Desconhecida"}", mas este veículo exige "${getRequiredLicense(v.category)}".`,
        );
      }

      const rental = await createRental({
        vehicle: v,
        pickup,
        dropoff,
        startSol,
        endSol: startSol + sols,
        silicaInsurance,
        extraO2Tank,
        neuralAutopilot,
        evaSuits,
        stormBarrier: stormBarrierShield,
        totalCredits: (v.daily_rate_sol + dailyExtrasRate) * sols,
      });
      return { vehicle: v, rental };
    },
    onSuccess: ({ vehicle, rental }) => {
      const successText = `Reserva confirmada: ${vehicle.callsign}`;
      const detailText = `${pickupHangar?.name ?? "Origem"} → ${dropoffHangar?.name ?? "Destino"} · Sols ${startSol}–${startSol + sols}`;

      setBookingNotice({
        type: "success",
        message: successText,
        details: detailText,
      });
      toast.success(successText, { description: detailText });

      setActiveBoardingPass(rental);

      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["rentals"] });
    },
    onError: (e) => {
      const errText = e.message || "Erro desconhecido ao processar reserva.";
      setBookingNotice({
        type: "error",
        message: "Não foi possível confirmar a reserva",
        details: errText,
      });
      toast.error("Falha na reserva", { description: errText });
    },
  });

  const hName = (id: string) => hangars.find((h) => h.id === id)?.name ?? "—";
  const vName = (id: string) => vehicles.find((v) => v.id === id)?.callsign ?? "—";

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <PageHeader kicker="Locadora ARES" title="Para onde vamos voar hoje?">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/app/my-rentals"
            className="cut-corner flex items-center gap-1.5 border border-telemetry/60 bg-telemetry/15 px-3 py-1 font-mono text-xs font-bold text-telemetry hover:bg-telemetry/25 transition shadow-glow"
          >
            <Ticket className="h-3.5 w-3.5" />
            <span>Minhas Reservas ({rentals.length})</span>
          </Link>
          <span className="font-mono text-xs text-telemetry">
            SOL {sol.toLocaleString("pt-BR")} · 09:42 LMST
          </span>
          {profile && (
            <span className="border border-telemetry/40 bg-telemetry/10 px-2.5 py-1 font-mono text-xs text-telemetry">
              HABILITAÇÃO: {licenseLabel[profile.pilot_license].toUpperCase()}
            </span>
          )}
        </div>
      </PageHeader>

      {/* Banner de Benefício Promocional Ativo */}
      {typeof window !== "undefined" && localStorage.getItem("ares_active_promo") && (
        <div className="cut-corner flex items-center justify-between border border-amber-500/70 bg-amber-500/10 p-3 font-mono text-xs text-amber-300 shadow-glow">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>Cupom Ativo:</strong>{" "}
              {JSON.parse(localStorage.getItem("ares_active_promo") || "{}").coupon} ·{" "}
              {JSON.parse(localStorage.getItem("ares_active_promo") || "{}").discountDesc}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("ares_active_promo");
              qc.invalidateQueries();
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground underline ml-2"
          >
            Limpar Cupom
          </button>
        </div>
      )}

      {/* Aviso visual de status de reserva na tela */}
      {bookingNotice && (
        <div
          role="alert"
          className={`cut-corner relative flex items-start justify-between gap-4 border p-4 font-mono text-sm shadow-lg transition-all ${
            bookingNotice.type === "success"
              ? "border-telemetry/60 bg-telemetry/10 text-telemetry"
              : "border-destructive/60 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex items-start gap-3">
            {bookingNotice.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-telemetry" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            )}
            <div className="space-y-1">
              <p className="font-semibold uppercase tracking-wider">{bookingNotice.message}</p>
              {bookingNotice.details && (
                <p className="text-xs text-muted-foreground">{bookingNotice.details}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBookingNotice(null)}
            className="rounded p-1 text-muted-foreground hover:bg-background/40 hover:text-foreground"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Seleção de Hangar e Período */}
      <div className="cut-corner glass space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-5">
          <Select
            label="Hangar Retirada"
            value={pickup}
            onChange={setPickup}
            options={hangars.map((h) => [h.id, h.name])}
          />
          <Select
            label="Hangar Devolução"
            value={dropoff}
            onChange={setDropoff}
            options={hangars.map((h) => [h.id, h.name])}
          />
          <NumberField label="Sol de início" value={startSol} min={sol} onChange={setStartSol} />
          <NumberField label="Duração (sols)" value={sols} min={1} onChange={setSols} />
          <Select
            label="Categoria"
            value={cat}
            onChange={(v) => setCat(v as typeof cat)}
            options={[["all", "Todas"], ...Object.entries(categoryLabel)] as [string, string][]}
          />
        </div>

        {/* Indicador de Rota e Distância Areográfica */}
        <div className="flex flex-wrap items-center justify-between border-t border-muted/50 pt-3 font-mono text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <span>
              Rota estimada: <span className="text-foreground">{pickupHangar?.name}</span> →{" "}
              <span className="text-foreground">{dropoffHangar?.name}</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span>
              Distância:{" "}
              <strong className="text-telemetry">{distanceKm.toLocaleString("pt-BR")} km</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Seção de Opcionais Espaciais de Marte */}
      <div className="glass space-y-3 p-5">
        <h3 className="font-mono text-xs uppercase tracking-widest text-primary">
          Opcionais (+MC$ {dailyExtrasRate.toLocaleString("pt-BR")}/sol)
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Barreira Anti-Tempestade de Areia & Escudo Iônico */}
          <label
            className={`cut-corner flex cursor-pointer items-start gap-3 border p-3 transition sm:col-span-2 lg:col-span-4 ${
              stormBarrierShield
                ? "border-telemetry/80 bg-telemetry/15 text-telemetry"
                : "border-muted bg-surface/50 text-muted-foreground hover:border-telemetry/50"
            }`}
          >
            <input
              type="checkbox"
              checked={stormBarrierShield}
              onChange={(e) => setStormBarrierShield(e.target.checked)}
              className="mt-1 h-4 w-4 accent-telemetry"
            />
            <div className="text-xs flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-telemetry" />
                  Barreira anti-tempestade
                </span>
                <span className="flex items-center gap-2 text-telemetry font-bold">
                  +MC$ 220/sol
                  <InfoTip>Defletor de rególito. Autoriza voo mesmo sob tempestade severa.</InfoTip>
                </span>
              </div>
            </div>
          </label>

          <label className="cut-corner flex cursor-pointer items-start gap-3 border border-muted bg-surface/50 p-3 transition hover:border-primary/50">
            <input
              type="checkbox"
              checked={silicaInsurance}
              onChange={(e) => setSilicaInsurance(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div className="text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                Seguro de sílica{" "}
                <InfoTip>Cobre danos causados por rególito no filtro e nas turbinas.</InfoTip>
              </span>
              <p className="font-mono text-[11px] text-muted-foreground">+MC$ 120/sol</p>
            </div>
          </label>

          <label className="cut-corner flex cursor-pointer items-start gap-3 border border-muted bg-surface/50 p-3 transition hover:border-primary/50">
            <input
              type="checkbox"
              checked={extraO2Tank}
              onChange={(e) => setExtraO2Tank(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div className="text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                Tanque extra de O₂ <InfoTip>Adiciona 120 horas de oxigênio à autonomia.</InfoTip>
              </span>
              <p className="font-mono text-[11px] text-muted-foreground">+MC$ 180/sol</p>
            </div>
          </label>

          <label className="cut-corner flex cursor-pointer items-start gap-3 border border-muted bg-surface/50 p-3 transition hover:border-primary/50">
            <input
              type="checkbox"
              checked={neuralAutopilot}
              onChange={(e) => setNeuralAutopilot(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div className="text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                Autopiloto neural <InfoTip>Navegação orbital autônoma nível 5.</InfoTip>
              </span>
              <p className="font-mono text-[11px] text-muted-foreground">+MC$ 350/sol</p>
            </div>
          </label>

          <div className="cut-corner flex items-center justify-between border border-muted bg-surface/50 p-3 text-xs">
            <div>
              <span className="font-semibold text-foreground">Trajes EVA Reforçados</span>
              <p className="font-mono text-[11px] text-muted-foreground">+MC$ 100/un por sol</p>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <button
                type="button"
                onClick={() => setEvaSuits(Math.max(0, evaSuits - 1))}
                className="border px-2 py-0.5 text-xs hover:border-primary"
              >
                -
              </button>
              <span>{evaSuits}</span>
              <button
                type="button"
                onClick={() => setEvaSuits(Math.min(6, evaSuits + 1))}
                className="border px-2 py-0.5 text-xs hover:border-primary"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de Tempestade & Status da Barreira */}
      {(stormHangar || storm) && (
        <div
          className={`flex items-center gap-3 border px-4 py-3 text-sm font-mono ${
            stormBarrierShield
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
              : "border-warning/40 bg-warning/10 text-warning"
          }`}
        >
          {stormBarrierShield ? (
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
          ) : (
            <CloudLightning className="h-5 w-5 shrink-0" />
          )}
          <div>
            {stormBarrierShield ? (
              <p className="text-xs">
                <span className="font-bold">Barreira ativa.</span> Decolagem autorizada.
              </p>
            ) : (
              <p className="text-xs">
                <span className="font-bold">Alerta Climático:</span>{" "}
                {stormHangar
                  ? `Ventos severos em ${stormHangar.name}`
                  : `${storm!.name} ativa (${storm!.wind_speed_kmh} km/h)`}
                . Ative a Barreira Anti-Tempestade para liberar a decolagem.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Grid de Veículos */}
      <div className="grid gap-6 md:grid-cols-3">
        {list.length === 0 && (
          <p className="text-muted-foreground">
            Nenhum veículo disponível no hangar para os filtros escolhidos.
          </p>
        )}
        {list.map((v) => {
          const Icon = icons[v.category];
          const baseDaily = Number(v.daily_rate_sol);
          const totalDaily = baseDaily + dailyExtrasRate;
          const totalBooking = totalDaily * sols;
          const okStatus = v.status === "available";
          const hasLicense = isLicenseValidForCategory(profile?.pilot_license, v.category);
          const occupied = isOccupied(occupancy, v.id, startSol, startSol + sols);
          const canBook = okStatus && hasLicense && !occupied && !needsBarrier && !book.isPending;

          return (
            <div
              key={v.id}
              className={`cut-corner flex flex-col border p-6 transition ${
                hasLicense
                  ? "bg-surface hover:border-primary/60"
                  : "border-destructive/30 bg-surface/30 opacity-80"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-7 w-7 text-primary" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {categoryLabel[v.category]}
                </span>
              </div>

              <h3 className="mt-4 font-display text-xl font-semibold">{v.name}</h3>
              <p className="font-mono text-xs text-muted-foreground">
                {v.callsign} ·{" "}
                <span className={okStatus && !occupied ? "text-telemetry" : "text-warning"}>
                  {okStatus && occupied ? "Reservado neste período" : statusLabel[v.status]}
                </span>
              </p>

              {/* Selo de Validação de Licença */}
              <div className="mt-3">
                {hasLicense ? (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-telemetry">
                    <ShieldCheck className="h-3.5 w-3.5" /> Habilitação Compatível
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-destructive font-semibold">
                    <ShieldAlert className="h-3.5 w-3.5" /> Exige Licença{" "}
                    {getRequiredLicense(v.category)}
                  </span>
                )}
              </div>

              <dl className="mt-4 space-y-2 font-mono text-xs">
                <Row k="O₂ Autonomia" v={`${v.o2_hours} h`} icon={Wind} />
                <Row k="Bateria" v={`${v.battery_pct}%`} icon={Battery} />
              </dl>
              <div className="mt-3">
                <Bar value={v.battery_pct} tone={toneFor(v.battery_pct)} />
              </div>

              <div className="mt-6 border-t pt-4">
                <p className="font-display text-2xl font-bold">
                  MC$ {totalDaily.toLocaleString("pt-BR")}
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / Sol (com adicionais)
                  </span>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  Total para {sols} sols: MC$ {totalBooking.toLocaleString("pt-BR")}
                </p>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2">
                <button
                  disabled={!canBook}
                  onClick={() => book.mutate(v)}
                  className={`cut-corner py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground shadow-glow transition disabled:opacity-40 ${
                    hasLicense ? "bg-mars-gradient" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {!hasLicense
                    ? `Requer Licença ${getRequiredLicense(v.category)}`
                    : !okStatus
                      ? "Indisponível"
                      : occupied
                        ? "Reservado neste período"
                        : needsBarrier
                          ? "Ative a barreira anti-tempestade"
                          : book.isPending
                            ? "Emitindo Chave Quântica..."
                            : "Reservar Agora"}
                </button>

                <button
                  type="button"
                  onClick={() => setChasingVehicle(v)}
                  className="cut-corner flex items-center justify-center gap-1.5 border border-telemetry/40 bg-telemetry/10 py-2 font-mono text-xs text-telemetry transition hover:border-telemetry hover:bg-telemetry/20"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Acompanhar Voo 3D</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lista de Reservas & Emissão de Boarding Pass */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-2">
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Minhas Reservas Ativas & Boarding Passes ({rentals.length})
          </h2>
          <Link
            to="/app/my-rentals"
            className="flex items-center gap-1.5 font-mono text-xs text-telemetry hover:underline font-bold"
          >
            <span>Ver Histórico Completo & Promoções</span>
            <span>➔</span>
          </Link>
        </div>

        {rentals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma reserva ativa vinculada à sua credencial espacial.
          </p>
        ) : (
          <div className="divide-y border font-mono text-xs">
            {rentals.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-surface/50"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary">{vName(r.vehicle_id)}</span>
                    <span className="rounded bg-telemetry/15 px-2 py-0.5 text-[10px] text-telemetry uppercase">
                      {r.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {hName(r.pickup_hangar_id)} → {hName(r.dropoff_hangar_id)} · Sols {r.start_sol}{" "}
                    a {r.end_sol}
                  </p>
                  <p className="text-[11px] text-telemetry">
                    Chave Quântica:{" "}
                    <code className="font-mono font-bold text-foreground">
                      {r.quantum_key ?? "Q-KEY#8F4A92"}
                    </code>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-display text-base text-foreground">
                      MC$ {Number(r.total_credits).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Tarifa Total c/ Adicionais</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const targetVeh =
                        vehicles.find((veh) => veh.id === r.vehicle_id) || vehicles[0];
                      if (targetVeh) setChasingVehicle(targetVeh);
                    }}
                    className="cut-corner flex items-center gap-1.5 border border-primary/60 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary/20"
                  >
                    <Rocket className="h-4 w-4" />
                    <span>Voo 3D</span>
                  </button>

                  <button
                    onClick={() => setActiveBoardingPass(r)}
                    className="cut-corner flex items-center gap-2 border border-telemetry/50 bg-telemetry/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-telemetry transition hover:bg-telemetry/20"
                  >
                    <KeyRound className="h-4 w-4" />
                    Chave Quântica
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal 3D Chase Viewer de Voo e Percurso */}
      {chasingVehicle && (
        <Suspense fallback={null}>
          <FlightChaseViewer3D
            vehicle={chasingVehicle}
            allVehicles={vehicles}
            hangars={hangars}
            onClose={() => setChasingVehicle(null)}
            onSelectVehicle={(v) => {
              if (v.status !== "in_flight") {
                setChasingVehicle(null);
                navigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
              } else {
                setChasingVehicle(v);
              }
            }}
            onNavigateHangar={(v) => {
              setChasingVehicle(null);
              navigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
            }}
          />
        </Suspense>
      )}

      {/* Modal / Overlay de Boarding Pass Quântico & Controles Remotos */}
      {activeBoardingPass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="cut-corner glass relative w-full max-w-lg space-y-6 border border-telemetry/50 p-6 font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-telemetry/30 pb-4">
              <div className="flex items-center gap-2 text-telemetry">
                <Radio className="h-5 w-5 animate-pulse" />
                <h3 className="font-display text-lg font-bold uppercase tracking-wider">
                  Boarding Pass Quântico
                </h3>
              </div>
              <button
                onClick={() => {
                  setActiveBoardingPass(null);
                  setRemoteActionNotice(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Chave Criptográfica */}
            <div className="border border-telemetry/40 bg-telemetry/10 p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Chave Criptográfica Quântica
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-telemetry">
                {activeBoardingPass.quantum_key ?? "Q-KEY#8F4A92"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                ASSINATURA RSA-MARS-4096 BIT · ACESSO DIRETO À ESCLUSA
              </p>
            </div>

            {remoteActionNotice && (
              <div className="flex items-center gap-2 border border-telemetry/60 bg-telemetry/20 p-2.5 text-telemetry">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{remoteActionNotice}</span>
              </div>
            )}

            {/* Controles Remotos do Veículo */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-primary">
                Comandos Remotos via Enlace Orbital
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRemoteActionNotice(
                      "Esclusa de ar principal destravada. Pressurização externa verificada.",
                    );
                    toast.success("Esclusa destravada com sucesso!");
                  }}
                  className="cut-corner flex flex-col items-center justify-center gap-1 border border-muted bg-surface/80 p-3 text-center transition hover:border-telemetry hover:text-telemetry"
                >
                  <KeyRound className="h-4 w-4" />
                  <span className="text-[10px]">Destravar Esclusa</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRemoteActionNotice(
                      "Cabine pré-pressurizada para 101.3 kPa com mistura 78% N₂ / 21% O₂.",
                    );
                    toast.success("Cabine pré-pressurizada (101.3 kPa)!");
                  }}
                  className="cut-corner flex flex-col items-center justify-center gap-1 border border-muted bg-surface/80 p-3 text-center transition hover:border-telemetry hover:text-telemetry"
                >
                  <Wind className="h-4 w-4" />
                  <span className="text-[10px]">Pré-pressurizar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRemoteActionNotice(
                      "Autopiloto Neural ativado. Veículo manobrando para o portão de embarque.",
                    );
                    toast.success("Aeronave taxiando via Autopiloto!");
                  }}
                  className="cut-corner flex flex-col items-center justify-center gap-1 border border-muted bg-surface/80 p-3 text-center transition hover:border-telemetry hover:text-telemetry"
                >
                  <Bot className="h-4 w-4" />
                  <span className="text-[10px]">Chamar Autopiloto</span>
                </button>
              </div>
            </div>

            {/* Checklist Pré-Voo & Status da Barreira */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between text-[11px] pb-1">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Barreira Anti-Tempestade:
                </span>
                <span className="font-bold text-emerald-400">ATIVA (ESCUDO IÔNICO 100%)</span>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Checklist Pré-Voo de Segurança
              </p>
              <ul className="space-y-1.5 text-[11px] text-muted-foreground">
                <li className="flex items-center gap-2 text-foreground">
                  <FileCheck2 className="h-3.5 w-3.5 text-telemetry" />
                  1. Pressão de Cabine nominal: 101.3 kPa
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <FileCheck2 className="h-3.5 w-3.5 text-telemetry" />
                  2. Autonomia de O₂ validada para os Sols da viagem
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <FileCheck2 className="h-3.5 w-3.5 text-telemetry" />
                  3. Trajes EVA selados e testados no compartimento de ar
                </li>
              </ul>

              {/* Botão para Acompanhar em 3D */}
              <button
                type="button"
                onClick={() => {
                  const targetVeh =
                    vehicles.find((v) => v.id === activeBoardingPass.vehicle_id) || vehicles[0];
                  setActiveBoardingPass(null);
                  if (targetVeh) setChasingVehicle(targetVeh);
                }}
                className="cut-corner mt-3 flex w-full items-center justify-center gap-2 border border-telemetry bg-telemetry/20 py-2.5 font-sans font-bold uppercase tracking-wider text-telemetry transition hover:bg-telemetry/30 shadow-glow"
              >
                <Rocket className="h-4 w-4" />
                <span>Acompanhar Voo 3D no Percurso</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border bg-background/50 px-3 py-3 text-sm outline-none focus:border-primary"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-surface">
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        className="w-full border bg-background/50 px-3 py-3 font-mono text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Row({ k, v, icon: Icon }: { k: string; v: string; icon?: typeof Wind }) {
  return (
    <div className="flex justify-between">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {k}
      </dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}
