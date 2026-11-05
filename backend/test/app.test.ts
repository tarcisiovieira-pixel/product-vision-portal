import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const env = loadEnv({
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk_test",
  CORS_ORIGINS: "https://app.example.com",
});

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp({
    env,
    verifier: async (t) => (t === "good" ? { id: "u1", email: "a@b.c" } : null),
  });
});
afterAll(() => app.close());

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

describe("API", () => {
  it("GET /health é público", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  it("envia headers de segurança", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("GET /v1/me sem token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /v1/me com token inválido → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: auth("bad") });
    expect(res.statusCode).toBe(401);
  });

  it("GET /v1/me com token válido → 200", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: auth("good") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "u1", email: "a@b.c" });
  });

  it("rota inexistente → 404 JSON", async () => {
    const res = await app.inject({ method: "GET", url: "/nada" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });

  it("CORS não libera origem fora da lista", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.com" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("env inválido falha no boot", () => {
    expect(() => loadEnv({ NODE_ENV: "test" })).toThrow(/Configuração inválida/);
  });
});
