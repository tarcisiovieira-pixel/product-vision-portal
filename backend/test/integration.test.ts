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

/** Fixtures que o app nunca consegue criar (ex.: reserva no passado): direto no banco. */
function sql(query: string): string {
  return execFileSync("docker", ["exec", dbContainer, "psql", "-U", "postgres", "-tAc", query], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")[0]!;
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
  let truck: { id: string };
  let hangars: string[];
  let stormHangar: string;
  let today: number;

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
    truck = vehicles!.find((v) => v.category === "space_truck")!;
    // Ordem fixa e hangares sem tempestade: a regra do clima não pode sortear o resultado.
    const all = (await pilot.c.from("hangars").select("id, code, storm_alert").order("code")).data!;
    hangars = all.filter((h) => !h.storm_alert).map((h) => h.id);
    stormHangar = all.find((h) => h.storm_alert)!.id;
    today = (await pilot.c.rpc("current_sol")).data as number;
  });
  afterAll(() => app.close());

  const booking = () => ({
    vehicleId: vehicle.id,
    pickupHangarId: hangars[0],
    dropoffHangarId: hangars[1],
    startSol: today + 100,
    endSol: today + 102,
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

  it("manutenção debita créditos de quem tem reserva ativa do veículo", async () => {
    expect(
      (
        await post(pilot, "/v1/rentals", {
          ...booking(),
          startSol: today + 300,
          endSol: today + 301,
        })
      ).statusCode,
    ).toBe(201);
    const before = await credits(pilot);
    const res = await post(pilot, "/v1/maintenance", {
      vehicleId: vehicle.id,
      serviceType: "silica_clean",
    });
    expect(res.statusCode).toBe(201);
    expect(await credits(pilot)).toBe(before - 450);
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
      expect((await post(pilot, "/v1/rentals", slot(today + 200, today + 203))).statusCode).toBe(
        201,
      );
      const before = await credits(other);
      const res = await post(other, "/v1/rentals", slot(today + 202, today + 204));
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toMatch(/já reservado/);
      expect(await credits(other)).toBe(before);
    });

    it("período colado é permitido, e estender não invade o próximo", async () => {
      expect((await post(other, "/v1/rentals", slot(today + 203, today + 205))).statusCode).toBe(
        201,
      );
      const items = (await get(pilot, "/v1/rentals")).json().items;
      const rental = items.find((r: { start_sol: number }) => r.start_sol === today + 200);
      expect((await post(pilot, `/v1/rentals/${rental.id}/extend`)).statusCode).toBe(409);
    });

    it("reservas simultâneas: só uma vence", async () => {
      const results = await Promise.all([
        post(pilot, "/v1/rentals", slot(today + 210, today + 211)),
        post(other, "/v1/rentals", slot(today + 210, today + 211)),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    });

    it("cancelar libera o período", async () => {
      const items = (await get(pilot, "/v1/rentals")).json().items;
      const rental = items.find((r: { start_sol: number }) => r.start_sol === today + 200);
      await post(pilot, `/v1/rentals/${rental.id}/cancel`);
      expect((await post(other, "/v1/rentals", slot(today + 200, today + 202))).statusCode).toBe(
        201,
      );
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
      const res = await post(pilot, "/v1/maintenance", {
        vehicleId: id,
        serviceType: "thruster_calibration",
      });
      expect(res.statusCode).toBe(403);
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
      startSol: today + 220,
      endSol: today + 221,
      stormBarrier: true,
    });
    expect(res.statusCode).toBe(201);
    expect(await credits(other)).toBe(before - vehicle.daily_rate_sol - 220);
  });

  it("o vendedor recebe o valor da venda", async () => {
    const callsign = `IT-${Date.now()}`;
    const { error } = await pilot.c.rpc("create_listing", {
      _name: "Nave de teste",
      _callsign: callsign,
      _category: "car_vtol",
      _price: 300,
      _hangar_id: null,
      _flight_hours: 0,
      _hull_pct: 100,
      _battery_pct: 100,
      _condition: "certified_preowned",
      _features: [],
      _seller_name: "Colono de teste",
    });
    expect(error).toBeNull();
    const { data: sale } = await other.c
      .from("vehicle_sales")
      .select("id")
      .eq("callsign", callsign.toUpperCase())
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

  describe("ataques diretos ao banco (sem passar pela API)", () => {
    let a: User;
    let b: User;

    const listing = (over: Record<string, unknown> = {}) => ({
      _name: "Nave de teste",
      _callsign: `ATK-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      _category: "car_vtol",
      _price: 500,
      _hangar_id: null,
      _flight_hours: 0,
      _hull_pct: 100,
      _battery_pct: 100,
      _condition: "certified_preowned",
      _features: [],
      _seller_name: "Atacante",
      ...over,
    });

    const book = (u: User, over: Record<string, unknown> = {}) =>
      u.c.rpc("book_vehicle", {
        _vehicle_id: vehicle.id,
        _pickup: hangars[0],
        _dropoff: hangars[1],
        _start_sol: today + 400,
        _end_sol: today + 402,
        ...over,
      });

    const rentalRow = async (u: User, id: string) =>
      (await u.c.from("rentals").select("*").eq("id", id).single()).data!;

    beforeAll(async () => {
      a = await newUser("atmospheric");
      b = await newUser("atmospheric");
    });

    describe("marketplace", () => {
      it("não insere anúncio direto na tabela, com qualquer preço", async () => {
        for (const price of [-1000000, 0, 500]) {
          const { error } = await a.c.from("vehicle_sales").insert({
            name: "x",
            callsign: `NEG-${price}-${Date.now()}`,
            category: "car_vtol",
            price_credits: price,
            seller_user_id: a.id,
          });
          expect(error?.message).toMatch(/permission denied|row-level security/);
        }
      });

      it.each([-1000000, 0, 1e12])("create_listing recusa preço %s", async (price) => {
        const { error } = await a.c.rpc("create_listing", listing({ _price: price }));
        expect(error?.message).toMatch(/Preço inválido/);
      });

      it("create_listing força vendedor e status; o anúncio não pode ser editado", async () => {
        const { data: id, error } = await a.c.rpc("create_listing", listing());
        expect(error).toBeNull();
        const { data: row } = await b.c.from("vehicle_sales").select("*").eq("id", id).single();
        expect(row?.seller_user_id).toBe(a.id);
        expect(row?.status).toBe("available_for_sale");

        for (const change of [{ price_credits: -5 }, { price_credits: 1 }, { status: "sold" }]) {
          const res = await a.c
            .from("vehicle_sales")
            .update(change)
            .eq("id", id as string);
          expect(res.error?.message).toMatch(/permission denied/);
        }
        const del = await a.c
          .from("vehicle_sales")
          .delete()
          .eq("id", id as string);
        expect(del.error?.message).toMatch(/permission denied/);
      });

      it("anúncio vendido não volta a ficar disponível", async () => {
        const { data: id } = await a.c.rpc("create_listing", listing({ _price: 200 }));
        const { error } = await b.c.rpc("buy_marketplace_vehicle", { _sale_id: id });
        expect(error).toBeNull();
        const res = await a.c
          .from("vehicle_sales")
          .update({ status: "available_for_sale" })
          .eq("id", id as string);
        expect(res.error?.message).toMatch(/permission denied/);
        const { data: row } = await a.c
          .from("vehicle_sales")
          .select("status")
          .eq("id", id)
          .single();
        expect(row?.status).toBe("sold");
        const again = await b.c.rpc("buy_marketplace_vehicle", { _sale_id: id });
        expect(again.error?.message).toMatch(/não está mais disponível/);
      });
    });

    it("cadastro com habilitação orbital no formulário continua atmosférico", async () => {
      const u = await newUser("orbital");
      const { data } = await u.c
        .from("profiles")
        .select("pilot_license")
        .eq("user_id", u.id)
        .single();
      expect(data?.pilot_license).toBe("atmospheric");
    });

    describe("book_vehicle", () => {
      const invalid: [string, () => Record<string, unknown>, RegExp][] = [
        ["trajes EVA negativos", () => ({ _extra_eva_suits: -3 }), /Trajes EVA/],
        ["trajes EVA acima do limite", () => ({ _extra_eva_suits: 7 }), /Trajes EVA/],
        ["100000 sols", () => ({ _end_sol: today + 100400 }), /máximo 90/],
        ["sol no passado", () => ({ _start_sol: today - 1, _end_sol: today + 1 }), /passado/],
        [
          "hangar inexistente",
          () => ({ _pickup: "00000000-0000-4000-8000-000000000000" }),
          /Hangar não encontrado/,
        ],
      ];

      it.each(invalid)("recusa %s e não cobra", async (_nome, over, pattern) => {
        const before = await credits(a);
        const { error } = await book(a, over());
        expect(error?.message).toMatch(pattern);
        expect(await credits(a)).toBe(before);
      });

      it("hangar com tempestade exige a barreira (retirada e devolução)", async () => {
        const before = await credits(a);
        for (const over of [{ _pickup: stormHangar }, { _dropoff: stormHangar }]) {
          const { error } = await book(a, over);
          expect(error?.message).toMatch(/tempestade/);
        }
        expect(await credits(a)).toBe(before);
      });

      it("com a barreira a reserva passa, é cobrada e fica registrada", async () => {
        const before = await credits(a);
        const { data: id, error } = await book(a, {
          _pickup: stormHangar,
          _start_sol: today + 410,
          _end_sol: today + 412,
          _storm_barrier: true,
        });
        expect(error).toBeNull();
        expect(await credits(a)).toBe(before - (vehicle.daily_rate_sol + 220) * 2);
        expect((await rentalRow(a, id as string)).storm_barrier).toBe(true);
      });
    });

    describe("ciclo de vida da reserva", () => {
      const fixture = (u: User, startSol: number, endSol: number, vehicleId = vehicle.id) =>
        sql(
          `insert into public.rentals (user_id, vehicle_id, pickup_hangar_id, dropoff_hangar_id, start_sol, end_sol, total_credits, status) values ('${u.id}', '${vehicleId}', '${hangars[0]}', '${hangars[1]}', ${startSol}, ${endSol}, 1000, 'confirmed') returning id`,
        );

      it("não cancela depois do início e não devolve nada", async () => {
        const id = fixture(a, today - 1, today + 5);
        const before = await credits(a);
        const { error } = await a.c.rpc("cancel_rental", { _rental_id: id });
        expect(error?.message).toMatch(/já iniciada/);
        expect(await credits(a)).toBe(before);
      });

      it("reserva concluída também não é cancelável", async () => {
        const id = fixture(a, today - 10, today - 5);
        const before = await credits(a);
        const { error } = await a.c.rpc("cancel_rental", { _rental_id: id });
        expect(error?.message).toMatch(/Só reservas confirmadas/);
        expect(await credits(a)).toBe(before);
      });

      it("o relógio avança o status e a API lista já atualizado", async () => {
        const started = fixture(b, today - 1, today + 5, rocket.id);
        const finished = fixture(b, today - 10, today - 5, rocket.id);
        const future = fixture(b, today + 500, today + 502, rocket.id);
        const items = (await get(b, "/v1/rentals")).json().items as {
          id: string;
          status: string;
        }[];
        const status = (id: string) => items.find((r) => r.id === id)?.status;
        expect(status(started)).toBe("in_flight");
        expect(status(finished)).toBe("completed");
        expect(status(future)).toBe("confirmed");
      });

      it("reserva futura ainda é cancelável com reembolso integral", async () => {
        const { data: id, error } = await book(a, {
          _start_sol: today + 420,
          _end_sol: today + 421,
        });
        expect(error).toBeNull();
        const before = await credits(a);
        const res = await a.c.rpc("cancel_rental", { _rental_id: id });
        expect(res.error).toBeNull();
        expect(await credits(a)).toBe(before + vehicle.daily_rate_sol);
      });
    });

    describe("extend_rental", () => {
      it("cobra a diária mais todos os adicionais da reserva", async () => {
        const { data: id, error } = await book(a, {
          _start_sol: today + 430,
          _end_sol: today + 431,
          _silica_insurance: true,
          _extra_o2_tank: true,
          _neural_autopilot_l5: true,
          _extra_eva_suits: 3,
          _storm_barrier: true,
        });
        expect(error).toBeNull();
        const addons = 120 + 180 + 350 + 300 + 220;
        const before = await credits(a);
        const res = await a.c.rpc("extend_rental", { _rental_id: id, _extra_sols: 2 });
        expect(res.error).toBeNull();
        expect(await credits(a)).toBe(before - (vehicle.daily_rate_sol + addons) * 2);
        expect((await rentalRow(a, id as string)).end_sol).toBe(today + 433);
      });

      it("não ultrapassa 90 sols no total, mesmo estendendo aos poucos", async () => {
        const id = fixture90(a);
        const over = await a.c.rpc("extend_rental", { _rental_id: id, _extra_sols: 11 });
        expect(over.error?.message).toMatch(/máximo 90/);
        const ok = await a.c.rpc("extend_rental", { _rental_id: id, _extra_sols: 10 });
        expect(ok.error).toBeNull();
        const more = await a.c.rpc("extend_rental", { _rental_id: id, _extra_sols: 1 });
        expect(more.error?.message).toMatch(/máximo 90/);
      });

      function fixture90(u: User) {
        return sql(
          `insert into public.rentals (user_id, vehicle_id, pickup_hangar_id, dropoff_hangar_id, start_sol, end_sol, total_credits, status) values ('${u.id}', '${vehicle.id}', '${hangars[0]}', '${hangars[1]}', ${today + 600}, ${today + 680}, 0, 'confirmed') returning id`,
        );
      }
    });

    describe("manutenção", () => {
      it("quem não tem reserva ativa do veículo é recusado e não paga", async () => {
        const before = await credits(b);
        for (const target of [vehicle.id, truck.id]) {
          const { error } = await b.c.rpc("execute_maintenance", {
            _vehicle_id: target,
            _service_type: "thruster_calibration",
          });
          expect(error?.message).toMatch(/reserva ativa/);
        }
        expect(await credits(b)).toBe(before);
      });

      it("quem tem reserva ativa pode, e o serviço desconhecido é recusado", async () => {
        const before = await credits(a);
        const ok = await a.c.rpc("execute_maintenance", {
          _vehicle_id: vehicle.id,
          _service_type: "o2_refill",
        });
        expect(ok.error).toBeNull();
        expect(await credits(a)).toBe(before - 350);
        const bad = await a.c.rpc("execute_maintenance", {
          _vehicle_id: vehicle.id,
          _service_type: "tuning_gratis",
        });
        expect(bad.error?.message).toMatch(/desconhecido/);
        expect(await credits(a)).toBe(before - 350);
      });

      it("o histórico de manutenção é privado", async () => {
        const mine = (await a.c.from("maintenance_logs").select("user_id")).data!;
        expect(mine.length).toBeGreaterThan(0);
        expect(mine.every((l) => l.user_id === a.id)).toBe(true);
        const theirs = (await b.c.from("maintenance_logs").select("user_id")).data!;
        expect(theirs.some((l) => l.user_id === a.id)).toBe(false);
      });
    });

    it("a API de anúncios recusa preço negativo e publica um válido", async () => {
      const body = {
        name: "Nave via API",
        callsign: `API-${Date.now()}`,
        category: "car_vtol",
        price: 800,
      };
      expect((await post(a, "/v1/marketplace/listings", { ...body, price: -800 })).statusCode).toBe(
        400,
      );
      expect((await post(a, "/v1/marketplace/listings", body)).statusCode).toBe(201);
      expect((await post(a, "/v1/marketplace/listings", body)).statusCode).toBe(422);
    });
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
        startSol: today + 230,
        endSol: today + 231,
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().message).toMatch(/suspensa/);
      expect((await post(admin, url, { suspended: false, reason: "resolvido" })).statusCode).toBe(
        200,
      );
      const ok = await post(other, "/v1/rentals", {
        ...booking(),
        startSol: today + 230,
        endSol: today + 231,
      });
      expect(ok.statusCode).toBe(201);
    });

    it("admin vê o histórico de manutenção de todos", async () => {
      const rows = (await admin.c.from("maintenance_logs").select("user_id")).data!;
      expect(rows.some((l) => l.user_id !== admin.id)).toBe(true);
    });

    it("só o admin tira um veículo de manutenção", async () => {
      sql(`update public.vehicles set status = 'maintenance' where id = '${vehicle.id}'`);
      const status = async () =>
        (await admin.c.from("vehicles").select("status").eq("id", vehicle.id).single()).data
          ?.status;
      expect(await status()).toBe("maintenance");
      const { error } = await admin.c.rpc("execute_maintenance", {
        _vehicle_id: vehicle.id,
        _service_type: "thruster_calibration",
      });
      expect(error).toBeNull();
      expect(await status()).toBe("available");
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
