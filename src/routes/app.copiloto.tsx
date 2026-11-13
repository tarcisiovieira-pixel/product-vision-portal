import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  Mic,
  MicOff,
  Navigation,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  formatDuration,
  snapshot,
  type AlertSeverity,
  type CopilotContext,
  type CopilotVehicle,
} from "@shared/copilot";
import { CopilotMap } from "@/components/CopilotMap";
import { PageHeader } from "@/components/PageHeader";
import { aiStatusQuery, providerLabel } from "@/lib/ai";
import { memoryQuery } from "@/lib/ai-memory";
import { askCopilot } from "@/lib/copilot";
import {
  DEMO_SOL,
  currentSolQuery,
  hangarsQuery,
  rentalsQuery,
  vehiclesQuery,
  weatherQuery,
} from "@/lib/ares-data";
import {
  listen,
  speak,
  speechInputSupported,
  speechOutputSupported,
  stopSpeaking,
  type Listening,
} from "@/lib/voice";

export const Route = createFileRoute("/app/copiloto")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { rental?: string; vehicle?: string; from?: string; to?: string } = {};
    for (const key of ["rental", "vehicle", "from", "to"] as const) {
      const value = search[key];
      if (typeof value === "string" && value) out[key] = value;
    }
    return out;
  },
  head: () => ({
    meta: [
      { title: "Copiloto GPS — ARES Mobility" },
      {
        name: "description",
        content: "Navegação, clima à frente e alertas de bordo, por texto ou voz.",
      },
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
  component: Copiloto,
});

interface Message {
  id: number;
  role: "user" | "copilot" | "alert";
  text: string;
  severity?: AlertSeverity;
}

const ALERT_STYLE: Record<AlertSeverity, { icon: typeof Info; className: string }> = {
  critical: {
    icon: AlertOctagon,
    className: "border-destructive/60 bg-destructive/10 text-destructive",
  },
  warning: { icon: AlertTriangle, className: "border-warning/60 bg-warning/10 text-warning" },
  info: { icon: Info, className: "border-border text-muted-foreground" },
};

const SUGGESTIONS = [
  "Quanto falta para chegar?",
  "Tem tempestade no caminho?",
  "Posso desviar?",
  "Como está a bateria?",
  "Onde posso pousar?",
];

const VOICE_KEY = "ares_copilot_voice";
const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");

const selectClass =
  "w-full border border-border bg-background/50 px-3 py-2 font-mono text-xs text-foreground focus:border-telemetry focus:outline-none";

function Copiloto() {
  const prefill = Route.useSearch();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery);
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: storms } = useSuspenseQuery(weatherQuery);
  const { data: rentals } = useSuspenseQuery(rentalsQuery);
  const { data: sol = DEMO_SOL } = useQuery(currentSolQuery);
  const { data: status } = useQuery(aiStatusQuery);
  const { data: memory } = useQuery(memoryQuery);

  const activeRentals = useMemo(
    () => rentals.filter((r) => r.status === "in_flight" || r.status === "confirmed"),
    [rentals],
  );

  /** Posição no trajeto de uma reserva, pelo relógio de sols. */
  const progressOf = (start: number, end: number) =>
    end > start ? Math.min(1, Math.max(0, (sol - start) / (end - start))) : 0;

  const fromRental = prefill.rental ? rentals.find((r) => r.id === prefill.rental) : undefined;
  const firstVehicle = vehicles.find((v) => v.status === "in_flight") ?? vehicles[0];
  const [vehicleId, setVehicleId] = useState(
    fromRental?.vehicle_id ?? prefill.vehicle ?? firstVehicle?.id ?? "",
  );
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? firstVehicle;
  const [originId, setOriginId] = useState(
    fromRental?.pickup_hangar_id ?? prefill.from ?? vehicle?.hangar_id ?? hangars[0]?.id ?? "",
  );
  const [destId, setDestId] = useState(
    fromRental?.dropoff_hangar_id ?? prefill.to ?? hangars.find((h) => h.id !== originId)?.id ?? "",
  );
  const [progress, setProgress] = useState(
    fromRental ? progressOf(fromRental.start_sol, fromRental.end_sol) : 0.3,
  );

  const origin = hangars.find((h) => h.id === originId);
  const destination = hangars.find((h) => h.id === destId);
  const validTrip = Boolean(vehicle && origin && destination && origin.id !== destination.id);

  const avoidStorms = Boolean(
    memory?.enabled && memory.items.some((i) => i.topic === "avoid_storms" && i.value === "true"),
  );

  const ctx = useMemo<CopilotContext | null>(() => {
    if (!vehicle || !origin || !destination || origin.id === destination.id) return null;
    const v = vehicle as typeof vehicle & { model_key?: string; range_km?: number };
    const copilotVehicle: CopilotVehicle = {
      category: v.category,
      callsign: v.callsign,
      name: v.name,
      model_key: v.model_key ?? null,
      battery_pct: Number(v.battery_pct),
      o2_hours: Number(v.o2_hours),
      dust_filter_pct: Number(v.dust_filter_pct),
      cabin_pressure_kpa: Number(v.cabin_pressure_kpa),
      thruster_integrity: Number(v.thruster_integrity),
      heat_shield_pct: Number(v.heat_shield_pct),
      speed_kmh: v.speed_kmh ? Number(v.speed_kmh) : null,
      range_km: v.range_km ?? null,
    };
    return {
      trip: { origin, destination, progress },
      vehicle: copilotVehicle,
      storms,
      hangars,
      avoidStorms,
    };
  }, [vehicle, origin, destination, progress, storms, hangars, avoidStorms]);

  const snap = useMemo(() => (ctx ? snapshot(ctx) : null), [ctx]);

  // --- conversa, alertas proativos e voz ---------------------------------
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const nextId = useRef(1);
  const announced = useRef<Set<string>>(new Set());
  const [voiceOn, setVoiceOn] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(VOICE_KEY) === "1",
  );
  const [listening, setListening] = useState<Listening | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const canSpeak = speechOutputSupported();
  const canListen = speechInputSupported();
  const chatEnd = useRef<HTMLDivElement>(null);

  const push = (m: Omit<Message, "id">) =>
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ }].slice(-40));

  useEffect(() => {
    chatEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages]);

  // Trocou de viagem: os alertas voltam a valer.
  const tripKey = `${vehicleId}|${originId}|${destId}`;
  const lastTrip = useRef(tripKey);
  useEffect(() => {
    if (lastTrip.current === tripKey) return; // não reinicia no remount do modo de desenvolvimento
    lastTrip.current = tripKey;
    announced.current = new Set();
  }, [tripKey]);

  // O GPS avisa sozinho quando surge algo importante, uma vez por alerta.
  useEffect(() => {
    if (!snap) return;
    for (const alert of snap.alerts) {
      if (alert.severity === "info" || announced.current.has(alert.id)) continue;
      announced.current.add(alert.id);
      const line = `${alert.title}. ${alert.detail}`;
      push({ role: "alert", text: line, severity: alert.severity });
      if (voiceOn) speak(line);
    }
    // alertas resolvidos podem voltar a ser anunciados se reaparecerem
    for (const id of [...announced.current]) {
      if (!snap.alerts.some((a) => a.id === id)) announced.current.delete(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  const ids = { vehicleId, originId, destinationId: destId, progress };
  const ask = useMutation({
    mutationFn: (message: string) => askCopilot(message, ctx!, ids),
    onSuccess: (reply) => {
      push({ role: "copilot", text: reply.reply });
      if (voiceOn) speak(reply.reply);
    },
    onError: () => push({ role: "copilot", text: "Não consegui consultar agora. Tente de novo." }),
  });

  const submit = (message: string) => {
    const clean = message.trim();
    if (clean.length < 2 || !ctx || ask.isPending) return;
    push({ role: "user", text: clean });
    setText("");
    ask.mutate(clean);
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem(VOICE_KEY, next ? "1" : "0");
    if (!next) stopSpeaking();
  };

  const toggleMic = () => {
    if (listening) {
      listening.stop();
      setListening(null);
      return;
    }
    setVoiceNote(null);
    const session = listen({
      onText: (heard) => submit(heard),
      onEnd: () => setListening(null),
      onError: (reason) =>
        setVoiceNote(
          reason === "not-allowed"
            ? "Permita o microfone no navegador para falar com o copiloto."
            : "Não consegui ouvir. Tente de novo ou digite.",
        ),
    });
    setListening(session);
  };

  useEffect(() => () => stopSpeaking(), []);

  const selectRental = (id: string) => {
    const r = rentals.find((x) => x.id === id);
    if (!r) return;
    setVehicleId(r.vehicle_id);
    setOriginId(r.pickup_hangar_id);
    setDestId(r.dropoff_hangar_id);
    setProgress(progressOf(r.start_sol, r.end_sol));
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <PageHeader
        kicker="Navegação"
        title="Copiloto GPS"
        info="Acompanha a viagem: posição, tempo de chegada, tempestades à frente com desvio sugerido, bateria, oxigênio e pouso de emergência. Pergunte por texto ou por voz. Os números vêm do cálculo da rota; a IA só dá a fala."
      >
        <span
          className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] ${
            status?.generative
              ? "border-telemetry/60 bg-telemetry/10 text-telemetry"
              : "border-border text-muted-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {status?.generative ? `IA generativa (${providerLabel(status)})` : "Motor de regras"}
        </span>
      </PageHeader>

      <section className="glass grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Viagem">
        {activeRentals.length > 0 && (
          <label className="font-mono text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            Minhas reservas ativas
            <select
              className={`mt-1.5 ${selectClass}`}
              defaultValue=""
              onChange={(e) => selectRental(e.target.value)}
            >
              <option value="">Escolha uma reserva para seguir a viagem dela</option>
              {activeRentals.map((r) => {
                const v = vehicles.find((x) => x.id === r.vehicle_id);
                const from = hangars.find((h) => h.id === r.pickup_hangar_id);
                const to = hangars.find((h) => h.id === r.dropoff_hangar_id);
                return (
                  <option key={r.id} value={r.id}>
                    {v?.callsign ?? "Veículo"} · {from?.code} → {to?.code} · sols {r.start_sol}-
                    {r.end_sol}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <label className="font-mono text-xs text-muted-foreground">
          Veículo
          <select
            className={`mt-1.5 ${selectClass}`}
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.callsign} · {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="font-mono text-xs text-muted-foreground">
          Saída
          <select
            className={`mt-1.5 ${selectClass}`}
            value={originId}
            onChange={(e) => setOriginId(e.target.value)}
          >
            {hangars.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="font-mono text-xs text-muted-foreground">
          Destino
          <select
            className={`mt-1.5 ${selectClass}`}
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
          >
            {hangars.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="font-mono text-xs text-muted-foreground">
          Posição no trajeto: {nf(progress * 100)}% (simulação)
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(progress * 100)}
            aria-label="Posição no trajeto"
            onChange={(e) => setProgress(Number(e.target.value) / 100)}
            className="mt-3 w-full accent-telemetry"
          />
        </label>
      </section>

      {!validTrip || !snap || !ctx ? (
        <p role="alert" className="glass p-5 font-mono text-xs text-warning">
          Escolha um veículo e dois hangares diferentes para iniciar a navegação.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <CopilotMap
              hangars={hangars}
              storms={storms}
              origin={ctx.trip.origin}
              destination={ctx.trip.destination}
              nav={snap.nav}
              detour={snap.detour}
            />

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="copilot-telemetry">
              {[
                ["Faltam", `${nf(snap.nav.remainingKm)} km`],
                ["Chegada em", formatDuration(snap.nav.etaHours)],
                ["Rumo", `${nf(snap.nav.bearing)}° ${snap.nav.heading}`],
                ["Velocidade", `${nf(snap.nav.speedKmh)} km/h`],
                ["Bateria", `${nf(snap.nav.batteryPct)}%`],
                [
                  "Próx. recarga",
                  snap.nav.rechargeStopsLeft > 0
                    ? `${nf(snap.nav.nextRechargeKm)} km`
                    : "Sem recarga",
                ],
                [
                  "Oxigênio",
                  `${(Math.round(snap.nav.o2Hours * 10) / 10).toLocaleString("pt-BR")} h`,
                ],
                [
                  "Cabine",
                  `${(Math.round(Number(vehicle!.cabin_pressure_kpa) * 10) / 10).toLocaleString("pt-BR")} kPa`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="glass p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 font-display text-lg font-bold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            <section aria-label="Alertas" className="space-y-2" data-testid="copilot-alerts">
              {snap.alerts.map((alert) => {
                const { icon: Icon, className } = ALERT_STYLE[alert.severity];
                return (
                  <div key={alert.id} className={`flex gap-2 border p-3 text-xs ${className}`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      <strong>{alert.title}.</strong> {alert.detail}
                    </p>
                  </div>
                );
              })}
            </section>
          </div>

          <section
            className="glass flex min-h-[28rem] flex-col p-4"
            aria-label="Conversa com o copiloto"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
                <Navigation className="h-4 w-4" /> Fale com o copiloto
              </h2>
              {canSpeak && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-pressed={voiceOn}
                  className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] transition ${
                    voiceOn
                      ? "border-telemetry/60 bg-telemetry/10 text-telemetry"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {voiceOn ? (
                    <Volume2 className="h-3.5 w-3.5" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5" />
                  )}
                  Voz {voiceOn ? "ligada" : "desligada"}
                </button>
              )}
            </div>

            <div
              className="flex-1 space-y-2 overflow-y-auto pr-1"
              data-testid="copilot-chat"
              aria-live="polite"
            >
              {messages.length === 0 && (
                <p className="font-mono text-xs text-muted-foreground">
                  Pergunte sobre a viagem ou use um atalho abaixo. O copiloto avisa sozinho quando
                  surgir tempestade, falta de bateria ou outro risco.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  data-testid={`msg-${m.role}`}
                  className={`max-w-[92%] border p-2.5 text-xs ${
                    m.role === "user"
                      ? "ml-auto border-primary/40 bg-primary/10 text-foreground"
                      : m.role === "alert"
                        ? ALERT_STYLE[m.severity ?? "warning"].className
                        : "border-border/60 bg-background/40 text-foreground"
                  }`}
                >
                  {m.role === "alert" && (
                    <span className="mr-1 font-mono text-[10px] uppercase">Aviso do GPS ·</span>
                  )}
                  {m.text}
                </div>
              ))}
              {ask.isPending && (
                <p className="font-mono text-[11px] text-muted-foreground">Calculando...</p>
              )}
              <div ref={chatEnd} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition hover:border-telemetry hover:text-telemetry"
                >
                  {s}
                </button>
              ))}
            </div>

            {voiceNote && <p className="mt-2 font-mono text-[11px] text-warning">{voiceNote}</p>}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(text);
              }}
            >
              <input
                data-testid="copilot-input"
                aria-label="Pergunta ao copiloto"
                className={selectClass}
                value={text}
                maxLength={300}
                placeholder={listening ? "Ouvindo..." : "Ex.: tem tempestade no caminho?"}
                onChange={(e) => setText(e.target.value)}
              />
              {canListen && (
                <button
                  type="button"
                  onClick={toggleMic}
                  aria-label={listening ? "Parar de ouvir" : "Falar com o copiloto"}
                  aria-pressed={Boolean(listening)}
                  className={`border px-3 transition ${
                    listening
                      ? "border-destructive bg-destructive/20 text-destructive"
                      : "border-border text-muted-foreground hover:text-telemetry"
                  }`}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button
                type="submit"
                data-testid="copilot-send"
                disabled={text.trim().length < 2 || ask.isPending}
                className="border border-telemetry/60 bg-telemetry/10 px-3 text-telemetry transition hover:bg-telemetry/20 disabled:opacity-40"
                aria-label="Enviar pergunta"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
