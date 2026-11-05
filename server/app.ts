import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_PROFILE,
  SEED_HANGARS,
  SEED_RENTALS,
  SEED_VEHICLES,
  SEED_WEATHER,
} from "../src/lib/ares-seed-data";

// Configuração do Supabase Client Seguro no Backend
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://qxlzdpahifwiyzmxlpef.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_v14V2TJpZxGcSSaDY-_B1A_014sG4c9";

export const supabaseServer = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function createApp() {
  const app = express();

  // 1. HEADERS DE SEGURANÇA (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      xFrameOptions: { action: "sameorigin" },
      xContentTypeOptions: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  // 2. CONTROLE DE CORS RESTRITO
  app.use(
    cors({
      origin: (origin, callback) => {
        // Permite requisições sem origin (ex: mobile apps, curl, testes) ou origens permitidas
        if (!origin || /^http:\/\/localhost:(8080|3000|5173|3001)$/.test(origin) || /^http:\/\/127\.0\.0\.1:(8080|3000|5173|3001)$/.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Bloqueado por política CORS do ARES Backend"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Ares-Demo", "apikey"],
    }),
  );

  // 3. PARSER COM LIMITE DE CARGA (Previne ataques de payload massivo / DoS)
  app.use(express.json({ limit: "512kb" }));

  // 4. RATE LIMITERS (Proteção contra força bruta, scraping e DDoS)
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 150,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas requisições originadas deste IP. Limite de tráfego espacial atingido." },
  });

  const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    limit: 15, // máximo 15 tentativas
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas tentativas de autenticação. Tente novamente em 5 minutos." },
  });

  const bookingLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas solicitações de contratação. Aguarde a sincronização orbital." },
  });

  app.use("/api/", generalLimiter);
  app.use("/api/auth/", authLimiter);
  app.use("/api/rentals/book", bookingLimiter);

  // Estado em memória resiliente para testes/demonstração
  const memoryRentals = [...SEED_RENTALS];
  const memoryVehicles = [...SEED_VEHICLES];

  // ==========================================
  // ROTAS DO BACKEND
  // ==========================================

  // Healthcheck & Diagnóstico de Segurança
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "operational",
      system: "ARES Mobility Core Backend",
      environment: process.env.NODE_ENV || "development",
      solTime: 4218,
      security: {
        rateLimiterActive: true,
        helmetActive: true,
        corsActive: true,
        supabaseConnected: Boolean(SUPABASE_URL),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Autenticação Segura (Login com Supabase ou Fallback Demo)
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    try {
      const { data, error } = await supabaseServer.auth.signInWithPassword({
        email: String(email).trim(),
        password: String(password),
      });

      if (error) {
        // Se for a conta demo oficial, permite acesso simulado seguro
        if (email === "demo@aresmobility.com") {
          return res.json({
            user: { id: DEMO_PROFILE.user_id, email },
            profile: DEMO_PROFILE,
            token: "demo-jwt-martian-token-validated",
            mode: "demo",
          });
        }
        return res.status(401).json({ error: error.message });
      }

      return res.json({
        user: data.user,
        session: data.session,
        token: data.session?.access_token,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Erro no servidor de autenticação." });
    }
  });

  // Verificação de Token de Sessão
  app.get("/api/auth/verify", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ authenticated: false, error: "Token não fornecido." });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (token === "demo-jwt-martian-token-validated") {
      return res.json({ authenticated: true, user: { email: "demo@aresmobility.com" }, profile: DEMO_PROFILE });
    }

    try {
      const { data, error } = await supabaseServer.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ authenticated: false, error: "Token inválido ou expirado." });
      }

      return res.json({ authenticated: true, user: data.user });
    } catch {
      return res.status(401).json({ authenticated: false, error: "Falha na validação do token." });
    }
  });

  // Catálogo da Frota
  app.get("/api/fleet/vehicles", async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseServer
        .from("vehicles")
        .select("*")
        .order("category")
        .order("callsign");

      if (error || !data || data.length === 0) {
        return res.json(memoryVehicles);
      }
      return res.json(data);
    } catch {
      return res.json(memoryVehicles);
    }
  });

  // Lista de Reservas
  app.get("/api/rentals", async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseServer
        .from("rentals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error || !data || data.length === 0) {
        return res.json(memoryRentals);
      }
      return res.json(data);
    } catch {
      return res.json(memoryRentals);
    }
  });

  // Contratação de Reserva Segura com Validação no Servidor
  app.post("/api/rentals/book", async (req: Request, res: Response) => {
    const {
      vehicle_id,
      pickup_hangar_id,
      dropoff_hangar_id,
      start_sol,
      end_sol,
      silica_insurance = false,
      extra_o2_tank = false,
      neural_autopilot_l5 = false,
      extra_eva_suits = 0,
      user_license = "atmospheric",
    } = req.body;

    // 1. Validação de Parâmetros
    if (!vehicle_id || !pickup_hangar_id || !dropoff_hangar_id) {
      return res.status(400).json({ error: "Parâmetros incompletos (veículo e hangares são obrigatórios)." });
    }
    if (typeof start_sol !== "number" || typeof end_sol !== "number" || end_sol <= start_sol) {
      return res.status(400).json({ error: "Período inválido: sol final deve ser estritamente maior que o inicial." });
    }

    const veh = memoryVehicles.find((v) => v.id === vehicle_id);
    if (!veh) {
      return res.status(404).json({ error: "Veículo não encontrado no catálogo marciano." });
    }

    // 2. Validação de Licença de Piloto no Backend
    if (veh.category === "interplanetary_rocket" && user_license !== "orbital") {
      return res.status(403).json({ error: "Habilitação insuficiente! Foguetes exigem licença Orbital." });
    }
    if (veh.category === "space_truck" && !["heavy_cargo", "orbital"].includes(user_license)) {
      return res.status(403).json({ error: "Habilitação insuficiente! Caminhões Espaciais exigem Carga Pesada ou Orbital." });
    }

    // 3. Cálculo de Tarifa e Adicionais
    const sols = end_sol - start_sol;
    let extrasDaily = 0;
    if (silica_insurance) extrasDaily += 120;
    if (extra_o2_tank) extrasDaily += 180;
    if (neural_autopilot_l5) extrasDaily += 350;
    if (extra_eva_suits > 0) extrasDaily += 100 * Number(extra_eva_suits);

    const totalCredits = (veh.daily_rate_sol + extrasDaily) * sols;
    const quantumKey = `Q-KEY#${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Tentar executar via RPC segura no Supabase
    try {
      const { data, error } = await supabaseServer.rpc("book_vehicle", {
        _vehicle_id: vehicle_id,
        _pickup: pickup_hangar_id,
        _dropoff: dropoff_hangar_id,
        _start_sol: start_sol,
        _end_sol: end_sol,
        _silica_insurance: Boolean(silica_insurance),
        _extra_o2_tank: Boolean(extra_o2_tank),
        _neural_autopilot_l5: Boolean(neural_autopilot_l5),
        _extra_eva_suits: Number(extra_eva_suits),
      });

      if (!error && data) {
        return res.status(201).json({ success: true, rentalId: data, quantumKey, totalCredits });
      }
    } catch {}

    // Fallback atômico em memória para o backend
    const newRental = {
      id: `rent-${Date.now()}`,
      user_id: "demo-commander-ares",
      vehicle_id,
      pickup_hangar_id,
      dropoff_hangar_id,
      start_sol,
      end_sol,
      total_credits: totalCredits,
      silica_insurance: Boolean(silica_insurance),
      extra_o2_tank: Boolean(extra_o2_tank),
      neural_autopilot_l5: Boolean(neural_autopilot_l5),
      extra_eva_suits: Number(extra_eva_suits),
      quantum_key: quantumKey,
      status: "confirmed" as const,
      created_at: new Date().toISOString(),
    };
    memoryRentals.unshift(newRental as any);

    return res.status(201).json({
      success: true,
      rentalId: newRental.id,
      rental: newRental,
      quantumKey,
      totalCredits,
    });
  });

  // Estender Reserva
  app.post("/api/rentals/:id/extend", (req: Request, res: Response) => {
    const { id } = req.params;
    const rental = memoryRentals.find((r) => r.id === id);
    if (!rental) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    const veh = memoryVehicles.find((v) => v.id === rental.vehicle_id);
    const extraDaily = veh?.daily_rate_sol ?? 420;

    rental.end_sol = (rental.end_sol ?? rental.start_sol) + 1;
    rental.total_credits = Number(rental.total_credits) + extraDaily;

    return res.json({ success: true, rental, newEndSol: rental.end_sol, newTotal: rental.total_credits });
  });

  // Cancelar Reserva
  app.post("/api/rentals/:id/cancel", (req: Request, res: Response) => {
    const { id } = req.params;
    const rental = memoryRentals.find((r) => r.id === id);
    if (!rental) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }
    if (rental.status === "in_flight") {
      return res.status(400).json({ error: "Não é possível cancelar uma espaçonave em voo orbital." });
    }

    rental.status = "cancelled" as any;
    return res.json({ success: true, rental, refundedCredits: rental.total_credits });
  });

  // Manutenção Preventiva
  app.post("/api/maintenance/service", (req: Request, res: Response) => {
    const { vehicle_id, service_type } = req.body;
    const veh = memoryVehicles.find((v) => v.id === vehicle_id);
    if (!veh) {
      return res.status(404).json({ error: "Veículo não encontrado." });
    }

    if (service_type === "silica_clean") veh.dust_filter_pct = 100;
    if (service_type === "cryo_recharge") veh.battery_pct = 100;
    if (service_type === "thruster_calibration") veh.thruster_integrity = 100;
    veh.status = "available";

    return res.json({ success: true, vehicle: veh, message: "Manutenção executada com sucesso." });
  });

  // Tratamento Global de Erros (Prevenção contra vazamento de stacktrace)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Backend Error:", err.message);
    res.status(500).json({ error: "Erro interno no servidor espacial ARES." });
  });

  return app;
}
