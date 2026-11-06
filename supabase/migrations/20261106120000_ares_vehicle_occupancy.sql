-- ============================================================================
-- ARES — Ocupação de veículos por período
-- Migration ADITIVA. Impede duas reservas ativas do mesmo veículo em sols
-- sobrepostos, inclusive em requisições simultâneas.
-- Não cancela nem altera reservas existentes: sobreposições antigas só ficam
-- marcadas em overlap_legacy, fora da trava, para decisão posterior.
-- ============================================================================

create extension if not exists btree_gist;

alter table public.rentals
  add column if not exists overlap_legacy boolean not null default false;

-- Mantém a reserva mais antiga de cada conflito dentro da trava.
update public.rentals newer
set overlap_legacy = true
where newer.status in ('confirmed', 'in_flight')
  and exists (
    select 1 from public.rentals older
    where older.vehicle_id = newer.vehicle_id
      and older.id <> newer.id
      and older.status in ('confirmed', 'in_flight')
      and (older.created_at, older.id) < (newer.created_at, newer.id)
      and int4range(older.start_sol, older.end_sol, '[)')
          && int4range(newer.start_sol, newer.end_sol, '[)')
  );

-- Sol final é exclusivo: uma reserva pode começar no sol em que a outra termina.
alter table public.rentals
  add constraint rentals_no_vehicle_overlap
  exclude using gist (
    vehicle_id with =,
    int4range(start_sol, end_sol, '[)') with &&
  )
  where (status in ('confirmed', 'in_flight') and not overlap_legacy);

-- Períodos ocupados, sem expor quem reservou. rentals é protegida por RLS.
create or replace function public.vehicle_occupancy()
returns table (vehicle_id uuid, start_sol int, end_sol int)
language sql stable security definer set search_path = public as $$
  select r.vehicle_id, r.start_sol, r.end_sol
  from public.rentals r
  where r.status in ('confirmed', 'in_flight');
$$;

revoke execute on function public.vehicle_occupancy() from public, anon;
grant execute on function public.vehicle_occupancy() to authenticated;

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

  select * into v from public.vehicles where id = _vehicle_id for update;
  if v.id is null then
    raise exception 'Veículo não encontrado';
  end if;

  if v.status <> 'available' then
    raise exception 'Veículo indisponível no momento (%)', v.status;
  end if;

  if exists (
    select 1 from public.rentals r
    where r.vehicle_id = _vehicle_id
      and r.status in ('confirmed', 'in_flight')
      and int4range(r.start_sol, r.end_sol, '[)') && int4range(_start_sol, _end_sol, '[)')
  ) then
    raise exception 'Veículo já reservado nesse período';
  end if;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then
    raise exception 'Perfil do colono não encontrado';
  end if;

  if v.category = 'interplanetary_rocket' and p.pilot_license <> 'orbital' then
    raise exception 'Habilitação insuficiente! Foguetes Interplanetários exigem licença Orbital.';
  end if;

  if v.category = 'space_truck' and p.pilot_license not in ('heavy_cargo', 'orbital') then
    raise exception 'Habilitação insuficiente! Caminhões Espaciais exigem licença de Carga Pesada ou Orbital.';
  end if;

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

  total_cost := (v.daily_rate_sol * sols) + extras_cost;

  if p.martian_credits < total_cost then
    raise exception 'Saldo insuficiente em Créditos Marcianos! Custo total: MC$ %, Saldo atual: MC$ %',
      total_cost, p.martian_credits;
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles
    set martian_credits = martian_credits - total_cost
    where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  qkey := 'Q-KEY#' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into public.rentals (
    user_id, vehicle_id, pickup_hangar_id, dropoff_hangar_id, start_sol, end_sol,
    total_credits, silica_insurance, extra_o2_tank, neural_autopilot_l5,
    extra_eva_suits, quantum_key, status
  ) values (
    auth.uid(), _vehicle_id, _pickup, _dropoff, _start_sol, _end_sol,
    total_cost, _silica_insurance, _extra_o2_tank, _neural_autopilot_l5,
    _extra_eva_suits, qkey, 'confirmed'
  ) returning id into rid;

  return rid;
exception
  -- A transação inteira é desfeita, inclusive o débito.
  when exclusion_violation then
    raise exception 'Veículo já reservado nesse período';
end;
$$;

create or replace function public.extend_rental(_rental_id uuid, _extra_sols int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.rentals;
  v public.vehicles;
  p public.profiles;
  cost numeric;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if _extra_sols not between 1 and 30 then
    raise exception 'Extensão deve ser de 1 a 30 sols';
  end if;

  select * into r from public.rentals
  where id = _rental_id and user_id = auth.uid()
  for update;
  if r.id is null then
    raise exception 'Reserva não encontrada';
  end if;

  if r.status not in ('confirmed', 'in_flight') then
    raise exception 'Só reservas ativas podem ser estendidas';
  end if;

  select * into v from public.vehicles where id = r.vehicle_id for update;

  if exists (
    select 1 from public.rentals o
    where o.vehicle_id = r.vehicle_id
      and o.id <> r.id
      and o.status in ('confirmed', 'in_flight')
      and int4range(o.start_sol, o.end_sol, '[)')
          && int4range(r.start_sol, r.end_sol + _extra_sols, '[)')
  ) then
    raise exception 'Veículo já reservado nesse período';
  end if;

  cost := v.daily_rate_sol * _extra_sols;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.martian_credits < cost then
    raise exception 'Saldo insuficiente em Créditos Marcianos! Custo: MC$ %, Saldo atual: MC$ %',
      cost, p.martian_credits;
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles
  set martian_credits = martian_credits - cost
  where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  update public.rentals
  set end_sol = end_sol + _extra_sols,
      total_credits = total_credits + cost
  where id = r.id;

  return r.end_sol + _extra_sols;
exception
  when exclusion_violation then
    raise exception 'Veículo já reservado nesse período';
end;
$$;

-- Manutenção só libera veículo que estava em manutenção; nunca um em voo.
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
  next_status public.vehicle_status;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select * into v from public.vehicles where id = _vehicle_id for update;
  if v.id is null then raise exception 'Veículo não encontrado'; end if;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then raise exception 'Perfil não encontrado'; end if;

  next_status := case when v.status = 'maintenance' then 'available'::public.vehicle_status else v.status end;

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
      update public.vehicles set thruster_integrity = 100, status = next_status, updated_at = now() where id = _vehicle_id;
    else
      cost := 500;
      update public.vehicles set status = next_status, updated_at = now() where id = _vehicle_id;
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
end;
$$;

revoke execute on function public.book_vehicle(uuid, uuid, uuid, int, int, boolean, boolean, boolean, int) from public, anon;
revoke execute on function public.extend_rental(uuid, int) from public, anon;
revoke execute on function public.execute_maintenance(uuid, text, text) from public, anon;
