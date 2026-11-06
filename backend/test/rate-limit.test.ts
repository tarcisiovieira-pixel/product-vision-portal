import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const base = {
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk_test",
  RATE_LIMIT_MAX: "3",
};

describe("limite de requisições", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ env: loadEnv({ ...base, TRUST_PROXY_HOPS: "1" }) });
  });
  afterAll(() => app.close());

  it("X-Forwarded-For forjado pelo cliente não abre balde novo", async () => {
    const codes: number[] = [];
    for (let n = 0; n < 6; n++) {
      // O proxy confiável anexa 10.0.0.1; tudo à esquerda é inventado pelo cliente.
      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: { "x-forwarded-for": `falso-${n}, 10.0.0.1` },
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes.slice(3)).toEqual([429, 429, 429]);
  });

  it("clientes diferentes atrás do proxy têm baldes separados", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("configuração", () => {
  it("o padrão confia em um único proxy", () => {
    expect(loadEnv(base).TRUST_PROXY_HOPS).toBe(1);
  });

  it("recusa número de saltos absurdo", () => {
    expect(() => loadEnv({ ...base, TRUST_PROXY_HOPS: "50" })).toThrow(/Configuração inválida/);
  });
});
