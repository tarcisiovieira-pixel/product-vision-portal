-- ============================================================================
-- ARES — Endurecimento de segurança (Fase 3)
-- Migration ADITIVA: não altera migrations anteriores.
-- O front só escreve nestas tabelas via RPC (security definer), então fechar
-- as escritas diretas não quebra nenhum fluxo do app.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. book_vehicle: remover a assinatura antiga (5 args).
--    Ela NÃO valida licença do piloto nem adicionais; continuava chamável por
--    qualquer usuário autenticado e contornava as regras da versão de 9 args.
-- ----------------------------------------------------------------------------
drop function if exists public.book_vehicle(uuid, uuid, uuid, int, int);

-- ----------------------------------------------------------------------------
-- 2. Telemetria de voo
--    - Sem acesso anônimo (leitura e execução).
--    - Sem INSERT direto: só pela RPC.
--    - A RPC exige que o chamador tenha reserva ativa do veículo e valida faixas.
-- ----------------------------------------------------------------------------
drop policy if exists "flight telemetry readable to all" on public.flight_telemetry_logs;
drop policy if exists "flight telemetry insertable by authenticated" on public.flight_telemetry_logs;

create policy "flight telemetry readable to authenticated"
  on public.flight_telemetry_logs for select to authenticated using (true);

revoke select on public.flight_telemetry_logs from anon;
revoke insert on public.flight_telemetry_logs from authenticated;

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
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  -- Só quem tem uma reserva ativa deste veículo pode reportar telemetria.
  if not exists (
    select 1 from public.rentals r
    where r.user_id = auth.uid()
      and r.vehicle_id = _vehicle_id
      and r.status in ('confirmed', 'in_flight')
  ) then
    raise exception 'Sem reserva ativa para este veículo';
  end if;

  -- Validação de faixas físicas.
  if _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'Coordenadas inválidas';
  end if;
  if _altitude_km < 0 or _speed_kmh < 0 or _mach < 0 then
    raise exception 'Altitude/velocidade inválidas';
  end if;
  if _battery_pct not between 0 and 100 or _dust_filter_pct not between 0 and 100 or _o2_hours < 0 then
    raise exception 'Valores de telemetria fora da faixa';
  end if;

  insert into public.flight_telemetry_logs (
    vehicle_id, route_id, lat, lng, altitude_km, speed_kmh, mach_number,
    battery_pct, o2_hours, dust_filter_pct
  ) values (
    _vehicle_id, _route_id, _lat, _lng, _altitude_km, _speed_kmh, _mach,
    _battery_pct, _o2_hours, _dust_filter_pct
  ) returning id into log_id;

  update public.vehicles
  set lat = _lat, lng = _lng, altitude_km = _altitude_km, speed_kmh = _speed_kmh,
      battery_pct = _battery_pct, o2_hours = _o2_hours, dust_filter_pct = _dust_filter_pct,
      updated_at = now()
  where id = _vehicle_id;

  return log_id;
end;
$$;

revoke execute on function public.record_flight_telemetry(uuid, numeric, numeric, numeric, numeric, uuid, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.record_flight_telemetry(uuid, numeric, numeric, numeric, numeric, uuid, numeric, numeric, numeric, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Rotas de voo: catálogo somente leitura para autenticados.
--    Escrita apenas por service_role (backend/admin).
-- ----------------------------------------------------------------------------
drop policy if exists "flight routes readable to all" on public.flight_routes;
drop policy if exists "flight routes insertable by authenticated" on public.flight_routes;
drop policy if exists "flight routes updatable by authenticated" on public.flight_routes;

create policy "flight routes readable to authenticated"
  on public.flight_routes for select to authenticated using (true);

revoke select on public.flight_routes from anon;
revoke insert, update on public.flight_routes from authenticated;

-- ----------------------------------------------------------------------------
-- 4. Logs de manutenção: escrita só via execute_maintenance (security definer).
-- ----------------------------------------------------------------------------
drop policy if exists "maintenance insertable to authenticated" on public.maintenance_logs;
revoke insert, update on public.maintenance_logs from authenticated;

-- ----------------------------------------------------------------------------
-- 5. Marketplace
--    - buy_marketplace_vehicle não era revogada de public/anon.
--    - Vendedor não pode comprar o próprio anúncio.
-- ----------------------------------------------------------------------------
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
-- 6. Demais RPCs: garantir que anon/public não executam.
-- ----------------------------------------------------------------------------
revoke execute on function public.book_vehicle(uuid, uuid, uuid, int, int, boolean, boolean, boolean, int) from public, anon;
revoke execute on function public.execute_maintenance(uuid, text, text) from public, anon;

-- ----------------------------------------------------------------------------
-- PENDENTE (decisão de negócio, não incluído aqui):
--  * buy_marketplace_vehicle debita o comprador mas não credita o vendedor.
--  * vehicle_sales é legível por anon e expõe seller_user_id; avaliar view pública
--    sem esse campo.
-- ----------------------------------------------------------------------------
