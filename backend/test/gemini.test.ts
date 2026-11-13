import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { geminiLlm } from "../src/modules/ai/gemini.js";
import { LlmUnavailable } from "../src/modules/ai/llm.js";
import { createLlm } from "../src/modules/ai/providers.js";

const env = { GEMINI_API_KEY: "AIza-teste-secreta", GEMINI_MODEL: "gemini-teste" };
const schema = z.object({ reply: z.string(), n: z.number().nullable() });
const request = {
  system: "Você é um assistente.",
  user: "<pedido>olá</pedido>",
  schema,
  effort: "low" as const,
  maxTokens: 1000,
};

const reply = (body: unknown, init: ResponseInit = { status: 200 }) =>
  Promise.resolve(new Response(JSON.stringify(body), init));
const ok = (text: string, extra: object = {}) =>
  reply({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP", ...extra }] });

describe("provedor Gemini", () => {
  it("sem chave não há cliente", () => {
    expect(geminiLlm({ GEMINI_API_KEY: undefined, GEMINI_MODEL: "m" })).toBeNull();
  });

  it("chama a API certa, com a chave só no cabeçalho, e valida a saída", async () => {
    const fetchMock = vi.fn(() => ok('{"reply":"Olá!","n":null}'));
    const llm = geminiLlm(env, fetchMock as unknown as typeof fetch)!;
    expect(llm).toMatchObject({ provider: "gemini", model: "gemini-teste" });
    await expect(llm.parse(request)).resolves.toEqual({ reply: "Olá!", n: null });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-teste:generateContent",
    );
    expect(url).not.toContain("AIza");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(env.GEMINI_API_KEY);
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json" });
    expect(body.contents[0].parts[0].text).toBe("<pedido>olá</pedido>"); // texto do usuário fica fora do system
    expect(body.systemInstruction.parts[0].text).toContain('"reply"'); // esquema enviado
    expect(body.systemInstruction.parts[0].text).not.toContain("olá");
  });

  it("aceita JSON dentro de cerca de markdown e ignora partes de raciocínio", async () => {
    const llm = geminiLlm(env, (() =>
      reply({
        candidates: [
          {
            content: {
              parts: [
                { text: "pensando...", thought: true },
                { text: '```json\n{"reply":"ok","n":3}\n```' },
              ],
            },
            finishReason: "STOP",
          },
        ],
      })) as unknown as typeof fetch)!;
    await expect(llm.parse(request)).resolves.toEqual({ reply: "ok", n: 3 });
  });

  it.each([
    [
      "erro HTTP (cota, chave inválida)",
      () => reply({ error: { message: "chave AIza-xyz" } }, { status: 429 }),
    ],
    ["rede fora do ar", () => Promise.reject(new TypeError("fetch failed"))],
    ["sem candidatos", () => reply({})],
    ["pedido bloqueado", () => reply({ promptFeedback: { blockReason: "SAFETY" } })],
    ["interrompido por segurança", () => ok("{}", { finishReason: "SAFETY" })],
    ["resposta cortada", () => ok('{"reply":"x"', { finishReason: "MAX_TOKENS" })],
    ["não é JSON", () => ok("Claro! Aqui está sua resposta.")],
    ["fora do esquema", () => ok('{"reply":123,"n":null}')],
    ["corpo ilegível", () => Promise.resolve(new Response("<html>", { status: 200 }))],
  ])("cai no motor de regras: %s", async (_name, handler) => {
    const llm = geminiLlm(env, handler as unknown as typeof fetch)!;
    const error = await llm.parse(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmUnavailable);
  });

  it("a mensagem de erro nunca vaza a chave nem o corpo da resposta", async () => {
    const llm = geminiLlm(env, (() =>
      reply(
        { error: { message: `chave ${env.GEMINI_API_KEY}` } },
        { status: 403 },
      )) as unknown as typeof fetch)!;
    const error = (await llm.parse(request).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("Gemini respondeu 403");
    expect(error.message).not.toContain("AIza");
  });
});

describe("escolha do provedor", () => {
  const base = {
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_MODEL: "claude-opus-5-5",
    GEMINI_API_KEY: undefined,
    GEMINI_MODEL: "gemini-teste",
    AI_PROVIDER: undefined,
  };

  it("sem nenhuma chave, nada", () => {
    expect(createLlm(base)).toBeNull();
  });

  it("só Gemini ou só Claude", () => {
    expect(createLlm({ ...base, GEMINI_API_KEY: "g" })?.provider).toBe("gemini");
    expect(createLlm({ ...base, ANTHROPIC_API_KEY: "a" })?.provider).toBe("anthropic");
  });

  it("com as duas chaves, o Gemini (gratuito) vence, salvo AI_PROVIDER", () => {
    const both = { ...base, GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" };
    expect(createLlm(both)?.provider).toBe("gemini");
    expect(createLlm({ ...both, AI_PROVIDER: "anthropic" })?.provider).toBe("anthropic");
  });

  it("AI_PROVIDER sem a chave correspondente desliga a IA generativa", () => {
    expect(createLlm({ ...base, GEMINI_API_KEY: "g", AI_PROVIDER: "anthropic" })).toBeNull();
  });
});
