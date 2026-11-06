// Integração real: API + Auth + Postgres + RLS de um Supabase local.
// Rode com SUPABASE_TEST_URL e SUPABASE_TEST_KEY definidos (veja o README). Sem eles, é pulado.
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const baseUrl = process.env["SUPABASE_TEST_URL"];
const key = process.env["SUPABASE_TEST_KEY"];
const dbContainer = process.env["SUPABASE_TEST_DB_CONTAINER"] ?? "supabase_db_qxlzdpahifwiyzmxlpef";

/** Promover admin é operação manual no banco, de propósito: não existe rota para isso. */
function promote(userId: string) {
  execFileSync("docker", [
    "exec",
    dbContainer,
    "psql",
    "-U",
    "postgres",
    "-c",
    `insert into public.admin_users (user_id) values ('${userId}')`,
  ]);
}

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
      .order("price_credits")
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

  it("o usuário não se promove direto no banco", async () => {
    await pilot.c.from("profiles").update({ pilot_license: "orbital" }).eq("user_id", pilot.id);
    const { data } = await pilot.c
      .from("profiles")
      .select("pilot_license")
      .eq("user_id", pilot.id)
      .single();
    expect(data?.pilot_license).toBe("atmospheric");
  });

  it("barreira anti-tempestade é cobrada", async () => {
    const before = await credits(other);
    const res = await post(other, "/v1/rentals", {
      ...booking(),
      startSol: 5200,
      endSol: 5201,
      stormBarrier: true,
    });
    expect(res.statusCode).toBe(201);
    expect(await credits(other)).toBe(before - vehicle.daily_rate_sol - 220);
  });

  it("o vendedor recebe o valor da venda", async () => {
    const callsign = `IT-${Date.now()}`;
    const { error } = await pilot.c.from("vehicle_sales").insert({
      name: "Nave de teste",
      callsign,
      category: "car_vtol",
      price_credits: 300,
      seller_user_id: pilot.id,
    });
    expect(error).toBeNull();
    const { data: sale } = await other.c
      .from("vehicle_sales")
      .select("id")
      .eq("callsign", callsign)
      .single();
    const seller = await credits(pilot);
    const buyer = await credits(other);
    expect((await post(other, `/v1/marketplace/${sale!.id}/purchase`)).statusCode).toBe(201);
    expect(await credits(pilot)).toBe(seller + 300);
    expect(await credits(other)).toBe(buyer - 300);
  });

  it("visitante não lê o id do vendedor", async () => {
    const { error } = await client().from("vehicle_sales").select("seller_user_id").limit(1);
    expect(error?.message).toMatch(/permission denied/);
    const { data } = await client().from("vehicle_sales").select("callsign").limit(1);
    expect(data?.length).toBe(1);
  });

  describe("administração", () => {
    let admin: User;

    beforeAll(async () => {
      admin = await newUser("atmospheric");
      promote(admin.id);
    });

    it("usuário comum recebe 403 em todas as leituras", async () => {
      for (const path of ["overview", "users", "audit"]) {
        expect((await get(pilot, `/v1/admin/${path}`)).statusCode).toBe(403);
      }
    });

    it("usuário comum não executa ações, nem direto no banco", async () => {
      const res = await post(pilot, `/v1/admin/users/${pilot.id}/credits`, {
        delta: 999,
        reason: "fraude",
      });
      expect(res.statusCode).toBe(403);
      const { error } = await pilot.c.rpc("admin_adjust_credits", {
        _user_id: pilot.id,
        _delta: 999,
        _reason: "fraude",
      });
      expect(error?.message).toMatch(/Acesso negado/);
      const direct = await pilot.c.from("admin_users").insert({ user_id: pilot.id });
      expect(direct.error).not.toBeNull();
    });

    it("visitante não executa as funções", async () => {
      const { error } = await client().rpc("admin_overview");
      expect(error?.message).toMatch(/permission denied/);
    });

    it("indicadores batem com os dados do banco", async () => {
      const res = await get(admin, "/v1/admin/overview");
      expect(res.statusCode).toBe(200);
      const o = res.json();
      expect(o.users.total).toBeGreaterThanOrEqual(3);
      expect(o.signups_by_day).toHaveLength(14);
      expect(o.fleet.total).toBe(8);
      expect(o.rentals.revenue).toBeGreaterThan(0);
    });

    it("lista usuários com reservas e gasto", async () => {
      const { items } = (await get(admin, "/v1/admin/users")).json();
      const row = items.find((u: { user_id: string }) => u.user_id === other.id);
      expect(row.email).toMatch(/@ares\.test$/);
      expect(Number(row.rentals_total)).toBeGreaterThan(0);
      expect(row.suspended).toBe(false);
    });

    it("ajusta créditos, não deixa saldo negativo e audita", async () => {
      const before = await credits(other);
      const url = `/v1/admin/users/${other.id}/credits`;
      expect((await post(admin, url, { delta: 500, reason: "bônus" })).json().balance).toBe(
        before + 500,
      );
      expect((await post(admin, url, { delta: -99999999 + 0, reason: "erro" })).statusCode).toBe(
        400,
      );
      expect((await post(admin, url, { delta: -999999, reason: "erro" })).statusCode).toBe(422);
      const { items } = (await get(admin, "/v1/admin/audit")).json();
      expect(items[0].action).toBe("credits_adjusted");
      expect(items[0].details.reason).toBe("bônus");
    });

    it("altera habilitação e a nova licença vale na reserva", async () => {
      const res = await post(admin, `/v1/admin/users/${pilot.id}/license`, {
        license: "orbital",
        reason: "curso concluído",
      });
      expect(res.statusCode).toBe(200);
      const { data } = await pilot.c
        .from("profiles")
        .select("pilot_license")
        .eq("user_id", pilot.id)
        .single();
      expect(data?.pilot_license).toBe("orbital");
    });

    it("conta suspensa não reserva nem compra, mas volta ao ser reativada", async () => {
      const url = `/v1/admin/users/${other.id}/suspension`;
      expect((await post(admin, url, { suspended: true, reason: "fraude" })).statusCode).toBe(200);
      const blocked = await post(other, "/v1/rentals", {
        ...booking(),
        startSol: 5300,
        endSol: 5301,
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().message).toMatch(/suspensa/);
      expect((await post(admin, url, { suspended: false, reason: "resolvido" })).statusCode).toBe(
        200,
      );
      const ok = await post(other, "/v1/rentals", { ...booking(), startSol: 5300, endSol: 5301 });
      expect(ok.statusCode).toBe(201);
    });

    it("admin não suspende a si mesmo", async () => {
      const res = await post(admin, `/v1/admin/users/${admin.id}/suspension`, {
        suspended: true,
        reason: "teste",
      });
      expect(res.statusCode).toBe(422);
    });
  });

  it("o usuário não altera os próprios créditos direto no banco", async () => {
    const before = await credits(pilot);
    await pilot.c.from("profiles").update({ martian_credits: 999999 }).eq("user_id", pilot.id);
    expect(await credits(pilot)).toBe(before);
  });
});
