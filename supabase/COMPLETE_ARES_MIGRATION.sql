-- =====================================================================
-- ARES MOBILITY: MASTER CONSOLIDATED MIGRATION (100% IDEMPOTENTE)
-- Arquivo: supabase/COMPLETE_ARES_MIGRATION.sql
-- =====================================================================

-- 1. TIPOS ENUM PERSONALIZADOS
do $$ begin
  if not exists (select 1 from pg_type where typname = 'pilot_license') then
    create type public.pilot_license as enum ('atmospheric', 'heavy_cargo', 'orbital');
  end if;
  if not exists (select 1 from pg_type where typname = 'vehicle_category') then
    create type public.vehicle_category as enum ('car_vtol', 'space_truck', 'interplanetary_rocket');
  end if;
  if not exists (select 1 from pg_type where typname = 'vehicle_status') then
    create type public.vehicle_status as enum ('available', 'in_flight', 'maintenance', 'storm_hold');
  end if;
  if not exists (select 1 from pg_type where typname = 'sale_condition') then
    create type public.sale_condition as enum ('certified_preowned', 'refurbished', 'factory_new');
  end if;
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum ('available_for_sale', 'reserved', 'sold');
  end if;
end $$;

-- 2. EXPANSÃO DE COLUNAS EM TABELAS EXISTENTES
alter table if exists public.profiles
  add column if not exists safety_reputation_score numeric not null default 100.0,
  add column if not exists flight_hours numeric not null default 0.0;

alter table if exists public.hangars
  add column if not exists status text not null default 'operational';

alter table if exists public.vehicles
  add column if not exists cabin_pressure_kpa numeric not null default 101.3,
  add column if not exists thruster_integrity int not null default 100,
  add column if not exists speed_kmh numeric not null default 0.0,
  add column if not exists heat_shield_pct int not null default 100;

alter table if exists public.weather_events
  add column if not exists radiation_msv numeric not null default 0.15;

alter table if exists public.rentals
  add column if not exists silica_insurance boolean not null default false,
  add column if not exists extra_o2_tank boolean not null default false,
  add column if not exists neural_autopilot_l5 boolean not null default false,
  add column if not exists extra_eva_suits int not null default 0,
  add column if not exists preflight_checked boolean not null default false,
  add column if not exists postflight_checked boolean not null default false,
  add column if not exists quantum_key text not null default ('Q-KEY#' || substr(md5(random()::text), 1, 12));

-- 3. TABELA DE LOGS DE MANUTENÇÃO (maintenance_logs)
create table if not exists public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  service_type text not null,
  status text not null default 'completed',
  credits_cost numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.maintenance_logs to authenticated;
grant all on public.maintenance_logs to service_role;
alter table public.maintenance_logs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'maintenance_logs' and policyname = 'maintenance readable to all authenticated') then
    create policy "maintenance readable to all authenticated" on public.maintenance_logs for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'maintenance_logs' and policyname = 'maintenance insertable to authenticated') then
    create policy "maintenance insertable to authenticated" on public.maintenance_logs for insert to authenticated with check (true);
  end if;
end $$;

-- 4. TABELAS DE MARKETPLACE (vehicle_sales & vehicle_purchases)
create table if not exists public.vehicle_sales (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  callsign text not null unique,
  category public.vehicle_category not null,
  price_credits numeric not null,
  sol_manufactured int not null default 4200,
  flight_hours numeric not null default 0,
  hull_integrity_pct int not null default 100,
  battery_condition_pct int not null default 100,
  condition public.sale_condition not null default 'certified_preowned',
  hangar_id uuid references public.hangars(id) on delete set null,
  seller_name text not null default 'ARES Seminovos Oficiais',
  seller_user_id uuid references auth.users(id) on delete set null,
  warranty_sols int not null default 300,
  features text[] not null default '{}',
  status public.sale_status not null default 'available_for_sale',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.vehicle_sales to authenticated;
grant select on public.vehicle_sales to anon;
grant all on public.vehicle_sales to service_role;
alter table public.vehicle_sales enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'vehicle_sales' and policyname = 'vehicle sales readable') then
    create policy "vehicle sales readable" on public.vehicle_sales for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'vehicle_sales' and policyname = 'sellers can manage own listings') then
    create policy "sellers can manage own listings" on public.vehicle_sales for all to authenticated using (auth.uid() = seller_user_id) with check (auth.uid() = seller_user_id);
  end if;
end $$;

create table if not exists public.vehicle_purchases (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.vehicle_sales(id),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  price_paid_credits numeric not null,
  quantum_master_key text not null,
  created_at timestamptz not null default now()
);

grant select, insert on public.vehicle_purchases to authenticated;
grant all on public.vehicle_purchases to service_role;
alter table public.vehicle_purchases enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'vehicle_purchases' and policyname = 'buyers can view own title deeds') then
    create policy "buyers can view own title deeds" on public.vehicle_purchases for select to authenticated using (auth.uid() = buyer_user_id);
  end if;
end $$;

-- 5. TABELAS DE RASTREAMENTO DE VOO E TELEMETRIA
create table if not exists public.flight_routes (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid references public.rentals(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  origin_hangar_id uuid not null references public.hangars(id) on delete cascade,
  destination_hangar_id uuid not null references public.hangars(id) on delete cascade,
  status text not null default 'in_flight',
  current_progress_pct numeric not null default 0.0,
  estimated_duration_sols numeric not null default 0.25,
  altitude_cruise_km numeric not null default 2.5,
  max_mach numeric not null default 1.8,
  waypoints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.flight_routes to authenticated;
grant select on public.flight_routes to anon;
grant all on public.flight_routes to service_role;
alter table public.flight_routes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'flight_routes' and policyname = 'flight routes readable to all') then
    create policy "flight routes readable to all" on public.flight_routes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'flight_routes' and policyname = 'flight routes insertable by authenticated') then
    create policy "flight routes insertable by authenticated" on public.flight_routes for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'flight_routes' and policyname = 'flight routes updatable by authenticated') then
    create policy "flight routes updatable by authenticated" on public.flight_routes for update to authenticated using (true);
  end if;
end $$;

create table if not exists public.flight_telemetry_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  route_id uuid references public.flight_routes(id) on delete set null,
  lat numeric not null,
  lng numeric not null,
  altitude_km numeric not null,
  speed_kmh numeric not null,
  mach_number numeric not null default 1.0,
  heading_deg numeric not null default 0,
  pitch_deg numeric not null default 0,
  roll_deg numeric not null default 0,
  battery_pct numeric not null default 100,
  o2_hours numeric not null default 40,
  dust_filter_pct numeric not null default 100,
  cabin_pressure_kpa numeric not null default 101.3,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_flight_telemetry_vehicle_time on public.flight_telemetry_logs (vehicle_id, recorded_at desc);
create index if not exists idx_flight_telemetry_route on public.flight_telemetry_logs (route_id);

grant select, insert on public.flight_telemetry_logs to authenticated;
grant select on public.flight_telemetry_logs to anon;
grant all on public.flight_telemetry_logs to service_role;
alter table public.flight_telemetry_logs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'flight_telemetry_logs' and policyname = 'flight telemetry readable to all') then
    create policy "flight telemetry readable to all" on public.flight_telemetry_logs for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'flight_telemetry_logs' and policyname = 'flight telemetry insertable by authenticated') then
    create policy "flight telemetry insertable by authenticated" on public.flight_telemetry_logs for insert to authenticated with check (true);
  end if;
end $$;

-- 6. FUNÇÃO RPC: book_vehicle COM VALIDAÇÃO DE LICENÇA E ADICIONAIS
create or replace function public.book_vehicle(
  _vehicle_id uuid,
  _pickup uuid,
  _dropoff uuid,
  _start_sol int,
  _end_sol int,
  _silica_insurance boolean default false,
  _extra_o2_tank boolean default false,
  _neural_autopilot_l5 boolean default false,
  _extra_eva_suits int default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  p public.profiles;
  base_cost numeric;
  extras_cost numeric := 0;
  total_cost numeric;
  sols int;
  rid uuid;
  qkey text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if _end_sol <= _start_sol then raise exception 'Período inválido: o sol final deve ser maior que o inicial'; end if;

  sols := _end_sol - _start_sol;

  select * into v from public.vehicles where id = _vehicle_id for update;
  if v.id is null then raise exception 'Veículo não encontrado'; end if;
  if v.status <> 'available' then raise exception 'Veículo indisponível no momento (%s)', v.status; end if;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then raise exception 'Perfil do colono não encontrado'; end if;

  if v.category = 'interplanetary_rocket' and p.pilot_license <> 'orbital' then
    raise exception 'Habilitação insuficiente! Foguetes Interplanetários exigem licença Orbital.';
  end if;
  if v.category = 'space_truck' and p.pilot_license not in ('heavy_cargo', 'orbital') then
    raise exception 'Habilitação insuficiente! Caminhões Espaciais exigem licença de Carga Pesada ou Orbital.';
  end if;

  base_cost := v.daily_rate_sol * sols;
  if _silica_insurance then extras_cost := extras_cost + (120 * sols); end if;
  if _extra_o2_tank then extras_cost := extras_cost + (180 * sols); end if;
  if _neural_autopilot_l5 then extras_cost := extras_cost + (350 * sols); end if;
  if _extra_eva_suits > 0 then extras_cost := extras_cost + (100 * _extra_eva_suits * sols); end if;

  total_cost := base_cost + extras_cost;

  if p.martian_credits < total_cost then
    raise exception 'Saldo insuficiente em Créditos Marcianos! Custo total: MC$ %, Saldo atual: MC$ %', total_cost, p.martian_credits;
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles set martian_credits = martian_credits - total_cost where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  qkey := 'Q-KEY#' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into public.rentals (
    user_id, vehicle_id, pickup_hangar_id, dropoff_hangar_id,
    start_sol, end_sol, total_credits, silica_insurance,
    extra_o2_tank, neural_autopilot_l5, extra_eva_suits,
    quantum_key, status
  ) values (
    auth.uid(), _vehicle_id, _pickup, _dropoff,
    _start_sol, _end_sol, total_cost, _silica_insurance,
    _extra_o2_tank, _neural_autopilot_l5, _extra_eva_suits,
    qkey, 'confirmed'
  ) returning id into rid;

  return rid;
end; $$;

grant execute on function public.book_vehicle(uuid,uuid,uuid,int,int,boolean,boolean,boolean,int) to authenticated;

-- 7. FUNÇÃO RPC: execute_maintenance
create or replace function public.execute_maintenance(
  _vehicle_id uuid,
  _service_type text,
  _notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  p public.profiles;
  cost numeric := 500;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select * into v from public.vehicles where id = _vehicle_id for update;
  if v.id is null then raise exception 'Veículo não encontrado'; end if;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then raise exception 'Perfil não encontrado'; end if;

  case _service_type
    when 'silica_clean' then
      cost := 450;
      update public.vehicles set dust_filter_pct = 100, updated_at = now() where id = _vehicle_id;
    when 'cryo_recharge' then
      cost := 600;
      update public.vehicles set battery_pct = 100, updated_at = now() where id = _vehicle_id;
    when 'heat_shield_repair' then
      cost := 1200;
      update public.vehicles set heat_shield_pct = 100, updated_at = now() where id = _vehicle_id;
    when 'o2_refill' then
      cost := 350;
      update public.vehicles set o2_hours = case when category = 'interplanetary_rocket' then 900 when category = 'space_truck' then 120 else 40 end, updated_at = now() where id = _vehicle_id;
    when 'thruster_calibration' then
      cost := 800;
      update public.vehicles set thruster_integrity = 100, status = 'available', updated_at = now() where id = _vehicle_id;
    else
      cost := 500;
      update public.vehicles set status = 'available', updated_at = now() where id = _vehicle_id;
  end case;

  if p.martian_credits < cost then
    raise exception 'Créditos insuficientes para este serviço de manutenção. Necessário: MC$ %', cost;
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles set martian_credits = martian_credits - cost where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  insert into public.maintenance_logs (vehicle_id, user_id, service_type, credits_cost, notes, status)
  values (_vehicle_id, auth.uid(), _service_type, cost, _notes, 'completed');

  return jsonb_build_object('success', true, 'cost', cost, 'service', _service_type);
end; $$;

grant execute on function public.execute_maintenance(uuid,text,text) to authenticated;

-- 8. FUNÇÃO RPC: record_flight_telemetry (CORRIGIDO: Parâmetros com default no final)
create or replace function public.record_flight_telemetry(
  _vehicle_id uuid,
  _lat numeric,
  _lng numeric,
  _altitude_km numeric,
  _speed_kmh numeric,
  _route_id uuid default null,
  _mach numeric default 1.0,
  _battery_pct numeric default 100,
  _o2_hours numeric default 40,
  _dust_filter_pct numeric default 100
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  log_id uuid;
begin
  insert into public.flight_telemetry_logs (
    vehicle_id, route_id, lat, lng, altitude_km, speed_kmh, mach_number,
    battery_pct, o2_hours, dust_filter_pct
  ) values (
    _vehicle_id, _route_id, _lat, _lng, _altitude_km, _speed_kmh, _mach,
    _battery_pct, _o2_hours, _dust_filter_pct
  ) returning id into log_id;

  update public.vehicles
  set
    lat = _lat,
    lng = _lng,
    altitude_km = _altitude_km,
    speed_kmh = _speed_kmh,
    battery_pct = _battery_pct,
    o2_hours = _o2_hours,
    dust_filter_pct = _dust_filter_pct,
    updated_at = now()
  where id = _vehicle_id;

  return log_id;
end; $$;

grant execute on function public.record_flight_telemetry to authenticated;
grant execute on function public.record_flight_telemetry to anon;

-- 9. FUNÇÃO RPC: buy_marketplace_vehicle
create or replace function public.buy_marketplace_vehicle(
  _sale_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.vehicle_sales;
  p public.profiles;
  purchase_id uuid;
  master_key text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select * into s from public.vehicle_sales where id = _sale_id for update;
  if s.id is null then raise exception 'Veículo para venda não encontrado'; end if;
  if s.status != 'available_for_sale' then raise exception 'Este veículo não está mais disponível para aquisição'; end if;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then raise exception 'Perfil do piloto não localizado'; end if;

  if p.martian_credits < s.price_credits then
    raise exception 'Saldo insuficiente: necessário MC$ %, saldo atual MC$ %', s.price_credits, p.martian_credits;
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles set martian_credits = martian_credits - s.price_credits, updated_at = now() where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  master_key := 'ARES-TITLE#' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 14));

  insert into public.vehicle_purchases (sale_id, buyer_user_id, price_paid_credits, quantum_master_key)
  values (s.id, auth.uid(), s.price_credits, master_key)
  returning id into purchase_id;

  update public.vehicle_sales set status = 'sold', updated_at = now() where id = s.id;

  return purchase_id;
end; $$;

grant execute on function public.buy_marketplace_vehicle to authenticated;
