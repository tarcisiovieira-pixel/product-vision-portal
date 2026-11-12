import { createClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import { HttpError } from "../plugins/errors.js";

export type SupabaseEnv = Pick<Env, "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">;

/** Executa operações como o usuário: RLS e auth.uid() continuam valendo no banco. */
export interface UserDb {
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  list(table: string, order: string): Promise<unknown[]>;
}

export type UserDbFactory = (token: string) => UserDb;

const AUTH_ERRORS = /não autenticado|jwt/i;
const FORBIDDEN_ERRORS = /acesso negado|conta suspensa|manutenção exige/i;
const NOT_FOUND_ERRORS = /não encontrad|não localizado/i;
const CONFLICT_ERRORS =
  /indisponível|não está mais disponível|só reservas|próprio anúncio|já reservado|já iniciada|já existe|já está arquivado|não está arquivado|reservas ativas|restaure o veículo/i;
/** Regras de negócio levantadas pelas funções SQL via RAISE EXCEPTION. */
const BUSINESS_CODE = "P0001";

/** Traduz erro do Postgres para HTTP, sem expor detalhes internos. */
export function mapDbError(error: { message: string; code?: string | undefined }): HttpError {
  const { message, code } = error;
  if (AUTH_ERRORS.test(message)) return new HttpError(401, "unauthorized", "Sessão inválida.");
  if (code !== BUSINESS_CODE) {
    return new HttpError(502, "database_error", "Falha ao acessar os dados.");
  }
  if (FORBIDDEN_ERRORS.test(message)) return new HttpError(403, "forbidden", message);
  if (NOT_FOUND_ERRORS.test(message)) return new HttpError(404, "not_found", message);
  if (CONFLICT_ERRORS.test(message)) return new HttpError(409, "conflict", message);
  return new HttpError(422, "business_rule", message);
}

export function supabaseUserDb(env: SupabaseEnv): UserDbFactory {
  return (token) => {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    return {
      async rpc(fn, args) {
        const { data, error } = await client.rpc(fn, args);
        if (error) throw mapDbError(error);
        return data;
      },
      async list(table, order) {
        const { data, error } = await client
          .from(table)
          .select("*")
          .order(order, { ascending: false });
        if (error) throw mapDbError(error);
        return data ?? [];
      },
    };
  };
}
