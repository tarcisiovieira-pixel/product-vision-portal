import { useState, useMemo } from "react";
import { errorMessage } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Calendar,
  CheckCircle2,
  Compass,
  FileCheck2,
  Fingerprint,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Plane,
  Radio,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  categoryLabel,
  getRequiredLicense,
  isLicenseValidForCategory,
  licenseLabel,
  marsDistanceKm,
  SPACE_ADDONS,
  type Hangar,
  type Profile,
  type Rental,
  type Vehicle,
  type WeatherEvent,
} from "@/lib/ares-data";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { createRental } from "@/lib/ares-actions";
import {
  clearDemoState,
  enterRealSession,
  isDemoSession,
  startDemoSession,
  writeDemoProfile,
} from "@/lib/session";

function friendlyAuthError(err: unknown): string {
  const message = errorMessage(err);
  const lower = message.toLowerCase();
  if (lower.includes("email not confirmed")) {
    return "E-mail ainda não confirmado. Abra o link que enviamos e tente de novo.";
  }
  if (lower.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (lower.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
  return message;
}

interface BookingWizardModalProps {
  vehicle: Vehicle | null;
  hangars: Hangar[];
  weather: WeatherEvent[];
  initialPickup?: string | undefined;
  initialDropoff?: string | undefined;
  initialStartSol?: number | undefined;
  initialSols?: number | undefined;
  currentProfile?: Profile | null | undefined;
  onClose: () => void;
  onBookingSuccess?: (rental: Rental) => void;
}

export function BookingWizardModal(props: BookingWizardModalProps) {
  if (!props.vehicle) return null;
  return <BookingWizardInner {...props} vehicle={props.vehicle} />;
}

function BookingWizardInner({
  vehicle,
  hangars,
  weather,
  initialPickup,
  initialDropoff,
  initialStartSol = 4219,
  initialSols = 3,
  currentProfile,
  onClose,
  onBookingSuccess,
}: BookingWizardModalProps & { vehicle: Vehicle }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Etapa 1: Voo & Itinerário
  const [pickup, setPickup] = useState(initialPickup || hangars[0]?.id || "");
  const [dropoff, setDropoff] = useState(initialDropoff || hangars[1]?.id || hangars[0]?.id || "");
  const [startSol, setStartSol] = useState(initialStartSol);
  const [sols, setSols] = useState(initialSols);

  // Etapa 2: Opcionais Marcianos & Segurança
  const [stormBarrierShield, setStormBarrierShield] = useState(true);
  const [silicaInsurance, setSilicaInsurance] = useState(true);
  const [extraO2Tank, setExtraO2Tank] = useState(false);
  const [neuralAutopilot, setNeuralAutopilot] = useState(false);
  const [evaSuits, setEvaSuits] = useState(1);

  // Etapa 3: Autenticação Obrigatória do Piloto
  const [activeProfile, setActiveProfile] = useState<Profile | null>(currentProfile || null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [pilotEmail, setPilotEmail] = useState("");
  const [pilotPassword, setPilotPassword] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [pilotLicense, setPilotLicense] = useState<Profile["pilot_license"]>(
    currentProfile?.pilot_license || "atmospheric",
  );
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Etapa 4: Cartão de Embarque emitido
  const [confirmedRental, setConfirmedRental] = useState<Rental | null>(null);
  const [remoteActionNotice, setRemoteActionNotice] = useState<string | null>(null);

  const pickupHangar = hangars.find((h) => h.id === pickup) || hangars[0];
  const dropoffHangar = hangars.find((h) => h.id === dropoff) || hangars[0];

  const distanceKm = useMemo(() => {
    if (!pickupHangar || !dropoffHangar) return 0;
    return marsDistanceKm(pickupHangar.lat, pickupHangar.lng, dropoffHangar.lat, dropoffHangar.lng);
  }, [pickupHangar, dropoffHangar]);

  // Checagem de tempestade
  const severeStorm = weather.find((w) => w.active && w.severity >= 3);
  const isStormRisk = pickupHangar?.storm_alert || (severeStorm && severeStorm.severity >= 4);

  // Cálculo financeiro
  const dailyExtrasRate = useMemo(() => {
    let rate = 0;
    if (stormBarrierShield) rate += SPACE_ADDONS.storm_barrier_shield.rate;
    if (silicaInsurance) rate += SPACE_ADDONS.silica_insurance.rate;
    if (extraO2Tank) rate += SPACE_ADDONS.extra_o2_tank.rate;
    if (neuralAutopilot) rate += SPACE_ADDONS.neural_autopilot_l5.rate;
    if (evaSuits > 0) rate += SPACE_ADDONS.extra_eva_suits.rate * evaSuits;
    return rate;
  }, [stormBarrierShield, silicaInsurance, extraO2Tank, neuralAutopilot, evaSuits]);

  const dailyBase = vehicle.daily_rate_sol;
  const totalDailyRate = dailyBase + dailyExtrasRate;
  const totalCredits = totalDailyRate * sols;

  // Validação de licença para este veículo
  const effectiveLicense = activeProfile?.pilot_license || pilotLicense;
  const hasValidLicense = isLicenseValidForCategory(effectiveLicense, vehicle.category);

  const handleQuickDemoLogin = () => {
    const demoProfile = startDemoSession(qc);
    setActiveProfile(demoProfile);
    setPilotLicense("orbital");
    setAuthError(null);
    toast.success("Modo demo ativo");
  };

  const handleLoginExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pilotEmail.trim() || !pilotPassword) {
      setAuthError("Informe o e-mail e a senha.");
      return;
    }
    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: pilotEmail.trim(),
        password: pilotPassword,
      });
      if (error) throw error;

      enterRealSession(qc);
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (profErr || !prof) throw profErr ?? new Error("Perfil não encontrado.");
      setActiveProfile(prof);
      toast.success(`Autenticado como ${prof.space_credential_id}`);
    } catch (err) {
      setAuthError(friendlyAuthError(err));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegisterNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pilotEmail.trim() || !pilotPassword) {
      setAuthError("Preencha e-mail e senha.");
      return;
    }
    if (pilotPassword.length < 6) {
      setAuthError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);

    const autoCred = credentialId.trim() || `ARS-${Math.floor(1000 + Math.random() * 9000)}-EXP`;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: pilotEmail.trim(),
        password: pilotPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: { space_credential_id: autoCred, pilot_license: pilotLicense },
        },
      });
      if (error) throw error;
      if (data.user && data.user.identities?.length === 0) {
        throw new Error("Este e-mail já tem conta. Use a opção Entrar.");
      }
      if (!data.session) {
        setAuthError("Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.");
        return;
      }

      enterRealSession(qc);
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      if (profErr || !prof) throw profErr ?? new Error("Perfil não encontrado.");
      setActiveProfile(prof);
      toast.success("Conta criada! 25.000 créditos liberados.");
    } catch (err) {
      setAuthError(friendlyAuthError(err));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!activeProfile) {
      toast.error("Autentique-se para concluir a reserva.");
      return;
    }

    if (!hasValidLicense) {
      toast.error("Licença incompatível", {
        description: `${vehicle.name} exige habilitação "${getRequiredLicense(vehicle.category)}".`,
      });
      return;
    }

    setIsAuthLoading(true);

    try {
      const rental = await createRental({
        vehicle,
        pickup,
        dropoff,
        startSol,
        endSol: startSol + sols,
        silicaInsurance,
        extraO2Tank,
        neuralAutopilot,
        evaSuits,
        totalCredits,
      });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["rentals"] });
      setConfirmedRental(rental);
      onBookingSuccess?.(rental);
      setStep(4);
      toast.success("Reserva confirmada!");
    } catch (err) {
      toast.error("Falha ao concluir a reserva", { description: errorMessage(err) });
    } finally {
      setIsAuthLoading(false);
    }
  };

  const VehicleIcon =
    vehicle.category === "car_vtol" ? Plane : vehicle.category === "space_truck" ? Truck : Rocket;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="cut-corner glass relative w-full max-w-3xl overflow-hidden border border-primary/40 shadow-[0_0_50px_rgba(255,106,0,0.25)]">
        {/* Top Header / Progress Stepper */}
        <div className="border-b border-border/60 bg-surface/80 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded border border-primary/50 bg-primary/20 text-primary">
                <VehicleIcon className="h-5 w-5" />
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  Wizard de Locação ARES · Sol {startSol}
                </span>
                <h2 className="font-display text-xl font-bold text-foreground">
                  Alugar {vehicle.name}{" "}
                  <span className="text-muted-foreground font-mono text-sm">
                    ({vehicle.callsign})
                  </span>
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition p-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Stepper Tabs */}
          <div className="mt-4 grid grid-cols-4 gap-2 font-mono text-xs">
            {[
              { num: 1, label: "1. Voo & Rota" },
              { num: 2, label: "2. Opcionais" },
              { num: 3, label: "3. Autenticação" },
              { num: 4, label: "4. Chave Quântica" },
            ].map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-2 border-b-2 pb-2 transition ${
                  step === s.num
                    ? "border-primary text-primary font-bold"
                    : step > s.num
                      ? "border-telemetry text-telemetry"
                      : "border-border/40 text-muted-foreground"
                }`}
              >
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Wizard Body Content */}
        <div className="max-h-[72vh] overflow-y-auto p-6">
          <div className="space-y-6">
            {/* ETAPA 1: VOO & ITINERÁRIO */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Resumo do Veículo Selecionado */}
                <div className="grid gap-4 sm:grid-cols-3 border border-border/50 bg-surface/50 p-4 font-mono text-xs">
                  <div>
                    <span className="text-muted-foreground">CATEGORIA</span>
                    <p className="font-semibold text-foreground">
                      {categoryLabel[vehicle.category]}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">TARIFA DIÁRIA BASE</span>
                    <p className="font-display text-lg text-primary">
                      MC$ {vehicle.daily_rate_sol.toLocaleString("pt-BR")} / sol
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">HABILITAÇÃO EXIGIDA</span>
                    <p className="text-telemetry font-semibold">
                      {getRequiredLicense(vehicle.category)}
                    </p>
                  </div>
                </div>

                {/* Seleção de Hangares */}
                <div className="grid gap-4 sm:grid-cols-2 font-mono text-xs">
                  <div>
                    <label className="text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> HANGAR DE RETIRADA
                    </label>
                    <select
                      value={pickup}
                      onChange={(e) => setPickup(e.target.value)}
                      className="mt-1.5 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-primary"
                    >
                      {hangars.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.code}) — Setor {h.sector}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-telemetry" /> HANGAR DE DEVOLUÇÃO
                    </label>
                    <select
                      value={dropoff}
                      onChange={(e) => setDropoff(e.target.value)}
                      className="mt-1.5 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-telemetry"
                    >
                      {hangars.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.code}) — Setor {h.sector}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Período em Sols */}
                <div className="grid gap-4 sm:grid-cols-2 font-mono text-xs">
                  <div>
                    <label className="text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" /> SOL INICIAL DE DECOLAGEM
                    </label>
                    <input
                      type="number"
                      min={4218}
                      value={startSol}
                      onChange={(e) => setStartSol(Number(e.target.value))}
                      className="mt-1.5 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" /> DURAÇÃO DA LOCAÇÃO (SOLS)
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      {[1, 3, 5, 7, 14].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSols(d)}
                          className={`flex-1 border p-2 text-center transition ${
                            sols === d
                              ? "border-primary bg-primary/20 text-primary font-bold"
                              : "text-muted-foreground hover:border-muted-foreground"
                          }`}
                        >
                          {d} {d === 1 ? "Sol" : "Sols"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Indicador de Rota & Clima */}
                <div className="border border-border/60 bg-surface/30 p-4 font-mono text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Compass className="h-4 w-4 text-telemetry" /> Distância Areográfica Estimada:
                    </span>
                    <span className="font-display text-base text-foreground font-bold">
                      {distanceKm.toLocaleString("pt-BR")} km
                    </span>
                  </div>

                  {isStormRisk && (
                    <div className="flex items-start gap-2 border border-warning/50 bg-warning/10 p-2.5 text-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Alerta de Tempestade Ativo no Setor</p>
                        <p className="text-[11px] text-warning/90">
                          Recomendamos a inclusão do Seguro de Sílica no próximo passo para proteção
                          contra rególito abrasivo.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ETAPA 2: OPCIONAIS MARCIANOS */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 font-mono text-xs"
              >
                <p className="text-muted-foreground">
                  Selecione os pacotes de segurança e suporte para atravessar o relevo hostil de
                  Marte:
                </p>

                {/* Barreira Anti-Tempestade de Areia & Escudo Iônico */}
                <label className="flex items-start gap-3 border border-telemetry/60 bg-telemetry/10 p-3.5 cursor-pointer hover:border-telemetry transition">
                  <input
                    type="checkbox"
                    checked={stormBarrierShield}
                    onChange={(e) => setStormBarrierShield(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-telemetry"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-telemetry" />
                        {SPACE_ADDONS.storm_barrier_shield.label}
                      </span>
                      <span className="text-telemetry font-bold">
                        +MC$ {SPACE_ADDONS.storm_barrier_shield.rate}/sol
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {SPACE_ADDONS.storm_barrier_shield.desc}
                    </p>
                    <span className="mt-1.5 inline-block text-[10px] text-emerald-400 font-bold">
                      🛡️ Autorização Especial ARES para voos seguros sob tempestades de areia
                    </span>
                  </div>
                </label>

                {/* Seguro de Sílica */}
                <label className="flex items-start gap-3 border border-border/60 bg-surface/40 p-3.5 cursor-pointer hover:border-primary/50 transition">
                  <input
                    type="checkbox"
                    checked={silicaInsurance}
                    onChange={(e) => setSilicaInsurance(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {SPACE_ADDONS.silica_insurance.label}
                      </span>
                      <span className="text-primary font-bold">
                        +MC$ {SPACE_ADDONS.silica_insurance.rate}/sol
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {SPACE_ADDONS.silica_insurance.desc}
                    </p>
                  </div>
                </label>

                {/* Tanque Extra O2 */}
                <label className="flex items-start gap-3 border border-border/60 bg-surface/40 p-3.5 cursor-pointer hover:border-primary/50 transition">
                  <input
                    type="checkbox"
                    checked={extraO2Tank}
                    onChange={(e) => setExtraO2Tank(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {SPACE_ADDONS.extra_o2_tank.label}
                      </span>
                      <span className="text-primary font-bold">
                        +MC$ {SPACE_ADDONS.extra_o2_tank.rate}/sol
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {SPACE_ADDONS.extra_o2_tank.desc}
                    </p>
                  </div>
                </label>

                {/* Autopiloto Neural Nível 5 */}
                <label className="flex items-start gap-3 border border-border/60 bg-surface/40 p-3.5 cursor-pointer hover:border-primary/50 transition">
                  <input
                    type="checkbox"
                    checked={neuralAutopilot}
                    onChange={(e) => setNeuralAutopilot(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {SPACE_ADDONS.neural_autopilot_l5.label}
                      </span>
                      <span className="text-primary font-bold">
                        +MC$ {SPACE_ADDONS.neural_autopilot_l5.rate}/sol
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {SPACE_ADDONS.neural_autopilot_l5.desc}
                    </p>
                  </div>
                </label>

                {/* Trajes EVA */}
                <div className="border border-border/60 bg-surface/40 p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-foreground">
                        {SPACE_ADDONS.extra_eva_suits.label}
                      </span>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {SPACE_ADDONS.extra_eva_suits.desc}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary font-bold">
                        +MC$ {SPACE_ADDONS.extra_eva_suits.rate * evaSuits}/sol
                      </span>
                      <div className="flex items-center border">
                        <button
                          type="button"
                          onClick={() => setEvaSuits(Math.max(0, evaSuits - 1))}
                          className="px-2 py-1 text-muted-foreground hover:text-foreground"
                        >
                          −
                        </button>
                        <span className="px-3 py-1 font-bold">{evaSuits}</span>
                        <button
                          type="button"
                          onClick={() => setEvaSuits(evaSuits + 1)}
                          className="px-2 py-1 text-muted-foreground hover:text-foreground"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Resumo Financeiro da Locação */}
                <div className="border-t border-border/60 pt-4 mt-6">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Diária Base ({vehicle.callsign}):</span>
                    <span>MC$ {dailyBase.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground mt-1">
                    <span>Adicionais e Seguros:</span>
                    <span>MC$ {dailyExtrasRate.toLocaleString("pt-BR")} / sol</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground mt-1">
                    <span>Período Total:</span>
                    <span>
                      {sols} Sols (Sols {startSol} a {startSol + sols})
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-primary/30 pt-3 mt-3">
                    <span className="font-bold text-foreground">TOTAL DA LOCAÇÃO:</span>
                    <span className="font-display text-2xl font-bold text-primary">
                      MC$ {totalCredits.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ETAPA 3: AUTENTICAÇÃO OBRIGATÓRIA DO PILOTO & VINCULAÇÃO */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5 font-mono text-xs"
              >
                {activeProfile ? (
                  /* Usuário Já Identificado e Autenticado com Sucesso */
                  <div className="border-2 border-emerald-500/60 bg-emerald-500/10 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400 font-bold flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" /> CREDENCIAL AUTENTICADA & VINCULADA À
                        RESERVA
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProfile(null);
                          clearDemoState();
                          void supabase.auth.signOut();
                          qc.clear();
                        }}
                        className="text-[10px] text-muted-foreground underline hover:text-foreground"
                      >
                        Trocar Conta
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-emerald-500/20">
                      <div>
                        <span className="text-muted-foreground">ID DA CREDENCIAL ESPACIAL</span>
                        <p className="font-display text-lg font-bold text-foreground">
                          {activeProfile.space_credential_id}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">HABILITAÇÃO DE PILOTO</span>
                        <p className="font-bold text-telemetry">
                          {licenseLabel[activeProfile.pilot_license]}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-emerald-500/20 pt-2">
                      <span className="text-muted-foreground">SALDO DISPONÍVEL EM CONTA:</span>
                      <span className="font-display text-xl text-primary font-bold">
                        MC$ {Number(activeProfile.martian_credits).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    {!hasValidLicense && (
                      <div className="border border-destructive/50 bg-destructive/10 p-3 text-destructive space-y-1">
                        <p className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4" /> Habilitação insuficiente para este
                          veículo!
                        </p>
                        <p className="text-[11px]">
                          O veículo {vehicle.name} exige licença "
                          {getRequiredLicense(vehicle.category)}", mas sua credencial possui apenas
                          "{licenseLabel[activeProfile.pilot_license]}".
                        </p>
                        {isDemoSession() && (
                          <button
                            type="button"
                            onClick={() => {
                              const upgraded = {
                                ...activeProfile,
                                pilot_license: "orbital" as const,
                              };
                              setActiveProfile(upgraded);
                              writeDemoProfile(upgraded);
                              toast.success("Habilitação elevada para Orbital.");
                            }}
                            className="mt-2 text-primary hover:underline font-bold"
                          >
                            ⚡ Elevar habilitação para Orbital (demo)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Visitante não autenticado — Autenticação Obrigatória */
                  <div className="space-y-4">
                    {/* Alerta de Obrigatoriedade */}
                    <div className="border border-warning/50 bg-warning/10 p-3 text-warning space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 shrink-0" /> Autenticação de Piloto
                        Obrigatória
                      </p>
                      <p className="text-[11px] leading-relaxed text-warning/90">
                        Para evitar reservas anônimas ou não autorizadas no tráfego aéreo marciano,
                        vincule a locação à sua credencial espacial ou crie uma conta em segundos.
                      </p>
                    </div>

                    {/* Botão de 1-Clique Acesso Demo */}
                    <div className="border border-telemetry/60 bg-telemetry/10 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-telemetry font-bold flex items-center gap-1.5">
                          <Zap className="h-4 w-4" /> Acesso Rápido de Demonstração (1-Clique)
                        </span>
                        <span className="text-[10px] text-telemetry/70">
                          Recomendado para Testes
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Autentique imediatamente com a credencial oficial de Comandante Demo
                        (`ARS-DEMO-01`, Licença Orbital e MC$ 25.000):
                      </p>
                      <button
                        type="button"
                        onClick={handleQuickDemoLogin}
                        className="cut-corner mt-3 flex items-center justify-center gap-2 border border-telemetry bg-telemetry/20 py-2.5 font-bold uppercase tracking-wider text-telemetry hover:bg-telemetry/30 transition w-full shadow-glow"
                      >
                        <Zap className="h-4 w-4" /> Autenticar como Comandante Demo
                      </button>
                    </div>

                    <div className="text-center text-muted-foreground text-[10px]">
                      <span>— OU CONECTE SUA CREDENCIAL DE COLONO —</span>
                    </div>

                    {/* Abas Login / Cadastro */}
                    <div className="grid grid-cols-2 gap-2 border-b border-border/50 pb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("login");
                          setAuthError(null);
                        }}
                        className={`py-2 text-center uppercase tracking-wider transition ${
                          authMode === "login"
                            ? "border-b-2 border-primary font-bold text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Já Tenho Credencial
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("register");
                          setAuthError(null);
                        }}
                        className={`py-2 text-center uppercase tracking-wider transition ${
                          authMode === "register"
                            ? "border-b-2 border-primary font-bold text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Criar Nova Credencial
                      </button>
                    </div>

                    {authError && (
                      <div className="border border-destructive/50 bg-destructive/10 p-2.5 text-[11px] text-destructive">
                        {authError}
                      </div>
                    )}

                    {authMode === "login" ? (
                      /* Formulário de Login */
                      <form onSubmit={handleLoginExisting} className="space-y-3">
                        <div>
                          <label className="text-muted-foreground">E-MAIL DO COLONO</label>
                          <div className="mt-1 flex items-center border bg-background/80 px-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <input
                              type="email"
                              required
                              placeholder="colono@jezero.mars"
                              value={pilotEmail}
                              onChange={(e) => setPilotEmail(e.target.value)}
                              className="w-full bg-transparent p-2 text-foreground focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-muted-foreground">CÓDIGO DE ACESSO / SENHA</label>
                          <div className="mt-1 flex items-center border bg-background/80 px-3">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                            <input
                              type="password"
                              required
                              placeholder="••••••••••••"
                              value={pilotPassword}
                              onChange={(e) => setPilotPassword(e.target.value)}
                              className="w-full bg-transparent p-2 text-foreground focus:outline-none"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isAuthLoading}
                          className="cut-corner w-full bg-mars-gradient py-2.5 font-sans font-bold uppercase tracking-widest text-primary-foreground shadow-glow disabled:opacity-50"
                        >
                          {isAuthLoading
                            ? "Verificando Credencial..."
                            : "Autenticar & Vincular Reserva"}
                        </button>
                      </form>
                    ) : (
                      /* Formulário de Registro Facilitado */
                      <form onSubmit={handleRegisterNew} className="space-y-3">
                        <div>
                          <label className="text-muted-foreground">E-MAIL DE REGISTRO</label>
                          <div className="mt-1 flex items-center border bg-background/80 px-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <input
                              type="email"
                              required
                              placeholder="seu-nome@aresmobility.mars"
                              value={pilotEmail}
                              onChange={(e) => setPilotEmail(e.target.value)}
                              className="w-full bg-transparent p-2 text-foreground focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-muted-foreground">
                            CÓDIGO DE ACESSO (MÍNIMO 6 DÍGITOS)
                          </label>
                          <div className="mt-1 flex items-center border bg-background/80 px-3">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                            <input
                              type="password"
                              required
                              placeholder="••••••••••••"
                              value={pilotPassword}
                              onChange={(e) => setPilotPassword(e.target.value)}
                              className="w-full bg-transparent p-2 text-foreground focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-muted-foreground">
                            HABILITAÇÃO DE PILOTO DESEJADA
                          </label>
                          <div className="mt-1.5 grid grid-cols-3 gap-2">
                            {(["atmospheric", "heavy_cargo", "orbital"] as const).map((lic) => (
                              <button
                                key={lic}
                                type="button"
                                onClick={() => setPilotLicense(lic)}
                                className={`border p-2 text-center text-[11px] uppercase transition ${
                                  pilotLicense === lic
                                    ? "border-primary bg-primary/20 text-primary font-bold"
                                    : "text-muted-foreground hover:border-muted-foreground"
                                }`}
                              >
                                {licenseLabel[lic]}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isAuthLoading}
                          className="cut-corner w-full bg-mars-gradient py-2.5 font-sans font-bold uppercase tracking-widest text-primary-foreground shadow-glow disabled:opacity-50"
                        >
                          {isAuthLoading
                            ? "Emitindo Credencial..."
                            : "Registrar Credencial & Vincular"}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ETAPA 4: CARTÃO DE EMBARQUE & CHAVE QUÂNTICA */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-5"
              >
                {/* Boarding Pass Estilizado */}
                <div className="cut-corner border-2 border-primary bg-gradient-to-b from-surface to-background p-6 font-mono text-xs shadow-glow">
                  <div className="flex flex-wrap items-center justify-between border-b border-primary/30 pb-4">
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-primary">
                        ARES MOBILITY · BOARDING PASS
                      </span>
                      <h3 className="font-display text-2xl font-bold text-foreground">
                        {vehicle.name}
                      </h3>
                      <p className="text-telemetry font-mono">
                        {vehicle.callsign} · {categoryLabel[vehicle.category]}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        CHAVE QUÂNTICA
                      </span>
                      <p className="font-mono text-lg font-bold text-primary">Q-KEY#8F4A92</p>
                      <span className="inline-block rounded bg-primary/20 px-2 py-0.5 text-[10px] text-primary">
                        EMITIDA & AUTORIZADA
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 border-b border-primary/20 pb-4">
                    <div>
                      <span className="text-muted-foreground">ITINERÁRIO</span>
                      <p className="font-semibold text-foreground">
                        {pickupHangar?.name} → {dropoffHangar?.name}
                      </p>
                      <p className="text-[10px] text-telemetry">
                        {distanceKm.toLocaleString("pt-BR")} km de rota
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PILOTO AUTENTICADO</span>
                      <p className="font-semibold text-foreground">
                        {activeProfile?.space_credential_id ?? "ARS-DEMO-01"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Sol {startSol} até Sol {startSol + sols} ({sols} Sols)
                      </p>
                    </div>
                  </div>

                  {/* Status da Barreira de Tempestade */}
                  <div className="mt-3 flex items-center justify-between border-b border-primary/20 pb-3 text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      BARREIRA CONTRA TEMPESTADES:
                    </span>
                    <span
                      className={`font-bold ${stormBarrierShield ? "text-emerald-400" : "text-muted-foreground"}`}
                    >
                      {stormBarrierShield ? "ATIVA (ESCUDO DEFLETOR IÔNICO 100%)" : "INATIVA"}
                    </span>
                  </div>

                  {/* Controles Remotos Espaciais Simulados */}
                  <div className="mt-4 space-y-2">
                    <span className="text-[10px] uppercase tracking-widest text-primary flex items-center gap-1.5">
                      <Radio className="h-3.5 w-3.5" /> COMANDOS REMOTOS DO VEÍCULO (LINK ORBITAL
                      ATIVO)
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRemoteActionNotice("Esclusa de ar principal destravada remotamente.");
                          toast.success("Esclusa de ar destravada!");
                        }}
                        className="border border-border/80 bg-surface/50 p-2 text-center hover:border-primary transition"
                      >
                        <KeyRound className="mx-auto h-4 w-4 text-primary mb-1" />
                        <span>Destravar Esclusa</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRemoteActionNotice(
                            "Cabine pressurizada a 101.3 kPa e climatizada a 21°C.",
                          );
                          toast.success("Cabine pressurizada a 101.3 kPa!");
                        }}
                        className="border border-border/80 bg-surface/50 p-2 text-center hover:border-telemetry transition"
                      >
                        <Wind className="mx-auto h-4 w-4 text-telemetry mb-1" />
                        <span>Pré-pressurizar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRemoteActionNotice("Piloto neural alinhado com o domo de embarque.");
                          toast.success("Autopiloto neural posicionado!");
                        }}
                        className="border border-border/80 bg-surface/50 p-2 text-center hover:border-warning transition"
                      >
                        <Bot className="mx-auto h-4 w-4 text-warning mb-1" />
                        <span>Chamar ao Hangar</span>
                      </button>
                    </div>

                    {remoteActionNotice && (
                      <p className="mt-2 text-[11px] text-telemetry bg-telemetry/10 border border-telemetry/30 p-2">
                        📡 Telemetria: {remoteActionNotice}
                      </p>
                    )}
                  </div>
                </div>

                {/* Botões de Ação Final */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate({ to: "/app/booking" });
                    }}
                    className="cut-corner flex-1 bg-mars-gradient py-3.5 font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow text-center"
                  >
                    Abrir Cockpit Completo (/app)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate({ to: "/app/mars-radar" });
                    }}
                    className="cut-corner border border-telemetry/60 bg-telemetry/10 px-6 py-3.5 font-mono text-xs font-semibold uppercase tracking-widest text-telemetry hover:bg-telemetry/20"
                  >
                    Ver no Radar 3D
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Wizard Footer Controls (Steps 1 to 3) */}
        {step < 4 && (
          <div className="flex items-center justify-between border-t border-border/60 bg-surface/80 p-4 font-mono text-xs">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
                className="border border-border px-4 py-2.5 text-muted-foreground hover:text-foreground transition"
              >
                ← Voltar
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-4">
              <span className="text-muted-foreground hidden sm:inline">
                Total:{" "}
                <strong className="text-primary font-display text-base">
                  MC$ {totalCredits.toLocaleString("pt-BR")}
                </strong>
              </span>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)}
                  className="cut-corner bg-mars-gradient px-6 py-2.5 font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow"
                >
                  Continuar →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!activeProfile || isAuthLoading || !hasValidLicense}
                  onClick={handleConfirmBooking}
                  className="cut-corner bg-mars-gradient px-6 py-2.5 font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {!activeProfile
                    ? "Autenticação Obrigatória para Reservar"
                    : isAuthLoading
                      ? "Emitindo Chave..."
                      : "Confirmar & Emitir Chave Quântica"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
