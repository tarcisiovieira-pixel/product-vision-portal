// Testa as migrations num Postgres embutido (PGlite), sem Docker nem Supabase.
// Uso:  npm i --no-save @electric-sql/pglite
//       node supabase/tests/security-hardening.mjs 99999999 tests      # todas as migrations + cenários
//       node supabase/tests/security-hardening.mjs 20261103090000_zz tests  # sem o hardening (mostra as brechas)
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const upTo = process.argv[2]; // opcional: aplicar só até certo prefixo (para comparar antes/depois)

const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`);

let applied = 0;
for (const f of files) {
  if (upTo && f > upTo) break;
  try {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    console.log("OK   ", f);
    applied++;
  } catch (e) {
    console.log("FAIL ", f, "->", e.message);
    process.exit(1);
  }
}
if (process.argv[3] !== "tests") process.exit(0);

// ---------- cenários ----------
const U = { a: "00000000-0000-0000-0000-00000000000a", b: "00000000-0000-0000-0000-00000000000b" };
await db.exec(
  `insert into auth.users (id, email) values ('${U.a}','a@x.com'),('${U.b}','b@x.com') on conflict do nothing;`,
);
const veh = (await db.query("select id from public.vehicles limit 1")).rows[0].id;
const hg = (await db.query("select id from public.hangars limit 2")).rows.map((r) => r.id);
await db.exec(`insert into public.rentals (user_id, vehicle_id, pickup_hangar_id, dropoff_hangar_id, start_sol, end_sol, total_credits)
  values ('${U.a}','${veh}','${hg[0]}','${hg[1]}',1,3,100)`);

await db.exec(
  `insert into public.flight_routes (vehicle_id, origin_hangar_id, destination_hangar_id) values ('${veh}','${hg[0]}','${hg[1]}')`,
);
const as = async (role, uid, sql) => {
  try {
    await db.exec(
      `set role ${role}; select set_config('request.jwt.claim.sub','${uid ?? ""}', false);`,
    );
    const r = await db.query(sql);
    return { ok: true, rows: r.rows.length };
  } catch (e) {
    return { ok: false, err: e.message.slice(0, 80) };
  } finally {
    await db.exec("reset role;");
  }
};

const tel = (v, lat = 10) => `select public.record_flight_telemetry('${v}', ${lat}, 20, 1, 100)`;
const cases = [
  [
    "anon NÃO lê flight_telemetry_logs",
    () => as("anon", null, "select * from public.flight_telemetry_logs"),
    false,
  ],
  [
    "anon NÃO lê flight_routes",
    () => as("anon", null, "select * from public.flight_routes"),
    false,
  ],
  ["anon NÃO executa record_flight_telemetry", () => as("anon", null, tel(veh)), false],
  ["auth SEM reserva NÃO registra telemetria", () => as("authenticated", U.b, tel(veh)), false],
  ["auth COM reserva registra telemetria", () => as("authenticated", U.a, tel(veh)), true],
  ["lat inválida é rejeitada", () => as("authenticated", U.a, tel(veh, 123)), false],
  [
    "auth NÃO insere telemetria direto",
    () =>
      as(
        "authenticated",
        U.a,
        `insert into public.flight_telemetry_logs (vehicle_id, lat, lng, altitude_km, speed_kmh) values ('${veh}',1,1,1,1)`,
      ),
    false,
  ],
  [
    "auth NÃO insere flight_routes",
    () =>
      as(
        "authenticated",
        U.a,
        `insert into public.flight_routes (vehicle_id, origin_hangar_id, destination_hangar_id) values ('${veh}','${hg[0]}','${hg[1]}')`,
      ),
    false,
  ],
  [
    "auth NÃO atualiza flight_routes",
    () => as("authenticated", U.a, `update public.flight_routes set max_mach = 99 where true`),
    false,
  ],
  [
    "auth NÃO insere maintenance_logs direto",
    () =>
      as(
        "authenticated",
        U.a,
        `insert into public.maintenance_logs (vehicle_id, service_type) values ('${veh}','x')`,
      ),
    false,
  ],
  [
    "auth ainda LÊ maintenance_logs",
    () => as("authenticated", U.a, "select * from public.maintenance_logs"),
    true,
  ],
  [
    "auth ainda LÊ flight_routes",
    () => as("authenticated", U.a, "select * from public.flight_routes"),
    true,
  ],
  [
    "chamada de 5 args não contorna a licença do piloto",
    () =>
      as(
        "authenticated",
        U.a,
        `select public.book_vehicle('${veh}'::uuid,'${hg[0]}'::uuid,'${hg[1]}'::uuid,1,2)`,
      ),
    false,
  ],
  [
    "anon NÃO executa buy_marketplace_vehicle",
    () => as("anon", null, `select public.buy_marketplace_vehicle(gen_random_uuid())`),
    false,
  ],
];
let bad = 0;
for (const [name, fn, expectOk] of cases) {
  const r = await fn();
  const pass = r.ok === expectOk;
  if (!pass) bad++;
  console.log(pass ? "PASS" : "FAIL", name, r.ok ? "(permitido)" : `(bloqueado: ${r.err})`);
}
console.log(bad ? `\n${bad} cenário(s) falharam` : "\nTodos os cenários passaram");
process.exit(bad ? 2 : 0);
