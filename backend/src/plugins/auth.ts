import { createClient } from "@supabase/supabase-js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";

export interface AuthUser {
  id: string;
  email: string | undefined;
  /** JWT do usuário, para chamadas ao Supabase respeitando RLS. */
  token: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export type TokenVerifier = (
  token: string,
) => Promise<{ id: string; email: string | undefined } | null>;

/** Verificador padrão: valida o JWT consultando o Auth do Supabase. */
export function supabaseVerifier(
  env: Pick<Env, "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">,
): TokenVerifier {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (token) => {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email };
  };
}

export function registerAuth(app: FastifyInstance, verify: TokenVerifier): void {
  app.decorateRequest("user", null);
  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "unauthorized", message: "Token ausente." });
    }
    const token = header.slice(7).trim();
    const user = await verify(token).catch(() => null);
    if (!user) {
      return reply
        .code(401)
        .send({ error: "unauthorized", message: "Token inválido ou expirado." });
    }
    req.user = { ...user, token };
  });
}
