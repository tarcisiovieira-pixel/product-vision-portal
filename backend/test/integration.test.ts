// Integração real: API + Auth + Postgres + RLS de um Supabase local.
// Rode com SUPABASE_TEST_URL e SUPABASE_TEST_KEY definidos (veja o README). Sem eles, é pulado.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const baseUrl = process.env["SUPABASE_TEST_URL"];
const key = process.env["SUPABASE_TEST_KEY"];

describe.skipIf(!baseUrl || !key)("integração com Supabase real", () => {
  let app: FastifyInstance;
  const client = () =>
    createClient(baseUrl!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

  async function newUser(license: string) {
    const c = client();
    const email = `it-${Date.now()}-${Math.random().toString(36).slice(2)}@ares.test`;
    const { data, error } = await c.auth.signUp({
      email,
      password: "Teste#12345",
      options: { data: { pilot_license: license, space_credential_id: email.slice(0, 18) } },
    });
    if (error || !data.session)
      throw error ?? new Error("Sem sessão: confirmação de e-mail ligada?");
    return { c, id: data.session.user.id, token: data.session.access_token };
  }

  type User = Awaited<ReturnType<typeof newUser>>;
  const get = (user: User, url: string) =>
    app.inject({ method: "GET", url, headers: { authorization: `Bearer ${user.token}` } });
  const post = (user: User, url: string, payload: object = {}) =>
    app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${user.token}` },
      payload,
    });
  const credits = async (u: User) => {
    const { data } = await u.c
      .from("profiles")
      .select("martian_credits")
      .eq("user_id", u.id)
      .single();
    return Number(data?.martian_credits);
  };

  let pilot: User;
  let other: User;
  let vehicle: { id: string; daily_rate_sol: number };
  let rocket: { id: string };
  let hangars: string[];

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({
        NODE_ENV: "test",
        SUPABASE_URL: baseUrl,
        SUPABASE_PUBLISHABLE_KEY: key,
        CORS_ORIGINS: "http://localhost:8080",
        RATE_LIMIT_MAX: "1000",
      }),
    });
    pilot = await newUser("atmospheric");
    other = await newUser("atmospheric");
    const { data: vehicles } = await pilot.c
      .from("vehicles")
      .select("id, daily_rate_sol, category, status");
    vehicle = vehicles!.find((v) => v.category === "car_vtol" && v.status === "available")!;
    rocket = vehicles!.find((v) => v.category === "interplanetary_rocket")!;
    hangars = (await pilot.c.from("hangars").select("id")).data!.map((h) => h.id);
  });
  afterAll(() => app.close());

  const booking = () => ({
    vehicleId: vehicle.id,
    pickupHangarId: hangars[0],
    dropoffHangarId: hangars[1],
    startSol: 4300,
    endSol: 4302,
  });

  it("recusa token forjado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer forjado" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("conta nova nasce com 25.000 créditos e sem reservas", async () => {
    expect(await credits(pilot)).toBe(25000);
    expect((await get(pilot, "/v1/rentals")).json().items).toEqual([]);
  });

  it("reserva debita o valor calculado pelo servidor", async () => {
    const res = await post(pilot, "/v1/rentals", booking());
    expect(res.statusCode).toBe(201);
    expect(await credits(pilot)).toBe(25000 - vehicle.daily_rate_sol * 2);
  });

  it("habilitação atmosférica não aluga foguete", async () => {
    const res = await post(pilot, "/v1/rentals", { ...booking(), vehicleId: rocket.id });
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/Habilitação insuficiente/);
  });

  it("isolamento: um usuário não vê nem cancela a reserva do outro", async () => {
    const mine = (await get(pilot, "/v1/rentals")).json().items;
    expect(mine).toHaveLength(1);
    expect((await get(other, "/v1/rentals")).json().items).toEqual([]);
    expect((await post(other, `/v1/rentals/${mine[0].id}/cancel`)).statusCode).toBe(404);
  });

  it("estender cobra +1 sol e persiste", async () => {
    const [rental] = (await get(pilot, "/v1/rentals")).json().items;
    const before = await credits(pilot);
    const res = await post(pilot, `/v1/rentals/${rental.id}/extend`);
    expect(res.json().endSol).toBe(rental.end_sol + 1);
    expect(await credits(pilot)).toBe(before - vehicle.daily_rate_sol);
  });

  it("cancelar devolve tudo; cancelar de novo é conflito", async () => {
    const [rental] = (await get(pilot, "/v1/rentals")).json().items;
    expect((await post(pilot, `/v1/rentals/${rental.id}/cancel`)).statusCode).toBe(200);
    expect(await credits(pilot)).toBe(25000);
    expect((await post(pilot, `/v1/rentals/${rental.id}/cancel`)).statusCode).toBe(409);
  });

  it("manutenção debita créditos", async () => {
    const res = await post(pilot, "/v1/maintenance", {
      vehicleId: vehicle.id,
      serviceType: "silica_clean",
    });
    expect(res.statusCode).toBe(201);
    expect(await credits(pilot)).toBe(25000 - 450);
  });

  it("compra real e bloqueio de recompra", async () => {
    const { data: sales } = await pilot.c
      .from("vehicle_sales")
      .select("id, price_credits")
      .eq("status", "available_for_sale")
      .lte("price_credits", 24000)
      .limit(1);
    const sale = sales![0]!;
    const before = await credits(pilot);
    expect((await post(pilot, `/v1/marketplace/${sale.id}/purchase`)).statusCode).toBe(201);
    expect(await credits(pilot)).toBe(before - sale.price_credits);
    expect((await post(other, `/v1/marketplace/${sale.id}/purchase`)).statusCode).toBe(409);
  });

  describe("ocupação", () => {
    const slot = (startSol: number, endSol: number) => ({ ...booking(), startSol, endSol });

    it("segundo usuário não reserva período ocupado e não é cobrado", async () => {
      expect((await post(pilot, "/v1/rentals", slot(5000, 5003))).statusCode).toBe(201);
      const before = await credits(other);
      const res = await post(other, "/v1/rentals", slot(5002, 5004));
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toMatch(/já reservado/);
      expect(await credits(other)).toBe(before);
    });

    it("período colado é permitido, e estender não invade o próximo", async () => {
      expect((await post(other, "/v1/rentals", slot(5003, 5005))).statusCode).toBe(201);
      const items = (await get(pilot, "/v1/rentals")).json().items;
      const rental = items.find((r: { start_sol: number }) => r.start_sol === 5000);
      expect((await post(pilot, `/v1/rentals/${rental.id}/extend`)).statusCode).toBe(409);
    });

    it("reservas simultâneas: só uma vence", async () => {
      const results = await Promise.all([
        post(pilot, "/v1/rentals", slot(5100, 5101)),
        post(other, "/v1/rentals", slot(5100, 5101)),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    });

    it("cancelar libera o período", async () => {
      const items = (await get(pilot, "/v1/rentals")).json().items;
      const rental = items.find((r: { start_sol: number }) => r.start_sol === 5000);
      await post(pilot, `/v1/rentals/${rental.id}/cancel`);
      expect((await post(other, "/v1/rentals", slot(5000, 5002))).statusCode).toBe(201);
    });

    it("a tela enxerga a ocupação sem expor quem reservou", async () => {
      const { data } = await pilot.c.rpc("vehicle_occupancy");
      expect(data!.length).toBeGreaterThan(0);
      expect(Object.keys(data![0]!).sort()).toEqual(["end_sol", "start_sol", "vehicle_id"]);
    });

    it("manutenção não libera veículo em voo", async () => {
      const { data: flying } = await pilot.c
        .from("vehicles")
        .select("id")
        .eq("status", "in_flight")
        .limit(1);
      const id = flying![0]!.id;
      await post(pilot, "/v1/maintenance", { vehicleId: id, serviceType: "thruster_calibration" });
      const { data } = await pilot.c.from("vehicles").select("status").eq("id", id).single();
      expect(data?.status).toBe("in_flight");
    });
  });

  it("o usuário não altera os próprios créditos direto no banco", async () => {
    const before = await credits(pilot);
    await pilot.c.from("profiles").update({ martian_credits: 999999 }).eq("user_id", pilot.id);
    expect(await credits(pilot)).toBe(before);
  });
});
