import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { supabaseUserDb, type UserDbFactory } from "./lib/supabase.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { adminVehicleRoutes } from "./modules/admin/vehicles.js";
import { aiRoutes } from "./modules/ai/routes.js";
import { type LlmClient } from "./modules/ai/llm.js";
import { createLlm } from "./modules/ai/providers.js";
import { healthRoutes } from "./modules/health/routes.js";
import { maintenanceRoutes } from "./modules/maintenance/routes.js";
import { marketplaceRoutes } from "./modules/marketplace/routes.js";
import { meRoutes } from "./modules/me/routes.js";
import { rentalRoutes } from "./modules/rentals/routes.js";
import { registerAuth, supabaseVerifier, type TokenVerifier } from "./plugins/auth.js";
import { registerErrors } from "./plugins/errors.js";

export interface BuildOptions {
  env: Env;
  /** Injetáveis para testes. */
  verifier?: TokenVerifier;
  userDb?: UserDbFactory;
  /** Modelo de linguagem; null desliga. Por padrão vem de GEMINI_API_KEY ou ANTHROPIC_API_KEY. */
  llm?: LlmClient | null;
}

export async function buildApp({
  env,
  verifier,
  userDb,
  llm,
}: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 512 * 1024,
    // Confia só nos N proxies mais próximos: o resto do X-Forwarded-For é do cliente.
    trustProxy: (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS,
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ["req.headers.authorization", "req.headers.cookie"],
          },
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: "1 minute" });

  registerErrors(app);
  registerAuth(app, verifier ?? supabaseVerifier(env));

  await app.register(healthRoutes);
  await app.register(meRoutes);

  const db = userDb ?? supabaseUserDb(env);
  await app.register(rentalRoutes(db));
  await app.register(maintenanceRoutes(db));
  await app.register(marketplaceRoutes(db));
  await app.register(adminRoutes(db));
  await app.register(adminVehicleRoutes(db));
  await app.register(aiRoutes(db, llm === undefined ? createLlm(env) : llm, env));

  return app;
}
