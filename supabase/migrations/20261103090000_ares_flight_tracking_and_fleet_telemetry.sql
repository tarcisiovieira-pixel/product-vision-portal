-- =====================================================================
-- ARES MOBILITY: RASTREAMENTO 3D DE VOO, TELEMETRIA ORBITAL E COMPRA/VENDA
-- Migration: 20261103090000_ares_flight_tracking_and_fleet_telemetry.sql
-- =====================================================================

-- 0. Garantir tipos e tabelas de Marketplace (Caso executado isoladamente)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'sale_condition') then
    create type public.sale_condition as enum ('certified_preowned', 'refurbished', 'factory_new');
  end if;
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum ('available_for_sale', 'reserved', 'sold');
  end if;
end $$;

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
    create policy "buyers can view own title deeds" on public.vehicle_purchases
      for select to authenticated using (auth.uid() = buyer_user_id);
  end if;
end $$;

-- 1. Tabela de Rotas de Voo Planejadas e em Andamento (flight_routes)
create table if not exists public.flight_routes (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid references public.rentals(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  origin_hangar_id uuid not null references public.hangars(id) on delete cascade,
  destination_hangar_id uuid not null references public.hangars(id) on delete cascade,
  status text not null default 'in_flight', -- 'planned', 'in_flight', 'docked', 'diverted'
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

-- 2. Tabela de Logs de Telemetria de Voo em Tempo Real (flight_telemetry_logs)
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

create index if not exists idx_flight_telemetry_vehicle_time
  on public.flight_telemetry_logs (vehicle_id, recorded_at desc);

create index if not exists idx_flight_telemetry_route
  on public.flight_telemetry_logs (route_id);

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

-- 3. Função RPC: Registrar Ping de Telemetria e Atualizar Veículo
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
  -- Insere no histórico de telemetria
  insert into public.flight_telemetry_logs (
    vehicle_id, route_id, lat, lng, altitude_km, speed_kmh, mach_number,
    battery_pct, o2_hours, dust_filter_pct
  ) values (
    _vehicle_id, _route_id, _lat, _lng, _altitude_km, _speed_kmh, _mach,
    _battery_pct, _o2_hours, _dust_filter_pct
  ) returning id into log_id;

  -- Atualiza o estado atual do veículo
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
end;
$$;

grant execute on function public.record_flight_telemetry to authenticated;
grant execute on function public.record_flight_telemetry to anon;

-- 4. Função RPC: Compra Definitiva de Veículo no Marketplace com Validação de Saldo
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
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  -- Localiza e trava o anúncio de venda
  select * into s from public.vehicle_sales where id = _sale_id for update;
  if s.id is null then
    raise exception 'Veículo para venda não encontrado';
  end if;

  if s.status != 'available_for_sale' then
    raise exception 'Este veículo não está mais disponível para aquisição';
  end if;

  -- Localiza e trava o perfil do comprador
  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then
    raise exception 'Perfil do piloto não localizado';
  end if;

  if p.martian_credits < s.price_credits then
    raise exception 'Saldo insuficiente: necessário MC$ %, saldo atual MC$ %',
      s.price_credits, p.martian_credits;
  end if;

  -- Deduz créditos do colono
  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles
  set martian_credits = martian_credits - s.price_credits,
      updated_at = now()
  where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  -- Gera chave mestre criptográfica do título de posse
  master_key := 'ARES-TITLE#' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 14));

  -- Cria registro do título de propriedade
  insert into public.vehicle_purchases (
    sale_id,
    buyer_user_id,
    price_paid_credits,
    quantum_master_key
  ) values (
    s.id,
    auth.uid(),
    s.price_credits,
    master_key
  ) returning id into purchase_id;

  -- Atualiza o status do anúncio para vendido
  update public.vehicle_sales
  set status = 'sold',
      updated_at = now()
  where id = s.id;

  return purchase_id;
end;
$$;

grant execute on function public.buy_marketplace_vehicle to authenticated;
