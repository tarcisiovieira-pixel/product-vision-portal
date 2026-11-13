-- ============================================================================
-- ARES — Catálogo de frota e CRUD administrativo de veículos
-- Migration ADITIVA.
--
--  * Cada veículo ganha um modelo 3D (model_key) e especificações: assentos, carga,
--    autonomia e descrição. As IAs de consultoria e de upsell usam essas colunas.
--  * Remover um veículo é ARQUIVAR (deleted_at): as reservas e a receita históricas
--    dependem dele, então apagar de verdade quebraria o histórico.
--  * Só administradores criam, editam, arquivam e restauram, sempre com motivo,
--    e tudo vai para a auditoria. Usuário comum não enxerga veículo arquivado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas
-- ----------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists model_key text not null default 'cybercab_x2',
  add column if not exists seats int not null default 2,
  add column if not exists cargo_kg int not null default 0,
  add column if not exists range_km int not null default 500,
  add column if not exists description text,
  add column if not exists deleted_at timestamptz;

create or replace function public.vehicle_model_category(_key text)
returns public.vehicle_category language sql immutable as $$
  select case _key
    when 'ares_hauler' then 'space_truck'::public.vehicle_category
    when 'starship_hopper' then 'interplanetary_rocket'::public.vehicle_category
    else 'car_vtol'::public.vehicle_category
  end;
$$;

-- Veículos que já existiam recebem o modelo que o app já desenhava para eles.
update public.vehicles set model_key = case
  when category = 'space_truck' then 'ares_hauler'
  when category = 'interplanetary_rocket' then 'starship_hopper'
  when callsign ilike 'APX%' or name ilike '%apex%' or name ilike '%phantom%' then 'apex_phantom'
  when callsign ilike 'VMT%' or name ilike '%valkyrie%' or name ilike '%roadster%' then 'valkyrie_gt'
  when callsign ilike 'CC-SP%' or name ilike '%sport%' then 'cybercab_sport'
  else 'cybercab_x2'
end;

update public.vehicles set
  seats = case model_key
    when 'cybercab_x2' then 4 when 'cybercab_sport' then 2 when 'apex_phantom' then 4
    when 'valkyrie_gt' then 2 when 'ares_hauler' then 3 else 100 end,
  cargo_kg = case model_key
    when 'cybercab_x2' then 200 when 'cybercab_sport' then 60 when 'apex_phantom' then 120
    when 'valkyrie_gt' then 40 when 'ares_hauler' then 40000 else 100000 end,
  range_km = case model_key
    when 'cybercab_x2' then 800 when 'cybercab_sport' then 650 when 'apex_phantom' then 1200
    when 'valkyrie_gt' then 900 when 'ares_hauler' then 1500 else 54600000 end;

alter table public.vehicles
  add constraint vehicles_model_key_valid check (model_key in ('cybercab_x2', 'cybercab_sport', 'apex_phantom', 'valkyrie_gt', 'ares_hauler', 'starship_hopper')),
  add constraint vehicles_model_matches_category check (public.vehicle_model_category(model_key) = category),
  add constraint vehicles_specs_range check (
    seats between 1 and 500 and cargo_kg between 0 and 10000000 and range_km between 1 and 1000000000
  ),
  add constraint vehicles_rate_range check (daily_rate_sol > 0 and daily_rate_sol <= 1000000),
  add constraint vehicles_description_length check (description is null or length(description) <= 400);

-- ----------------------------------------------------------------------------
-- 2. Quem enxerga o quê: arquivado só para administrador
-- ----------------------------------------------------------------------------
drop policy if exists "vehicles readable" on public.vehicles;
create policy "vehicles readable to authenticated" on public.vehicles
  for select to authenticated
  using (deleted_at is null or public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. Veículo arquivado não é reservável; a frota do painel ignora arquivados
-- ----------------------------------------------------------------------------
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
  if v.deleted_at is not null or v.status <> 'available' then
    raise exception 'Veículo indisponível no momento (%)',
      case when v.deleted_at is not null then 'arquivado' else v.status::text end;
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

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform public.assert_admin();

  select jsonb_build_object(
    'generated_at', now(),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'confirmed', count(*) filter (where u.email_confirmed_at is not null),
        'pending_email', count(*) filter (where u.email_confirmed_at is null),
        'new_7d', count(*) filter (where u.created_at >= now() - interval '7 days'),
        'new_30d', count(*) filter (where u.created_at >= now() - interval '30 days'),
        'active_30d', count(*) filter (where u.last_sign_in_at >= now() - interval '30 days'),
        'with_rental', count(*) filter (
          where exists (select 1 from public.rentals r where r.user_id = u.id)
        ),
        'suspended', (select count(*) from public.user_suspensions)
      )
      from auth.users u
    ),
    'rentals', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where r.status in ('confirmed', 'in_flight')),
        'cancelled', count(*) filter (where r.status = 'cancelled'),
        'revenue', coalesce(sum(r.total_credits) filter (where r.status <> 'cancelled'), 0),
        'avg_ticket', coalesce(round(avg(r.total_credits) filter (where r.status <> 'cancelled')), 0)
      )
      from public.rentals r
    ),
    'fleet', (
      select jsonb_build_object(
        'total', count(*),
        'available', count(*) filter (where v.status = 'available'),
        'in_flight', count(*) filter (where v.status = 'in_flight'),
        'maintenance', count(*) filter (where v.status = 'maintenance'),
        'storm_hold', count(*) filter (where v.status = 'storm_hold'),
        'occupied', count(*) filter (
          where exists (
            select 1 from public.rentals r
            where r.vehicle_id = v.id and r.status in ('confirmed', 'in_flight')
          )
        )
      )
      from public.vehicles v
      where v.deleted_at is null
    ),
    'finance', jsonb_build_object(
      'credits_circulating', (select coalesce(sum(martian_credits), 0) from public.profiles),
      'maintenance_revenue', (select coalesce(sum(credits_cost), 0) from public.maintenance_logs),
      'marketplace_revenue', (select coalesce(sum(price_paid_credits), 0) from public.vehicle_purchases),
      'marketplace_sales', (select count(*) from public.vehicle_purchases)
    ),
    'signups_by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'count', d.total) order by d.day)
      from (
        select gs::date as day,
               (select count(*) from auth.users u where u.created_at::date = gs::date) as total
        from generate_series(current_date - 13, current_date, interval '1 day') gs
      ) d
    ),
    'top_vehicles', (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from (
        select v.callsign, v.name,
               count(r.id) as rentals,
               coalesce(sum(r.total_credits), 0) as revenue
        from public.vehicles v
        join public.rentals r on r.vehicle_id = v.id and r.status <> 'cancelled'
        group by v.id
        order by revenue desc
        limit 6
      ) t
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. CRUD administrativo
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_vehicles()
returns table (
  id uuid, name text, callsign text, category public.vehicle_category, model_key text,
  daily_rate_sol numeric, hangar_id uuid, hangar_name text, status public.vehicle_status,
  seats int, cargo_kg int, range_km int, description text, deleted_at timestamptz,
  created_at timestamptz, rentals_total bigint, rentals_active bigint, revenue numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();

  return query
  select v.id, v.name, v.callsign, v.category, v.model_key, v.daily_rate_sol, v.hangar_id, h.name,
         v.status, v.seats, v.cargo_kg, v.range_km, v.description, v.deleted_at, v.created_at,
         coalesce(r.total, 0), coalesce(r.active, 0), coalesce(r.revenue, 0)
  from public.vehicles v
  left join public.hangars h on h.id = v.hangar_id
  left join lateral (
    select count(*) as total,
           count(*) filter (where x.status in ('confirmed', 'in_flight')) as active,
           sum(x.total_credits) filter (where x.status <> 'cancelled') as revenue
    from public.rentals x where x.vehicle_id = v.id
  ) r on true
  order by (v.deleted_at is not null), v.category, v.callsign;
end;
$$;

create or replace function public.admin_save_vehicle(
  _id uuid,
  _name text,
  _callsign text,
  _model_key text,
  _daily_rate numeric,
  _hangar_id uuid,
  _status public.vehicle_status,
  _seats int,
  _cargo_kg int,
  _range_km int,
  _description text,
  _reason text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cs text := upper(trim(coalesce(_callsign, '')));
  cat public.vehicle_category;
  hangar public.hangars;
  before_row public.vehicles;
  after_row public.vehicles;
  vid uuid;
  changes jsonb;
begin
  perform public.assert_admin();

  if length(trim(coalesce(_reason, ''))) < 3 then
    raise exception 'Informe o motivo';
  end if;
  if length(trim(coalesce(_name, ''))) not between 3 and 80 then
    raise exception 'O nome precisa ter de 3 a 80 caracteres';
  end if;
  if cs !~ '^[A-Z0-9][A-Z0-9-]{2,19}$' then
    raise exception 'Indicativo inválido: use de 3 a 20 letras maiúsculas, números ou hífen';
  end if;
  if _model_key is null or _model_key not in ('cybercab_x2', 'cybercab_sport', 'apex_phantom', 'valkyrie_gt', 'ares_hauler', 'starship_hopper') then
    raise exception 'Modelo 3D inválido';
  end if;
  if _daily_rate is null or _daily_rate <= 0 or _daily_rate > 1000000 then
    raise exception 'A diária deve estar entre MC$ 1 e MC$ 1.000.000';
  end if;
  if _seats not between 1 and 500 or _cargo_kg not between 0 and 10000000
     or _range_km not between 1 and 1000000000 then
    raise exception 'Assentos, carga ou autonomia fora da faixa permitida';
  end if;
  if _description is not null and length(_description) > 400 then
    raise exception 'A descrição pode ter no máximo 400 caracteres';
  end if;

  cat := public.vehicle_model_category(_model_key);

  if _hangar_id is not null then
    select * into hangar from public.hangars where id = _hangar_id;
    if hangar.id is null then
      raise exception 'Hangar não encontrado';
    end if;
  end if;

  if _id is null then
    if _status = 'in_flight' then
      raise exception 'O status "em voo" não pode ser definido manualmente';
    end if;

    insert into public.vehicles (
      name, callsign, category, model_key, daily_rate_sol, hangar_id, status,
      seats, cargo_kg, range_km, description, lat, lng, o2_hours
    ) values (
      trim(_name), cs, cat, _model_key, _daily_rate, _hangar_id, _status,
      _seats, _cargo_kg, _range_km, nullif(trim(coalesce(_description, '')), ''),
      coalesce(hangar.lat, 0), coalesce(hangar.lng, 0),
      case cat when 'interplanetary_rocket' then 900 when 'space_truck' then 120 else 40 end
    ) returning id into vid;

    insert into public.admin_audit_log (admin_id, action, details)
    values (auth.uid(), 'vehicle_created',
            jsonb_build_object('vehicle_id', vid, 'callsign', cs, 'name', trim(_name), 'reason', trim(_reason)));
    return vid;
  end if;

  perform public.refresh_rental_status();

  select * into before_row from public.vehicles where id = _id for update;
  if before_row.id is null then
    raise exception 'Veículo não encontrado';
  end if;
  if before_row.deleted_at is not null then
    raise exception 'Restaure o veículo antes de editar';
  end if;
  if _status = 'in_flight' and before_row.status <> 'in_flight' then
    raise exception 'O status "em voo" não pode ser definido manualmente';
  end if;
  if cat <> before_row.category and exists (
    select 1 from public.rentals r
    where r.vehicle_id = _id and r.status in ('confirmed', 'in_flight')
  ) then
    raise exception 'Não é possível trocar a categoria de um veículo com reservas ativas';
  end if;

  update public.vehicles set
    name = trim(_name), callsign = cs, category = cat, model_key = _model_key,
    daily_rate_sol = _daily_rate, hangar_id = _hangar_id, status = _status,
    seats = _seats, cargo_kg = _cargo_kg, range_km = _range_km,
    description = nullif(trim(coalesce(_description, '')), ''), updated_at = now()
  where id = _id
  returning * into after_row;

  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  into changes
  from jsonb_each(to_jsonb(before_row)) o
  join jsonb_each(to_jsonb(after_row)) n using (key)
  where o.value is distinct from n.value and o.key <> 'updated_at';

  insert into public.admin_audit_log (admin_id, action, details)
  values (auth.uid(), 'vehicle_updated',
          jsonb_build_object('vehicle_id', _id, 'callsign', cs, 'reason', trim(_reason), 'changes', changes));

  return _id;
exception
  when unique_violation then
    raise exception 'Já existe um veículo com este indicativo (inclusive arquivado)';
end;
$$;

create or replace function public.admin_archive_vehicle(_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
begin
  perform public.assert_admin();

  if length(trim(coalesce(_reason, ''))) < 3 then
    raise exception 'Informe o motivo';
  end if;

  perform public.refresh_rental_status();

  select * into v from public.vehicles where id = _id for update;
  if v.id is null then
    raise exception 'Veículo não encontrado';
  end if;
  if v.deleted_at is not null then
    raise exception 'Este veículo já está arquivado';
  end if;
  if exists (
    select 1 from public.rentals r
    where r.vehicle_id = _id and r.status in ('confirmed', 'in_flight')
  ) then
    raise exception 'Veículo com reservas ativas: aguarde terminar ou cancele antes de arquivar';
  end if;

  update public.vehicles set deleted_at = now(), updated_at = now() where id = _id;

  insert into public.admin_audit_log (admin_id, action, details)
  values (auth.uid(), 'vehicle_archived',
          jsonb_build_object('vehicle_id', _id, 'callsign', v.callsign, 'reason', trim(_reason)));
end;
$$;

create or replace function public.admin_restore_vehicle(_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
begin
  perform public.assert_admin();

  if length(trim(coalesce(_reason, ''))) < 3 then
    raise exception 'Informe o motivo';
  end if;

  select * into v from public.vehicles where id = _id for update;
  if v.id is null then
    raise exception 'Veículo não encontrado';
  end if;
  if v.deleted_at is null then
    raise exception 'Este veículo não está arquivado';
  end if;

  update public.vehicles set deleted_at = null, updated_at = now() where id = _id;

  insert into public.admin_audit_log (admin_id, action, details)
  values (auth.uid(), 'vehicle_restored',
          jsonb_build_object('vehicle_id', _id, 'callsign', v.callsign, 'reason', trim(_reason)));
end;
$$;

revoke execute on function
  public.vehicle_model_category(text),
  public.admin_list_vehicles(),
  public.admin_save_vehicle(uuid, text, text, text, numeric, uuid, public.vehicle_status, int, int, int, text, text),
  public.admin_archive_vehicle(uuid, text),
  public.admin_restore_vehicle(uuid, text)
from public, anon;

grant execute on function
  public.vehicle_model_category(text),
  public.admin_list_vehicles(),
  public.admin_save_vehicle(uuid, text, text, text, numeric, uuid, public.vehicle_status, int, int, int, text, text),
  public.admin_archive_vehicle(uuid, text),
  public.admin_restore_vehicle(uuid, text)
to authenticated;
