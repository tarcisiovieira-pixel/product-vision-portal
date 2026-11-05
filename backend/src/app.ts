import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { healthRoutes } from "./modules/health/routes.js";
import { meRoutes } from "./modules/me/routes.js";
import { registerAuth, supabaseVerifier, type TokenVerifier } from "./plugins/auth.js";
import { registerErrors } from "./plugins/errors.js";

export interface BuildOptions {
  env: Env;
  /** Injetável para testes. */
  verifier?: TokenVerifier;
}

export async function buildApp({ env, verifier }: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 512 * 1024,
    trustProxy: true, // atrás do proxy do Render
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

  return app;
}
