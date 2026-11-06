-- ============================================================================
-- ARES — Preço completo da reserva e fechamento do marketplace
-- Migration ADITIVA.
--  * A barreira anti-tempestade aparecia no preço da tela, mas não era cobrada.
--  * O vendedor não recebia o valor da venda.
--  * Visitantes liam o id de usuário do vendedor.
-- ============================================================================

-- O novo parâmetro tem padrão: chamadas com 9 argumentos continuam válidas.
drop function if exists public.book_vehicle(uuid, uuid, uuid, int, int, boolean, boolean, boolean, int);

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

  if _storm_barrier then
    extras_cost := extras_cost + (220 * sols);
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

revoke execute on function public.book_vehicle(uuid, uuid, uuid, int, int, boolean, boolean, boolean, int, boolean) from public, anon;
grant execute on function public.book_vehicle(uuid, uuid, uuid, int, int, boolean, boolean, boolean, int, boolean) to authenticated;

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
  set martian_credits = martian_credits - s.price_credits,
      updated_at = now()
  where user_id = auth.uid();

  -- Anúncio de colono: o valor vai para o vendedor. Anúncios oficiais não têm vendedor.
  if s.seller_user_id is not null then
    update public.profiles
    set martian_credits = martian_credits + s.price_credits,
        updated_at = now()
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

-- Visitantes veem o anúncio, mas não quem é o usuário vendedor.
revoke select on public.vehicle_sales from anon;
grant select (
  id, name, callsign, category, price_credits, sol_manufactured, flight_hours,
  hull_integrity_pct, battery_condition_pct, condition, hangar_id, seller_name,
  warranty_sols, features, status, created_at, updated_at
) on public.vehicle_sales to anon;
