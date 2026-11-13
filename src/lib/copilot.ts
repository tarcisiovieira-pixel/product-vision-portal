// Copiloto de bordo no app. O motor (shared/copilot.ts) roda no navegador e responde sempre;
// com a API e a IA generativa, a mesma pergunta recebe uma fala mais natural, presa aos fatos.
import { COPILOT_OFF_TOPIC, answerCopilot, type CopilotContext } from "@shared/copilot";
import { apiEnabled, apiPost } from "./api-client";
import { hasRealSession } from "./ares-data";
import { isDemoSession } from "./session";

export interface CopilotReply {
  mode: "llm" | "rules";
  topic: string;
  reply: string;
  offTopic?: boolean;
  fallbackReason?: string;
}

export interface CopilotTripIds {
  vehicleId: string;
  originId: string;
  destinationId: string;
  progress: number;
}

function local(message: string, ctx: CopilotContext, reason: string): CopilotReply {
  const answer = answerCopilot(message, ctx);
  return {
    mode: "rules",
    topic: answer.topic,
    reply: answer.text,
    fallbackReason: reason,
    ...(answer.topic === "off_topic" ? { offTopic: true, reply: COPILOT_OFF_TOPIC } : {}),
  };
}

export async function askCopilot(
  message: string,
  ctx: CopilotContext,
  ids: CopilotTripIds,
): Promise<CopilotReply> {
  if (isDemoSession()) return local(message, ctx, "modo demo");
  if (!apiEnabled() || !(await hasRealSession())) {
    return local(message, ctx, "IA generativa não configurada");
  }
  try {
    return await apiPost<CopilotReply>("/v1/ai/copilot", { message, ...ids });
  } catch (error) {
    // Servidor dormindo ou sem a migration: o motor local responde do mesmo jeito.
    return local(message, ctx, error instanceof Error ? error.message : "servidor indisponível");
  }
}
