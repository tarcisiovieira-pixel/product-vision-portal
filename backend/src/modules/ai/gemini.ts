import { z } from "zod";
import type { Env } from "../../config/env.js";
import { LlmUnavailable, type LlmClient, type LlmRequest } from "./llm.js";

type GeminiEnv = Pick<Env, "GEMINI_API_KEY" | "GEMINI_MODEL"> & { GEMINI_BASE_URL?: string };

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

/** Tira cercas de markdown (```json) que alguns modelos colocam em volta do JSON. */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Provedor Gemini (Google AI Studio), com camada gratuita. Usa REST puro, sem SDK.
 * O JSON Schema vai no prompt e o modo JSON é ativado; a validação final é sempre nossa (zod),
 * então a resposta só vale se bater com o esquema esperado.
 * Devolve null sem chave: as IAs seguem no motor de regras.
 */
export function geminiLlm(
  env: GeminiEnv,
  fetchImpl: typeof fetch = fetch,
): (LlmClient & { provider: "gemini" }) | null {
  if (!env.GEMINI_API_KEY) return null;
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;
  const baseUrl = (
    env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/+$/, "");

  return {
    provider: "gemini",
    model,
    async parse<T>({ system, user, schema, maxTokens }: LlmRequest<T>): Promise<T> {
      const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
      const body = {
        systemInstruction: {
          parts: [
            {
              text: `${system}\n\nResponda SOMENTE com um objeto JSON válido que siga este JSON Schema, sem texto fora do JSON:\n${JSON.stringify(jsonSchema)}`,
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens,
          temperature: 0.2,
        },
      };

      let response: Response;
      try {
        response = await fetchImpl(
          `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
          },
        );
      } catch {
        throw new LlmUnavailable("Gemini inacessível");
      }
      // Nunca repassa o corpo do erro: pode ecoar partes da requisição.
      if (!response.ok) throw new LlmUnavailable(`Gemini respondeu ${response.status}`);

      let data: GeminiResponse;
      try {
        data = (await response.json()) as GeminiResponse;
      } catch {
        throw new LlmUnavailable("resposta ilegível do Gemini");
      }
      if (data.promptFeedback?.blockReason)
        throw new LlmUnavailable("pedido bloqueado pelo Gemini");
      const candidate = data.candidates?.[0];
      if (!candidate) throw new LlmUnavailable("Gemini sem resposta");
      if (candidate.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
        throw new LlmUnavailable(`Gemini interrompeu (${candidate.finishReason})`);
      }
      if (candidate.finishReason === "MAX_TOKENS") throw new LlmUnavailable("resposta cortada");

      const text = (candidate.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      let json: unknown;
      try {
        json = JSON.parse(stripFences(text));
      } catch {
        throw new LlmUnavailable("saída inválida (não é JSON)");
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new LlmUnavailable("saída inválida (fora do esquema)");
      return parsed.data;
    },
  };
}
