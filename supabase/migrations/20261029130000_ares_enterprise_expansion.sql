-- =====================================================================
-- ARES MOBILITY: EXPANSÃO ENTERPRISE DE DADOS E TELEMETRIA DE MARTE
-- =====================================================================

-- 1. Expansão na tabela de Perfis de Colonos
alter table public.profiles
  add column if not exists safety_reputation_score numeric not null default 100.0,
  add column if not exists flight_hours numeric not null default 0.0;

-- 2. Expansão na tabela de Hangares (Adicionando status operacional)
alter table public.hangars
  add column if not exists status text not null default 'operational';

-- 3. Inserção do Hangar Estação Fobos (Orbital Hub) se não existir
insert into public.hangars (name, code, sector, lat, lng, elevation_km, storm_alert, status)
values ('Phobos Orbital Station', 'PHO-00', 'Phobos Orbit', 0.0, 0.0, 6000.0, false, 'operational')
on conflict (code) do update set
  elevation_km = 6000.0,
  status = 'operational';

-- 4. Expansão na tabela de Veículos: Telemetria Avançada
alter table public.vehicles
  add column if not exists cabin_pressure_kpa numeric not null default 101.3,
  add column if not exists thruster_integrity int not null default 100,
  add column if not exists speed_kmh numeric not null default 0.0,
  add column if not exists heat_shield_pct int not null default 100;

-- 5. Expansão na tabela de Eventos Climáticos: Radiação Solar / Tempestades
alter table public.weather_events
  add column if not exists radiation_msv numeric not null default 0.15;

-- 6. Expansão na tabela de Locações (Rentals): Adicionais Espaciais, Chave Quântica e Checklists
alter table public.rentals
  add column if not exists silica_insurance boolean not null default false,
  add column if not exists extra_o2_tank boolean not null default false,
  add column if not exists neural_autopilot_l5 boolean not null default false,
  add column if not exists extra_eva_suits int not null default 0,
  add column if not exists preflight_checked boolean not null default false,
  add column if not exists postflight_checked boolean not null default false,
  add column if not exists quantum_key text not null default ('Q-KEY#' || substr(md5(random()::text), 1, 12));

-- 7. Nova Tabela de Manutenção: maintenance_logs
create table if not exists public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  service_type text not null, -- 'silica_clean', 'cryo_recharge', 'heat_shield_repair', 'o2_refill', 'thruster_calibration'
  status text not null default 'completed',
  credits_cost numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.maintenance_logs to authenticated;
grant all on public.maintenance_logs to service_role;
alter table public.maintenance_logs enable row level security;

create policy "maintenance readable to all authenticated" on public.maintenance_logs
  for select to authenticated using (true);

create policy "maintenance insertable to authenticated" on public.maintenance_logs
  for insert to authenticated with check (true);

-- 8. Atualização da função RPC book_vehicle com validação de licença de piloto e adicionais
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
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if _end_sol <= _start_sol then
    raise exception 'Período inválido: o sol final deve ser maior que o inicial';
  end if;

  sols := _end_sol - _start_sol;

  -- Seleciona veículo para locação
  select * into v from public.vehicles where id = _vehicle_id for update;
  if v.id is null then
    raise exception 'Veículo não encontrado';
  end if;

  if v.status <> 'available' then
    raise exception 'Veículo indisponível no momento (%s)', v.status;
  end if;

  -- Seleciona perfil do usuário
  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then
    raise exception 'Perfil do colono não encontrado';
  end if;

  -- VALIDAÇÃO RESTRITA DE LICENÇA DE PILOTO
  if v.category = 'interplanetary_rocket' and p.pilot_license <> 'orbital' then
    raise exception 'Habilitação insuficiente! Foguetes Interplanetários exigem licença Orbital.';
  end if;

  if v.category = 'space_truck' and p.pilot_license not in ('heavy_cargo', 'orbital') then
    raise exception 'Habilitação insuficiente! Caminhões Espaciais exigem licença de Carga Pesada ou Orbital.';
  end if;

  -- CÁLCULO DE DIÁRIAS E ADICIONAIS ESPACIAIS
  base_cost := v.daily_rate_sol * sols;

  if _silica_insurance then
    extras_cost := extras_cost + (120 * sols);
  end if;
  if _extra_o2_tank then
    extras_cost := extras_cost + (180 * sols);
  end if;
  if _neural_autopilot_l5 then
    extras_cost := extras_cost + (350 * sols);
  end if;
  if _extra_eva_suits > 0 then
    extras_cost := extras_cost + (100 * _extra_eva_suits * sols);
  end if;

  total_cost := base_cost + extras_cost;

  if p.martian_credits < total_cost then
    raise exception 'Saldo insuficiente em Créditos Marcianos! Custo total: MC$ %, Saldo atual: MC$ %',
      total_cost, p.martian_credits;
  end if;

  -- Desconto de créditos seguro
  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles
    set martian_credits = martian_credits - total_cost
    where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  -- Gera chave quântica única
  qkey := 'Q-KEY#' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- Registra a locação
  insert into public.rentals (
    user_id,
    vehicle_id,
    pickup_hangar_id,
    dropoff_hangar_id,
    start_sol,
    end_sol,
    total_credits,
    silica_insurance,
    extra_o2_tank,
    neural_autopilot_l5,
    extra_eva_suits,
    quantum_key,
    status
  ) values (
    auth.uid(),
    _vehicle_id,
    _pickup,
    _dropoff,
    _start_sol,
    _end_sol,
    total_cost,
    _silica_insurance,
    _extra_o2_tank,
    _neural_autopilot_l5,
    _extra_eva_suits,
    qkey,
    'confirmed'
  ) returning id into rid;

  return rid;
end; $$;

grant execute on function public.book_vehicle(uuid,uuid,uuid,int,int,boolean,boolean,boolean,int) to authenticated;

-- 9. Função RPC para Manutenção e Reparo Remoto
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
