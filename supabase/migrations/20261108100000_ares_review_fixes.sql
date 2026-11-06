-- ============================================================================
-- ARES — Correções da revisão de código
-- Migration ADITIVA: não edita nenhuma migration anterior.
--
-- Tudo aqui fecha o contorno da API: o app, a API e o REST do Supabase passam
-- pelas mesmas regras, que vivem no banco.
--
--   1. Marketplace: preço válido e anúncio só pela função create_listing.
--   2. Cadastro: habilitação inicial é sempre atmosférica.
--   3. Relógio de sols e ciclo de vida das reservas.
--   4. Reserva: período, limites, clima e adicionais validados no banco.
--   5. Extensão cobra os adicionais e respeita o limite de 90 sols.
--   6. Cancelamento só antes do início.
--   7. Manutenção só para quem tem reserva ativa do veículo (ou admin).
--   8. Histórico de manutenção visível só ao dono (ou admin).
--
-- Constraints novas usam NOT VALID: valem para toda escrita nova, mas linhas
-- antigas desconhecidas não impedem a migration de rodar.
-- Contas que já se deram habilitação Orbital pelo cadastro NÃO são rebaixadas:
-- o administrador corrige caso a caso pelo painel.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Marketplace
-- ----------------------------------------------------------------------------
alter table public.vehicle_sales
  add constraint vehicle_sales_price_range
  check (price_credits > 0 and price_credits <= 100000000) not valid;

alter table public.profiles
  add constraint profiles_credits_nonnegative
  check (martian_credits >= 0) not valid;

drop policy if exists "sellers can manage own listings" on public.vehicle_sales;
revoke insert, update, delete on public.vehicle_sales from authenticated;

create or replace function public.create_listing(
  _name text,
  _callsign text,
  _category public.vehicle_category,
  _price numeric,
  _hangar_id uuid,
  _flight_hours numeric,
  _hull_pct int,
  _battery_pct int,
  _condition public.sale_condition,
  _features text[],
  _seller_name text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  listing_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if length(trim(coalesce(_name, ''))) not between 3 and 80 then
    raise exception 'Informe o modelo (3 a 80 caracteres)';
  end if;
  if length(trim(coalesce(_callsign, ''))) not between 3 and 30 then
    raise exception 'Informe o indicativo (3 a 30 caracteres)';
  end if;
  if _price is null or _price <= 0 or _price > 100000000 then
    raise exception 'Preço inválido: informe um valor entre MC$ 1 e MC$ 100.000.000';
  end if;
  if coalesce(_flight_hours, 0) < 0 or _hull_pct not between 0 and 100
     or _battery_pct not between 0 and 100 then
    raise exception 'Dados técnicos fora da faixa';
  end if;
  if coalesce(array_length(_features, 1), 0) > 10 then
    raise exception 'No máximo 10 itens de equipamento';
  end if;
  if _hangar_id is not null and not exists (select 1 from public.hangars where id = _hangar_id) then
    raise exception 'Hangar não encontrado';
  end if;

  insert into public.vehicle_sales (
    name, callsign, category, price_credits, hangar_id, flight_hours,
    hull_integrity_pct, battery_condition_pct, condition, features,
    seller_name, seller_user_id, status
  ) values (
    trim(_name), upper(trim(_callsign)), _category, _price, _hangar_id,
    coalesce(_flight_hours, 0), _hull_pct, _battery_pct, _condition,
    coalesce(_features, '{}'), left(trim(coalesce(_seller_name, 'Colono particular')), 60),
    auth.uid(), 'available_for_sale'
  ) returning id into listing_id;

  return listing_id;
exception
  when unique_violation then
    raise exception 'Já existe um anúncio com este indicativo';
end;
$$;

revoke execute on function public.create_listing(
  text, text, public.vehicle_category, numeric, uuid, numeric, int, int, public.sale_condition, text[], text
) from public, anon;
grant execute on function public.create_listing(
  text, text, public.vehicle_category, numeric, uuid, numeric, int, int, public.sale_condition, text[], text
) to authenticated;

create or replace function public.buy_marketplace_vehicle(_sale_id uuid)
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

  select * into s from public.vehicle_sales where id = _sale_id for update;
  if s.id is null then
    raise exception 'Veículo para venda não encontrado';
  end if;
  if s.status != 'available_for_sale' then
    raise exception 'Este veículo não está mais disponível para aquisição';
  end if;
  if s.price_credits <= 0 then
    raise exception 'Anúncio com preço inválido';
  end if;
  if s.seller_user_id = auth.uid() then
    raise exception 'Você não pode comprar o seu próprio anúncio';
  end if;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then
    raise exception 'Perfil do piloto não localizado';
  end if;
  if p.martian_credits < s.price_credits then
    raise exception 'Saldo insuficiente: necessário MC$ %, saldo atual MC$ %',
      s.price_credits, p.martian_credits;
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles
  set martian_credits = martian_credits - s.price_credits, updated_at = now()
  where user_id = auth.uid();

  if s.seller_user_id is not null then
    update public.profiles
    set martian_credits = martian_credits + s.price_credits, updated_at = now()
    where user_id = s.seller_user_id;
  end if;
  perform set_config('app.allow_credit_change', 'off', true);

  master_key := 'ARES-TITLE#' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 14));

  insert into public.vehicle_purchases (sale_id, buyer_user_id, price_paid_credits, quantum_master_key)
  values (s.id, auth.uid(), s.price_credits, master_key)
  returning id into purchase_id;

  update public.vehicle_sales set status = 'sold', updated_at = now() where id = s.id;

  return purchase_id;
end;
$$;

revoke execute on function public.buy_marketplace_vehicle(uuid) from public, anon;
grant execute on function public.buy_marketplace_vehicle(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Cadastro: a habilitação nunca vem do que o usuário digita.
--    Promoções são feitas pelo administrador (admin_set_license).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, space_credential_id, pilot_license)
  values (
    new.id,
    left(nullif(trim(new.raw_user_meta_data->>'space_credential_id'), ''), 40),
    'atmospheric'
  );
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Relógio de sols e ciclo de vida das reservas
-- ----------------------------------------------------------------------------
-- Um sol dura 88.775 s. O sol 4218 começa em 07/11/2026 00:00 UTC.
create or replace function public.current_sol()
returns int language sql stable as $$
  select (4218 + floor(extract(epoch from (now() - timestamptz '2026-11-07 00:00:00+00')) / 88775))::int;
$$;

grant execute on function public.current_sol() to anon, authenticated;

alter table public.rentals
  add column if not exists storm_barrier boolean not null default false;

alter table public.rentals
  add constraint rentals_eva_suits_range check (extra_eva_suits between 0 and 6) not valid,
  add constraint rentals_period_valid check (end_sol > start_sol) not valid;

-- confirmed -> in_flight -> completed, conforme o relógio. Sem pg_cron: as
-- funções que decidem algo chamam isto antes, e a tela chama ao listar.
create or replace function public.refresh_rental_status()
returns void language plpgsql security definer set search_path = public as $$
declare
  today int := public.current_sol();
begin
  update public.rentals set status = 'completed'
  where status in ('confirmed', 'in_flight') and end_sol <= today;

  update public.rentals set status = 'in_flight'
  where status = 'confirmed' and start_sol <= today and end_sol > today;
end;
$$;

revoke execute on function public.refresh_rental_status() from public, anon;
grant execute on function public.refresh_rental_status() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Preço dos adicionais em um só lugar (reserva e extensão usam a mesma conta)
-- ----------------------------------------------------------------------------
create or replace function public.rental_addons_per_sol(
  _silica boolean,
  _o2 boolean,
  _autopilot boolean,
  _eva_suits int,
  _storm_barrier boolean
)
returns numeric language sql immutable as $$
  select (case when _storm_barrier then 220 else 0 end)
       + (case when _silica then 120 else 0 end)
       + (case when _o2 then 180 else 0 end)
       + (case when _autopilot then 350 else 0 end)
       + 100 * greatest(coalesce(_eva_suits, 0), 0);
$$;

create or replace function public.book_vehicle(
  _vehicle_id uuid,
  _pickup uuid,
  _dropoff uuid,
  _start_sol int,
  _end_sol int,
  _silica_insurance boolean default false,
  _extra_o2_tank boolean default false,
  _neural_autopilot_l5 boolean default false,
  _extra_eva_suits int default 0,
  _storm_barrier boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  p public.profiles;
  total_cost numeric;
  sols int;
  today int;
  rid uuid;
  qkey text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  perform public.refresh_rental_status();
  today := public.current_sol();

  if _start_sol is null or _end_sol is null or _end_sol <= _start_sol then
    raise exception 'Período inválido: o sol final deve ser maior que o inicial';
  end if;
  if _start_sol < today then
    raise exception 'O sol inicial não pode estar no passado (sol atual: %)', today;
  end if;

  sols := _end_sol - _start_sol;
  if sols > 90 then
    raise exception 'A reserva pode ter no máximo 90 sols';
  end if;
  if _extra_eva_suits not between 0 and 6 then
    raise exception 'Trajes EVA: informe de 0 a 6';
  end if;

  if not exists (select 1 from public.hangars where id = _pickup)
     or not exists (select 1 from public.hangars where id = _dropoff) then
    raise exception 'Hangar não encontrado';
  end if;

  -- Tempestade no hangar de retirada ou devolução exige a barreira.
  if not _storm_barrier and exists (
    select 1 from public.hangars h
    where h.id in (_pickup, _dropoff) and h.storm_alert
  ) then
    raise exception 'Tempestade ativa em um dos hangares: ative a barreira anti-tempestade';
  end if;

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

  total_cost := (
    v.daily_rate_sol + public.rental_addons_per_sol(
      _silica_insurance, _extra_o2_tank, _neural_autopilot_l5, _extra_eva_suits, _storm_barrier
    )
  ) * sols;

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
    extra_eva_suits, storm_barrier, quantum_key, status
  ) values (
    auth.uid(), _vehicle_id, _pickup, _dropoff, _start_sol, _end_sol,
    total_cost, _silica_insurance, _extra_o2_tank, _neural_autopilot_l5,
    _extra_eva_suits, _storm_barrier, qkey, 'confirmed'
  ) returning id into rid;

  return rid;
exception
  when exclusion_violation then
    raise exception 'Veículo já reservado nesse período';
end;
$$;

revoke execute on function public.book_vehicle(uuid, uuid, uuid, int, int, boolean, boolean, boolean, int, boolean) from public, anon;
grant execute on function public.book_vehicle(uuid, uuid, uuid, int, int, boolean, boolean, boolean, int, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Extensão: cobra diária + adicionais da reserva e respeita 90 sols no total
-- ----------------------------------------------------------------------------
create or replace function public.extend_rental(_rental_id uuid, _extra_sols int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.rentals;
  v public.vehicles;
  p public.profiles;
  new_end int;
  cost numeric;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if _extra_sols not between 1 and 30 then
    raise exception 'Extensão deve ser de 1 a 30 sols';
  end if;

  perform public.refresh_rental_status();

  select * into r from public.rentals
  where id = _rental_id and user_id = auth.uid()
  for update;
  if r.id is null then
    raise exception 'Reserva não encontrada';
  end if;
  if r.status not in ('confirmed', 'in_flight') then
    raise exception 'Só reservas ativas podem ser estendidas';
  end if;

  new_end := r.end_sol + _extra_sols;
  if new_end - r.start_sol > 90 then
    raise exception 'A reserva pode ter no máximo 90 sols no total';
  end if;

  select * into v from public.vehicles where id = r.vehicle_id for update;

  if exists (
    select 1 from public.rentals o
    where o.vehicle_id = r.vehicle_id
      and o.id <> r.id
      and o.status in ('confirmed', 'in_flight')
      and int4range(o.start_sol, o.end_sol, '[)') && int4range(r.start_sol, new_end, '[)')
  ) then
    raise exception 'Veículo já reservado nesse período';
  end if;

  cost := (
    v.daily_rate_sol + public.rental_addons_per_sol(
      r.silica_insurance, r.extra_o2_tank, r.neural_autopilot_l5, r.extra_eva_suits, r.storm_barrier
    )
  ) * _extra_sols;

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
  set end_sol = new_end, total_credits = total_credits + cost
  where id = r.id;

  return new_end;
exception
  when exclusion_violation then
    raise exception 'Veículo já reservado nesse período';
end;
$$;

revoke execute on function public.extend_rental(uuid, int) from public, anon;
grant execute on function public.extend_rental(uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Cancelamento: reembolso integral só enquanto a reserva não começou
-- ----------------------------------------------------------------------------
create or replace function public.cancel_rental(_rental_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  r public.rentals;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  perform public.refresh_rental_status();

  select * into r from public.rentals
  where id = _rental_id and user_id = auth.uid()
  for update;
  if r.id is null then
    raise exception 'Reserva não encontrada';
  end if;

  if r.status = 'in_flight' or (r.status = 'confirmed' and r.start_sol <= public.current_sol()) then
    raise exception 'Reserva já iniciada: não pode ser cancelada';
  end if;
  if r.status <> 'confirmed' then
    raise exception 'Só reservas confirmadas podem ser canceladas';
  end if;

  update public.rentals set status = 'cancelled' where id = r.id;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles
  set martian_credits = martian_credits + r.total_credits
  where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);

  return r.total_credits;
end;
$$;

revoke execute on function public.cancel_rental(uuid) from public, anon;
grant execute on function public.cancel_rental(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Manutenção: só quem tem reserva ativa do veículo (ou admin).
--    Tirar um veículo de "manutenção" para "disponível" é decisão do admin.
-- ----------------------------------------------------------------------------
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
  admin boolean := public.is_admin();
  next_status public.vehicle_status;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  perform public.refresh_rental_status();

  select * into v from public.vehicles where id = _vehicle_id for update;
  if v.id is null then raise exception 'Veículo não encontrado'; end if;

  if not admin and not exists (
    select 1 from public.rentals r
    where r.vehicle_id = _vehicle_id
      and r.user_id = auth.uid()
      and r.status in ('confirmed', 'in_flight')
  ) then
    raise exception 'Manutenção exige uma reserva ativa deste veículo';
  end if;

  select * into p from public.profiles where user_id = auth.uid() for update;
  if p.id is null then raise exception 'Perfil não encontrado'; end if;

  next_status := case
    when v.status = 'maintenance' and admin then 'available'::public.vehicle_status
    else v.status
  end;

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
      raise exception 'Serviço de manutenção desconhecido';
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

revoke execute on function public.execute_maintenance(uuid, text, text) from public, anon;
grant execute on function public.execute_maintenance(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Histórico de manutenção: cada conta vê só o que pagou (admin vê tudo)
-- ----------------------------------------------------------------------------
drop policy if exists "maintenance readable to all authenticated" on public.maintenance_logs;

create policy "maintenance readable to owner or admin" on public.maintenance_logs
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
