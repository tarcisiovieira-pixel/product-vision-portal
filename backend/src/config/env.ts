import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Lista de origens permitidas, separadas por vírgula. */
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8080,http://localhost:5173")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  /**
   * Quantos proxies confiáveis existem na frente da API (o Render conta 1).
   * Só o IP que o último proxy anexou vale: o resto do X-Forwarded-For é do cliente.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  /** Sem chave, as IAs seguem funcionando com o motor de regras (sem texto gerado). */
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  ANTHROPIC_MODEL: z.string().trim().min(1).default("claude-opus-5-5"),
  /** Chamadas por usuário por dia, por tipo de IA, ao modelo generativo. */
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
});

export type Env = z.infer<typeof schema>;

/** Valida variáveis de ambiente no boot; falha rápido com mensagem clara. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida: ${issues}`);
  }
  return parsed.data;
}
