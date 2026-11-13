import type { Env } from "../../config/env.js";
import { geminiLlm } from "./gemini.js";
import { anthropicLlm, type LlmClient } from "./llm.js";

type ProviderEnv = Pick<
  Env,
  "ANTHROPIC_API_KEY" | "ANTHROPIC_MODEL" | "GEMINI_API_KEY" | "GEMINI_MODEL" | "AI_PROVIDER"
> & { GEMINI_BASE_URL?: string };

/** Escolhe o provedor: AI_PROVIDER manda; sem ele, o Gemini (gratuito) vence se tiver chave. */
export function createLlm(env: ProviderEnv): LlmClient | null {
  const provider = env.AI_PROVIDER ?? (env.GEMINI_API_KEY ? "gemini" : "anthropic");
  return provider === "gemini" ? geminiLlm(env) : anthropicLlm(env);
}
