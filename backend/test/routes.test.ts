import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { mapDbError, type UserDb } from "../src/lib/supabase.js";

const env = loadEnv({
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk_test",
  CORS_ORIGINS: "https://app.example.com",
});

const ID = "11111111-1111-4111-8111-111111111111";
const headers = { authorization: "Bearer good" };
const rpc = vi.fn<UserDb["rpc"]>();
const list = vi.fn<UserDb["list"]>();
const tokens: string[] = [];

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp({
    env,
    verifier: async (t) => (t === "good" ? { id: "u1", email: "a@b.c" } : null),
    userDb: (token) => {
      tokens.push(token);
      return { rpc, list };
    },
  });
});
afterAll(() => app.close());
beforeEach(() => {
  rpc.mockReset();
  list.mockReset();
  tokens.length = 0;
});

const validRental = {
  vehicleId: ID,
  pickupHangarId: ID,
  dropoffHangarId: ID,
  startSol: 4219,
  endSol: 4222,
};
const post = (url: string, payload?: object) =>
  app.inject({ method: "POST", url, headers, ...(payload ? { payload } : {}) });

describe("POST /v1/rentals", () => {
  it("exige token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/rentals", payload: validRental });
    expect(res.statusCode).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cria a reserva com o token do próprio usuário", async () => {
    rpc.mockResolvedValue(ID);
    const res = await post("/v1/rentals", validRental);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: ID });
    expect(tokens).toEqual(["good"]);
    expect(rpc).toHaveBeenCalledWith(
      "book_vehicle",
      expect.objectContaining({ _vehicle_id: ID, _extra_eva_suits: 0, _silica_insurance: false }),
    );
  });

  it.each([
    ["UUID inválido", { ...validRental, vehicleId: "v-1" }],
    ["sol final antes do inicial", { ...validRental, endSol: 4100 }],
    ["período acima do limite", { ...validRental, endSol: 9000 }],
    ["trajes acima do limite", { ...validRental, extraEvaSuits: 99 }],
    ["sol não inteiro", { ...validRental, startSol: 1.5 }],
    ["preço vindo do cliente", { ...validRental, totalCredits: 1 }],
  ])("rejeita %s com 400 sem tocar no banco", async (_nome, payload) => {
    const res = await post("/v1/rentals", payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("devolve a regra de negócio do banco como 422", async () => {
    rpc.mockRejectedValue(mapDbError({ code: "P0001", message: "Saldo insuficiente" }));
    const res = await post("/v1/rentals", validRental);
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toBe("Saldo insuficiente");
  });
});

describe("demais rotas", () => {
  it("lista reservas", async () => {
    list.mockResolvedValue([{ id: ID }]);
    const res = await app.inject({ method: "GET", url: "/v1/rentals", headers });
    expect(res.json()).toEqual({ items: [{ id: ID }] });
  });

  it("estende 1 sol por padrão, mesmo sem corpo", async () => {
    rpc.mockResolvedValue(4223);
    const res = await post(`/v1/rentals/${ID}/extend`);
    expect(res.json()).toEqual({ endSol: 4223 });
    expect(rpc).toHaveBeenCalledWith("extend_rental", { _rental_id: ID, _extra_sols: 1 });
  });

  it("rejeita extensão fora da faixa", async () => {
    expect((await post(`/v1/rentals/${ID}/extend`, { extraSols: 31 })).statusCode).toBe(400);
  });

  it("cancela e informa o reembolso como número", async () => {
    rpc.mockResolvedValue("1260");
    const res = await post(`/v1/rentals/${ID}/cancel`);
    expect(res.json()).toEqual({ refunded: 1260 });
  });

  it("rejeita ID inválido na URL", async () => {
    expect((await post("/v1/rentals/abc/cancel")).statusCode).toBe(400);
  });

  it("aceita serviço de manutenção conhecido", async () => {
    rpc.mockResolvedValue({ ok: true });
    const res = await post("/v1/maintenance", { vehicleId: ID, serviceType: "o2_refill" });
    expect(res.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "execute_maintenance",
      expect.objectContaining({ _notes: null }),
    );
  });

  it("rejeita serviço de manutenção desconhecido", async () => {
    const res = await post("/v1/maintenance", { vehicleId: ID, serviceType: "free_upgrade" });
    expect(res.statusCode).toBe(400);
  });

  it("compra anúncio", async () => {
    rpc.mockResolvedValue(ID);
    const res = await post(`/v1/marketplace/${ID}/purchase`);
    expect(res.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledWith("buy_marketplace_vehicle", { _sale_id: ID });
  });
});

describe("mapDbError", () => {
  const cases: [string, string, number][] = [
    ["Veículo não encontrado", "P0001", 404],
    ["Perfil do piloto não localizado", "P0001", 404],
    ["Veículo indisponível no momento", "P0001", 409],
    ["Só reservas confirmadas podem ser canceladas", "P0001", 409],
    ["Veículo já reservado nesse período", "P0001", 409],
    ["Saldo insuficiente", "P0001", 422],
    ["Habilitação insuficiente!", "P0001", 422],
    ["Não autenticado", "P0001", 401],
    ["JWT expired", "PGRST301", 401],
  ];
  it.each(cases)("%s → %s → %i", (message, code, status) => {
    expect(mapDbError({ message, code }).statusCode).toBe(status);
  });

  it("não vaza erro interno do Postgres", () => {
    const err = mapDbError({ code: "42P01", message: 'relation "secret" does not exist' });
    expect(err.statusCode).toBe(502);
    expect(err.message).not.toContain("secret");
  });
});
