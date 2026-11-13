import { createFileRoute, Link } from "@tanstack/react-router";
import { useSafeNavigate } from "@/hooks/use-safe-navigate";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellRing,
  Building2,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  ExternalLink,
  Flame,
  Gift,
  Info,
  KeyRound,
  Navigation,
  Plane,
  Radio,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Ticket,
  Truck,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cancelRental, extendRental } from "@/lib/ares-actions";
import { errorMessage } from "@/lib/utils";
import { PageHeader, Bar, toneFor } from "@/components/PageHeader";
// O viewer carrega o three.js: só baixa quando alguém abre o voo.
const FlightChaseViewer3D = lazy(() =>
  import("@/components/FlightChaseViewer3D").then((m) => ({ default: m.FlightChaseViewer3D })),
);
import {
  categoryLabel,
  hangarsQuery,
  marsDistanceKm,
  profileQuery,
  rentalsQuery,
  currentSolQuery,
  DEMO_SOL,
  statusLabel,
  vehiclesQuery,
  type Hangar,
  type Rental,
  type Vehicle,
} from "@/lib/ares-data";

export const Route = createFileRoute("/app/my-rentals")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Minhas Reservas — ARES Mobility" },
      {
        name: "description",
        content: "Histórico completo de reservas, chaves quânticas e telemetria da frota marciana.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery),
      context.queryClient.ensureQueryData(hangarsQuery),
      context.queryClient.ensureQueryData(rentalsQuery),
    ]),
  errorComponent: ({ error }) => (
    <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>
  ),
  component: MyRentals,
});

const icons = { car_vtol: Plane, space_truck: Truck, interplanetary_rocket: Rocket } as const;

function MyRentals() {
  const qc = useQueryClient();
  const navigate = useSafeNavigate();

  const safeNavigate = (opts: { to: string; search?: Record<string, string> }) => {
    if (navigate) {
      navigate(opts as unknown as Parameters<typeof navigate>[0]);
    } else if (typeof window !== "undefined") {
      const search = opts.search ? `?${new URLSearchParams(opts.search).toString()}` : "";
      window.location.href = `${opts.to}${search}`;
    }
  };

  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: rentals } = useSuspenseQuery(rentalsQuery);
  const { data: sol = DEMO_SOL } = useQuery(currentSolQuery);
  const { data: profile } = useQuery(profileQuery);

  const [filterStatus, setFilterStatus] = useState<"all" | "in_flight" | "confirmed" | "completed">(
    "all",
  );
  const [searchTerm, setSearchTerm] = useState("");

  // Modais de Detalhes e Ações
  const [selectedRentalDetail, setSelectedRentalDetail] = useState<Rental | null>(null);
  const [activeBoardingPass, setActiveBoardingPass] = useState<Rental | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [remoteActionNotice, setRemoteActionNotice] = useState<string | null>(null);
  const [chasingVehicle, setChasingVehicle] = useState<Vehicle | null>(null);

  // Notificações
  const [notifyOrbit, setNotifyOrbit] = useState(true);
  const [notifyStorms, setNotifyStorms] = useState(true);
  const [notifyPromos, setNotifyPromos] = useState(true);
  const [showPromos, setShowPromos] = useState(true);

  const vMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const hMap = useMemo(() => new Map(hangars.map((h) => [h.id, h])), [hangars]);

  // Lista Filtrada de Reservas
  const filteredRentals = useMemo(() => {
    return rentals.filter((r) => {
      const matchStatus =
        filterStatus === "all"
          ? true
          : filterStatus === "in_flight"
            ? r.status === "in_flight"
            : filterStatus === "confirmed"
              ? r.status === "confirmed"
              : r.status === "completed" || r.status === "cancelled";

      const veh = vMap.get(r.vehicle_id);
      const query = searchTerm.toLowerCase().trim();
      const matchSearch =
        !query ||
        r.id.toLowerCase().includes(query) ||
        (r.quantum_key ?? "").toLowerCase().includes(query) ||
        (veh?.name ?? "").toLowerCase().includes(query) ||
        (veh?.callsign ?? "").toLowerCase().includes(query);

      return matchStatus && matchSearch;
    });
  }, [rentals, filterStatus, searchTerm, vMap]);

  // Estatísticas
  const stats = useMemo(() => {
    const active = rentals.filter(
      (r) => r.status === "in_flight" || r.status === "confirmed",
    ).length;
    const totalSols = rentals.reduce(
      (acc, r) => acc + Math.max(1, (r.end_sol ?? r.start_sol) - r.start_sol),
      0,
    );
    const totalSpent = rentals.reduce((acc, r) => acc + Number(r.total_credits || 0), 0);
    return { count: rentals.length, active, totalSols, totalSpent };
  }, [rentals]);

  // Copiar Chave Quântica
  const copyQuantumKey = (key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(key);
      toast.success("Chave Quântica copiada!", { description: key });
    }
  };

  // Estender Reserva (+1 Sol)
  const handleExtendRental = async (r: Rental) => {
    const rate = vMap.get(r.vehicle_id)?.daily_rate_sol ?? 420;
    try {
      const newEndSol = await extendRental(r, rate);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["rentals"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success("Reserva estendida", { description: `Válida até o Sol ${newEndSol}.` });
    } catch (err) {
      toast.error("Não foi possível estender", { description: errorMessage(err) });
    }
  };

  // Cancelar Reserva
  const handleCancelRental = async (r: Rental) => {
    if (r.status === "in_flight") {
      toast.error("Não é possível cancelar uma nave em voo.");
      return;
    }
    try {
      const refunded = await cancelRental(r);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["rentals"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success("Reserva cancelada", {
        description: `MC$ ${Number(refunded).toLocaleString("pt-BR")} devolvidos ao saldo.`,
      });
    } catch (err) {
      toast.error("Não foi possível cancelar", { description: errorMessage(err) });
    }
  };

  // Aplicar Cupom
  const handleApplyPromo = (coupon: string, discountDesc: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ares_active_promo", JSON.stringify({ coupon, discountDesc }));
    }
    toast.success(`Cupom ${coupon} aplicado!`, {
      description: `${discountDesc} — Redirecionando para a locadora...`,
    });
    safeNavigate({ to: "/app/booking" });
  };

  return (
    <div className="space-y-5 p-6 md:p-8">
      {/* 1. HEADER LIMPO & AÇÕES */}
      <PageHeader
        kicker="Reservas"
        title="Minhas reservas"
        info="Acompanhe, estenda ou cancele reservas. Cancelar uma reserva confirmada devolve os créditos ao saldo."
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPromoModalOpen(true)}
            className="cut-corner flex items-center gap-1.5 border border-primary/50 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 font-mono text-xs text-primary transition font-bold"
          >
            <Gift className="h-3.5 w-3.5" />
            <span>Benefícios & Cupons</span>
          </button>

          <Link
            to="/app/booking"
            className="cut-corner flex items-center gap-2 border border-primary/70 bg-primary/20 px-3.5 py-1.5 font-mono text-xs font-bold text-primary hover:bg-primary/30 transition shadow-glow"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            <span>Nova Reserva</span>
          </Link>
        </div>
      </PageHeader>

      {/* 2. BARRA DE MÉTRICAS COMPACTA & AIRY (HUD STRIP) */}
      <div className="glass border border-border/50 px-4 py-2.5 rounded font-mono text-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-[10px] uppercase text-muted-foreground block">
              Total de Reservas
            </span>
            <span className="font-display font-bold text-foreground text-base">{stats.count}</span>
          </div>

          <div className="border-l border-border/40 pl-6">
            <span className="text-[10px] uppercase text-emerald-400 block">
              Reservas Ativas / Voo
            </span>
            <span className="font-display font-bold text-emerald-400 text-base flex items-center gap-1.5">
              {stats.active}
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            </span>
          </div>

          <div className="border-l border-border/40 pl-6 hidden sm:block">
            <span className="text-[10px] uppercase text-muted-foreground block">
              Sols em Missão
            </span>
            <span className="font-display font-bold text-primary text-base">
              {stats.totalSols} sols
            </span>
          </div>
        </div>

        <div>
          <span className="text-[10px] uppercase text-muted-foreground block text-right">
            Total investido
          </span>
          <span className="font-display font-bold text-foreground text-base">
            MC$ {stats.totalSpent.toLocaleString("pt-BR")}
          </span>
        </div>
      </div>

      {/* 3. CUPONS DISPONÍVEIS (SEÇÃO COMPACTA / SUCINTA) */}
      <div className="border border-border/40 bg-surface/20 rounded p-2.5 font-mono text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground text-[11px]">Cupons disponíveis</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleApplyPromo("APEX-VIP35", "35% de desconto no Apex Phantom VIP")}
            className="text-[10px] text-amber-300 hover:underline font-bold"
          >
            APEX-VIP35
          </button>
          <span className="text-border">·</span>
          <button
            type="button"
            onClick={() => handleApplyPromo("ESCUDO-ZERO", "Barreira Anti-Tempestade Gratuita")}
            className="text-[10px] text-emerald-400 hover:underline font-bold"
          >
            ESCUDO-ZERO
          </button>
          <span className="text-border">·</span>
          <button
            type="button"
            onClick={() => setIsPromoModalOpen(true)}
            className="text-[10px] text-telemetry hover:underline font-semibold"
          >
            Ver Todos
          </button>
        </div>
      </div>

      {/* 4. FILTROS & LISTA DE RESERVAS */}
      <section className="space-y-3 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {[
              { id: "all", label: `Todas (${rentals.length})` },
              {
                id: "in_flight",
                label: `Em Voo (${rentals.filter((r) => r.status === "in_flight").length})`,
              },
              {
                id: "confirmed",
                label: `Confirmadas (${rentals.filter((r) => r.status === "confirmed").length})`,
              },
              {
                id: "completed",
                label: `Concluídas (${rentals.filter((r) => r.status === "completed" || r.status === "cancelled").length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id as Parameters<typeof setFilterStatus>[0])}
                className={`cut-corner px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                  filterStatus === tab.id
                    ? "border border-primary bg-primary/20 text-primary font-bold shadow-glow"
                    : "border border-border/60 bg-surface/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-56">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar nave ou chave..."
              className="w-full border border-border/70 bg-background/80 px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-telemetry focus:outline-none rounded"
            />
          </div>
        </div>

        {filteredRentals.length === 0 ? (
          <div className="cut-corner glass border border-border/60 p-8 text-center space-y-3">
            <Ticket className="mx-auto h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">
              Nenhuma reserva encontrada neste filtro.
            </p>
            <Link
              to="/app/booking"
              className="cut-corner inline-flex items-center gap-2 border border-primary/70 bg-primary/20 px-3.5 py-1.5 text-xs font-bold uppercase text-primary hover:bg-primary/30 transition shadow-glow mt-2"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              <span>Ir para a Locadora</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredRentals.map((r) => {
              const veh = vMap.get(r.vehicle_id);
              const pickupH = hMap.get(r.pickup_hangar_id);
              const dropoffH = hMap.get(r.dropoff_hangar_id);
              const Icon = veh ? icons[veh.category] : Plane;
              const isInFlight = r.status === "in_flight";
              const isConfirmed = r.status === "confirmed";
              const isCompleted = r.status === "completed";
              const isCancelled = r.status === "cancelled";

              return (
                <div
                  key={r.id}
                  className={`cut-corner glass border px-4 py-3.5 transition flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${
                    isInFlight
                      ? "border-telemetry/60 bg-telemetry/[0.03] shadow-[0_0_15px_rgba(0,240,255,0.05)]"
                      : isConfirmed
                        ? "border-emerald-500/40 bg-emerald-500/[0.02]"
                        : "border-border/50 hover:border-border/80"
                  }`}
                >
                  {/* Lado Esquerdo: Identificação & Rota Sintética */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border/80 bg-background/80 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-sm font-bold text-foreground truncate">
                          {veh?.name ?? "Espaçonave Marciana"}
                        </h3>
                        <span className="rounded bg-primary/15 px-1.5 py-0.2 text-[10px] text-primary font-bold shrink-0">
                          {veh?.callsign ?? "ARS-00"}
                        </span>
                        <code className="text-[10px] text-telemetry/80 bg-telemetry/10 px-1.5 py-0.2 rounded border border-telemetry/20 shrink-0">
                          {r.quantum_key ?? "QK-ARES-8831-VAL"}
                        </code>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="truncate">
                          {pickupH?.name?.replace("Hangar ", "") ?? "Origem"} ➔{" "}
                          {dropoffH?.name?.replace("Hangar ", "") ?? "Destino"}
                        </span>
                        <span>·</span>
                        <span className="text-primary font-medium shrink-0">
                          Sol {r.start_sol}–{r.end_sol}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lado Direito: Status, Tarifa e Botão de Detalhes em Modal */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/30">
                    <div className="text-left md:text-right">
                      <div className="flex items-center md:justify-end gap-1.5">
                        {isInFlight && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-telemetry uppercase">
                            <Radio className="h-2.5 w-2.5 animate-pulse" /> EM VOO
                          </span>
                        )}
                        {isConfirmed && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase">
                            <CheckCircle2 className="h-2.5 w-2.5" /> CONFIRMADA
                          </span>
                        )}
                        {isCompleted && (
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">
                            CONCLUÍDA
                          </span>
                        )}
                        {isCancelled && (
                          <span className="text-[10px] font-medium text-destructive uppercase">
                            CANCELADA
                          </span>
                        )}
                      </div>
                      <p className="font-display text-sm font-bold text-foreground">
                        MC$ {Number(r.total_credits).toLocaleString("pt-BR")}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedRentalDetail(r)}
                        className="cut-corner border border-border/70 hover:border-primary/80 bg-surface/50 hover:bg-surface/80 px-2.5 py-1.5 text-xs text-foreground transition flex items-center gap-1"
                        title="Abrir popup com detalhes completos"
                      >
                        <Info className="h-3.5 w-3.5 text-primary" />
                        <span>Detalhes</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveBoardingPass(r)}
                        className="cut-corner border border-telemetry/60 bg-telemetry/15 hover:bg-telemetry/25 px-2.5 py-1.5 text-xs font-bold text-telemetry transition flex items-center gap-1"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>Chave</span>
                      </button>

                      {(isInFlight || r.status === "confirmed") && (
                        <Link
                          to="/app/copiloto"
                          search={{ rental: r.id }}
                          className="cut-corner border border-telemetry/60 bg-telemetry/10 px-2.5 py-1.5 text-xs font-bold text-telemetry transition hover:bg-telemetry/20 flex items-center gap-1"
                          title="Abrir o copiloto GPS desta viagem"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">Copiloto</span>
                        </Link>
                      )}

                      {isInFlight ? (
                        <button
                          type="button"
                          onClick={() => veh && setChasingVehicle(veh)}
                          className="cut-corner border border-primary/70 bg-primary/20 hover:bg-primary/30 px-2.5 py-1.5 text-xs font-bold text-primary transition flex items-center gap-1"
                          title="Acompanhar voo pelos cânions marcianos"
                        >
                          <Rocket className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">Acompanhar 3D</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (veh)
                              safeNavigate({ to: "/app/hangar-3d", search: { vehicleId: veh.id } });
                          }}
                          className="cut-corner border border-emerald-500/70 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1.5 text-xs font-bold text-emerald-400 transition flex items-center gap-1"
                          title="Inspecionar veículo estacionado na baia 3D"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">Garagem 3D</span>
                        </button>
                      )}

                      {!isCompleted && !isCancelled && (
                        <button
                          type="button"
                          onClick={() => handleExtendRental(r)}
                          className="hidden xl:flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[10px] text-muted-foreground hover:text-telemetry hover:border-telemetry/50 transition"
                        >
                          <CalendarPlus className="h-2.5 w-2.5" />
                          <span>Estender</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ======================================================== */}
      {/* 5. MODAL POPUP: DETALHES COMPLETOS DA RESERVA           */}
      {/* ======================================================== */}
      {selectedRentalDetail &&
        (() => {
          const r = selectedRentalDetail;
          const veh = vMap.get(r.vehicle_id);
          const pickupH = hMap.get(r.pickup_hangar_id);
          const dropoffH = hMap.get(r.dropoff_hangar_id);
          const distanceKm =
            pickupH && dropoffH
              ? marsDistanceKm(pickupH.lat, pickupH.lng, dropoffH.lat, dropoffH.lng)
              : 0;
          const durationSols = Math.max(1, (r.end_sol ?? r.start_sol) - r.start_sol);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200 font-mono">
              <div className="cut-corner glass relative w-full max-w-xl space-y-5 border border-primary/40 p-6 text-xs shadow-2xl">
                {/* Header do Modal */}
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded bg-primary/10 border border-primary/30 text-primary">
                      <Info className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-bold text-foreground">
                        {veh?.name ?? "Nave Marciana"}
                      </h3>
                      <p className="text-[10px] text-muted-foreground">
                        Callsign:{" "}
                        <span className="text-primary font-bold">{veh?.callsign ?? "ARS-00"}</span>{" "}
                        · ID: {r.id}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedRentalDetail(null)}
                    className="text-muted-foreground hover:text-foreground transition p-1"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Corpo de Detalhes Estruturado */}
                <div className="space-y-4">
                  {/* 1. ROTA & DISTÂNCIA */}
                  <div className="rounded border border-border/50 bg-background/50 p-3.5 space-y-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-bold">
                      ITINERÁRIO AREOGRÁFICO:
                    </span>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground text-[10px] block">
                          Ponto de Partida:
                        </span>
                        <p className="font-semibold text-foreground">
                          {pickupH?.name ?? "Hangar Central"}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          Coord: {pickupH ? `${pickupH.lat}°N, ${pickupH.lng}°W` : "Setor 1"}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground text-[10px] block">
                          Ponto de Destino:
                        </span>
                        <p className="font-semibold text-foreground">
                          {dropoffH?.name ?? "Hangar Destino"}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          Coord: {dropoffH ? `${dropoffH.lat}°N, ${dropoffH.lng}°W` : "Setor 2"}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-border/30 pt-2 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Distância Esférica Calculada:</span>
                      <span className="text-telemetry font-bold">
                        {distanceKm.toLocaleString("pt-BR")} km em linha reta
                      </span>
                    </div>
                  </div>

                  {/* 2. CHAVE QUÂNTICA & PERÍODO */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded border border-telemetry/40 bg-telemetry/10 p-3 space-y-1">
                      <span className="text-[10px] uppercase text-muted-foreground block font-bold">
                        CHAVE QUÂNTICA:
                      </span>
                      <div className="flex items-center justify-between">
                        <code className="text-xs font-bold text-telemetry">
                          {r.quantum_key ?? "Q-KEY#8F4A92"}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyQuantumKey(r.quantum_key ?? "Q-KEY#8F4A92")}
                          className="text-telemetry hover:text-telemetry/80 p-0.5"
                          title="Copiar chave"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[9px] text-emerald-400 block">
                        Homologada no Hangar
                      </span>
                    </div>

                    <div className="rounded border border-border/50 bg-background/50 p-3 space-y-1">
                      <span className="text-[10px] uppercase text-muted-foreground block font-bold">
                        PERÍODO EM SOLS:
                      </span>
                      <p className="font-semibold text-primary">
                        Sol {r.start_sol} até {r.end_sol}
                      </p>
                      <span className="text-[10px] text-muted-foreground block">
                        {durationSols} sols marcianos
                      </span>
                    </div>
                  </div>

                  {/* 3. EQUIPAMENTOS & ADICIONAIS CONTRATADOS */}
                  <div className="rounded border border-border/50 bg-background/50 p-3 space-y-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-bold">
                      ESCUDOS & ADICIONAIS CONTRATADOS:
                    </span>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5">
                        <ShieldCheck className="h-3 w-3" /> Barreira Anti-Tempestade Ativa
                      </span>
                      {r.silica_insurance && (
                        <span className="rounded bg-surface px-2 py-0.5 text-foreground border border-border/50">
                          ✓ Seguro de Sílica & Rególito
                        </span>
                      )}
                      {r.neural_autopilot_l5 && (
                        <span className="rounded bg-surface px-2 py-0.5 text-foreground border border-border/50">
                          ✓ Piloto Neural Autônomo Nível 5
                        </span>
                      )}
                      {r.extra_o2_tank && (
                        <span className="rounded bg-surface px-2 py-0.5 text-foreground border border-border/50">
                          ✓ Tanque Adicional de O₂ Criogênico
                        </span>
                      )}
                      {r.extra_eva_suits > 0 && (
                        <span className="rounded bg-surface px-2 py-0.5 text-foreground border border-border/50">
                          ✓ {r.extra_eva_suits}x Trajes de Superfície EVA
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4. TOTAL PAGO */}
                  <div className="flex items-center justify-between rounded border border-border/60 bg-surface/40 p-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase block">
                        TARIFA TOTAL LIQUIDADA:
                      </span>
                      <p className="font-display text-base font-bold text-foreground">
                        MC$ {Number(r.total_credits).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <span className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-400">
                      PAGAMENTO COMPLETO
                    </span>
                  </div>
                </div>

                {/* Ações dentro do Modal */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRentalDetail(null);
                        setActiveBoardingPass(r);
                      }}
                      className="cut-corner border border-telemetry/70 bg-telemetry/15 hover:bg-telemetry/25 px-3 py-1.5 text-xs font-bold text-telemetry transition flex items-center gap-1.5"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Chave Quântica & Controles</span>
                    </button>

                    {r.status !== "completed" && r.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => handleExtendRental(r)}
                        className="border border-border/70 hover:border-telemetry/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-telemetry transition rounded flex items-center gap-1"
                      >
                        <CalendarPlus className="h-3 w-3" />
                        <span>Estender (+1 Sol)</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status === "confirmed" && r.start_sol > sol && (
                      <button
                        type="button"
                        onClick={() => {
                          handleCancelRental(r);
                          setSelectedRentalDetail(null);
                        }}
                        className="border border-destructive/40 hover:border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition rounded flex items-center gap-1"
                      >
                        <X className="h-3 w-3" />
                        <span>Cancelar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedRentalDetail(null)}
                      className="border border-border/70 px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-surface transition rounded uppercase"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ======================================================== */}
      {/* 6. MODAL POPUP: CENTRAL DE PROMOÇÕES & CUPONS           */}
      {/* ======================================================== */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200 font-mono">
          <div className="cut-corner glass relative w-full max-w-2xl space-y-5 border border-primary/50 p-6 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2 text-primary">
                <Gift className="h-5 w-5" />
                <h3 className="font-display text-base font-bold uppercase tracking-wider">
                  Benefícios & Promoções Especiais de Frota
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPromoModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border border-border/70 bg-background/70 p-3.5 rounded flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-xs">
                      Upgrade Apex Phantom
                    </span>
                    <span className="text-telemetry font-bold text-xs">35% OFF</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] mt-1">
                    Cabine VIP executiva com pressurização reforçada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleApplyPromo("APEX-VIP35", "35% de desconto no Apex Phantom VIP");
                    setIsPromoModalOpen(false);
                  }}
                  className="cut-corner flex items-center justify-center gap-1.5 border border-amber-500/70 bg-amber-500/10 py-1.5 text-[11px] font-bold uppercase text-amber-300 hover:bg-amber-500/20 transition"
                >
                  <Tag className="h-3 w-3" />
                  <span>Usar Cupom APEX-VIP35</span>
                </button>
              </div>

              <div className="border border-border/70 bg-background/70 p-3.5 rounded flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-xs">
                      Barreira Anti-Tempestade
                    </span>
                    <span className="text-emerald-400 font-bold text-xs">GRÁTIS</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] mt-1">
                    Escudo iônico e seguro contra rególito inclusos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleApplyPromo("ESCUDO-ZERO", "Barreira Anti-Tempestade Gratuita");
                    setIsPromoModalOpen(false);
                  }}
                  className="cut-corner flex items-center justify-center gap-1.5 border border-emerald-500/70 bg-emerald-500/10 py-1.5 text-[11px] font-bold uppercase text-emerald-300 hover:bg-emerald-500/20 transition"
                >
                  <ShieldCheck className="h-3 w-3" />
                  <span>Usar Cupom ESCUDO-ZERO</span>
                </button>
              </div>

              <div className="border border-border/70 bg-background/70 p-3.5 rounded flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-xs">
                      Expedição Starship Hopper
                    </span>
                    <span className="text-primary font-bold text-xs">+MC$ 8.000</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] mt-1">
                    Bônus em créditos para voos orbitais e hoppers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleApplyPromo("STAR-ORBIT", "Bônus de MC$ 8.000 para Starships");
                    setIsPromoModalOpen(false);
                  }}
                  className="cut-corner flex items-center justify-center gap-1.5 border border-telemetry/70 bg-telemetry/10 py-1.5 text-[11px] font-bold uppercase text-telemetry hover:bg-telemetry/20 transition"
                >
                  <Rocket className="h-3 w-3" />
                  <span>Usar Cupom STAR-ORBIT</span>
                </button>
              </div>
            </div>

            {/* Preferências de Notificação */}
            <div className="rounded border border-border/40 bg-surface/30 p-3 space-y-2">
              <span className="text-[10px] uppercase text-muted-foreground block font-bold">
                PREFERÊNCIAS DE TRANSMISSÃO ORBITAL:
              </span>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={notifyOrbit}
                    onChange={(e) => setNotifyOrbit(e.target.checked)}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span>Status de Reserva</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={notifyStorms}
                    onChange={(e) => setNotifyStorms(e.target.checked)}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span>Tempestades de Areia</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={notifyPromos}
                    onChange={(e) => setNotifyPromos(e.target.checked)}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span>Promoções & Descontos</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end border-t border-border/40 pt-3">
              <button
                type="button"
                onClick={() => setIsPromoModalOpen(false)}
                className="cut-corner border border-border px-4 py-2 uppercase text-muted-foreground hover:bg-surface transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. MODAL: BOARDING PASS QUÂNTICO & CONTROLES REMOTOS    */}
      {/* ======================================================== */}
      {activeBoardingPass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200 font-mono">
          <div className="cut-corner glass relative w-full max-w-lg space-y-5 border border-telemetry/50 p-6 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-telemetry/30 pb-3">
              <div className="flex items-center gap-2 text-telemetry">
                <Radio className="h-5 w-5 animate-pulse" />
                <h3 className="font-display text-base font-bold uppercase tracking-wider">
                  Boarding Pass Quântico
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveBoardingPass(null);
                  setRemoteActionNotice(null);
                }}
                className="text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded border border-telemetry/40 bg-telemetry/10 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase">
                    CHAVE CRIPTOGRÁFICA DE IGNIÇÃO:
                  </span>
                  <span className="rounded bg-telemetry/20 px-1.5 py-0.5 text-[10px] text-telemetry font-bold">
                    ACESSO VALIDADO
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="font-mono text-xl font-bold tracking-wider text-telemetry">
                    {activeBoardingPass.quantum_key ?? "Q-KEY#8F4A92"}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyQuantumKey(activeBoardingPass.quantum_key ?? "Q-KEY#8F4A92")}
                    className="flex items-center gap-1 rounded bg-telemetry/20 px-2 py-1 text-[11px] text-telemetry hover:bg-telemetry/30 transition"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar</span>
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Apresente este código nos sensores biométricos de pressurização do hangar.
                </p>
              </div>

              {/* Status de Barreira Contra Tempestades */}
              <div className="flex items-center justify-between rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" /> BARREIRA DE TEMPESTADE:
                </span>
                <span className="font-bold">ATIVA (ESCUDO DEFLETOR 100%)</span>
              </div>

              {/* Controles Remotos da Espaçonave */}
              <div className="space-y-2 border-t border-border/40 pt-3">
                <span className="text-[10px] text-muted-foreground uppercase block font-bold">
                  TELEMETRIA & COMANDOS REMOTOS:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setRemoteActionNotice("Esclusa despressurizada e destravada para embarque.");
                      toast.success("Esclusa Destravada", {
                        description: "Sensores de cabine calibrados a 101.3 kPa.",
                      });
                    }}
                    className="cut-corner border border-telemetry/40 bg-telemetry/10 p-2 text-left hover:bg-telemetry/20 transition"
                  >
                    <span className="text-telemetry font-bold block">Destravar Esclusa</span>
                    <span className="text-[10px] text-muted-foreground">Acesso ao cockpit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRemoteActionNotice(
                        "Células criogênicas pré-aquecidas a temperatura ideal.",
                      );
                      toast.success("Baterias Pré-Aquecidas", {
                        description: "Supercondutores prontos para ignição.",
                      });
                    }}
                    className="cut-corner border border-telemetry/40 bg-telemetry/10 p-2 text-left hover:bg-telemetry/20 transition"
                  >
                    <span className="text-telemetry font-bold block">Aquecer Bateria</span>
                    <span className="text-[10px] text-muted-foreground">
                      Pré-aquecimento térmico
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRemoteActionNotice("Filtros ciclônicos de sílica purgados e limpos.");
                      toast.success("Filtro Sílica Purificado", {
                        description: "Admissão de ar livre de poeira marciana.",
                      });
                    }}
                    className="cut-corner border border-telemetry/40 bg-telemetry/10 p-2 text-left hover:bg-telemetry/20 transition"
                  >
                    <span className="text-telemetry font-bold block">Limpar Filtro Sílica</span>
                    <span className="text-[10px] text-muted-foreground">Purga ultrassônica</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRemoteActionNotice(
                        "Campo de força defletor ativado em 100% de intensidade.",
                      );
                      toast.success("Escudo Defletor Ativo", {
                        description: "Proteção contra radiação cósmica armada.",
                      });
                    }}
                    className="cut-corner border border-telemetry/40 bg-telemetry/10 p-2 text-left hover:bg-telemetry/20 transition"
                  >
                    <span className="text-telemetry font-bold block">Armar Escudo Defletor</span>
                    <span className="text-[10px] text-muted-foreground">Cúpula ionizada ativa</span>
                  </button>
                </div>
              </div>

              {remoteActionNotice && (
                <div className="flex items-center gap-2 border border-telemetry/40 bg-telemetry/10 p-2.5 text-telemetry text-xs">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{remoteActionNotice}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border/40 pt-3">
              <button
                type="button"
                onClick={() => {
                  const targetVeh = vMap.get(activeBoardingPass.vehicle_id) || vehicles[0];
                  setActiveBoardingPass(null);
                  if (!targetVeh) return;
                  if (targetVeh.status === "in_flight") {
                    setChasingVehicle(targetVeh);
                  } else {
                    safeNavigate({ to: "/app/hangar-3d", search: { vehicleId: targetVeh.id } });
                  }
                }}
                className="cut-corner flex items-center gap-2 border border-primary bg-primary/20 px-3.5 py-1.5 font-bold uppercase tracking-wider text-primary hover:bg-primary/30 transition shadow-glow"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>
                  {vMap.get(activeBoardingPass.vehicle_id)?.status === "in_flight"
                    ? "Acompanhar Voo 3D"
                    : "Ver na Garagem 3D"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveBoardingPass(null);
                  setRemoteActionNotice(null);
                }}
                className="cut-corner border border-border px-3.5 py-1.5 uppercase text-muted-foreground hover:bg-surface transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. VISUALIZADOR DE PERCURSO 3D                          */}
      {/* ======================================================== */}
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
                safeNavigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
              } else {
                setChasingVehicle(v);
              }
            }}
            onNavigateHangar={(v) => {
              setChasingVehicle(null);
              safeNavigate({ to: "/app/hangar-3d", search: { vehicleId: v.id } });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
