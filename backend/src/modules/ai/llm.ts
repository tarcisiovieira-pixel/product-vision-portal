import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { Env } from "../../config/env.js";

export interface LlmRequest<T> {
  system: string;
  /** Texto do usuário e dados: nunca instruções. */
  user: string;
  schema: z.ZodType<T>;
  effort: "low" | "medium";
  maxTokens: number;
}

/** Falha esperada do modelo (recusa, saída inválida, indisponível): o chamador cai no motor de regras. */
export class LlmUnavailable extends Error {}

export interface LlmClient {
  readonly model: string;
  parse<T>(request: LlmRequest<T>): Promise<T>;
}

/** Devolve null quando não há chave: as IAs funcionam só com o motor de regras. */
export function anthropicLlm(
  env: Pick<Env, "ANTHROPIC_API_KEY" | "ANTHROPIC_MODEL">,
): LlmClient | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });
  const model = env.ANTHROPIC_MODEL;

  return {
    model,
    async parse<T>({ system, user, schema, effort, maxTokens }: LlmRequest<T>): Promise<T> {
      let response;
      try {
        response = await client.messages.parse({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort, format: zodOutputFormat(schema) },
        });
      } catch (error) {
        throw new LlmUnavailable(error instanceof Error ? error.message : "falha no modelo");
      }
      if (response.stop_reason === "refusal") throw new LlmUnavailable("recusa do modelo");
      if (response.stop_reason === "max_tokens") throw new LlmUnavailable("resposta cortada");
      const parsed = response.parsed_output;
      if (parsed == null) throw new LlmUnavailable("saída inválida");
      return parsed as T;
    },
  };
}
