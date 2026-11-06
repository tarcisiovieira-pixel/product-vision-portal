-- ============================================================================
-- ARES — Painel administrativo
-- Migration ADITIVA. Toda permissão é decidida aqui, no banco: a tela só exibe.
-- Nenhum admin é criado automaticamente. Para promover o primeiro:
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = 'seu-email@exemplo.com';
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Perfil: habilitação, reputação e horas de voo também só mudam pelo servidor.
--    Antes, o usuário podia se promover a piloto Orbital direto pela API.
-- ----------------------------------------------------------------------------
create or replace function public.protect_profile_credits()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.allow_credit_change', true) is distinct from 'on' then
    new.martian_credits = old.martian_credits;
    new.pilot_license = old.pilot_license;
    new.safety_reputation_score = old.safety_reputation_score;
    new.flight_hours = old.flight_hours;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Tabelas. RLS ligada e sem políticas: acesso somente pelas funções abaixo.
-- ----------------------------------------------------------------------------
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.user_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  suspended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_users enable row level security;
alter table public.user_suspensions enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.admin_users, public.user_suspensions, public.admin_audit_log
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Papel de administrador
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Conta suspensa não reserva, não compra, não anuncia e não pede manutenção.
--    Cancelar continua permitido, para o usuário reaver os créditos.
-- ----------------------------------------------------------------------------
create or replace function public.block_suspended_writes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.user_suspensions where user_id = auth.uid()) then
    raise exception 'Conta suspensa. Fale com o suporte.';
  end if;
  return new;
end;
$$;

revoke execute on function public.block_suspended_writes() from public, anon, authenticated;

create trigger rentals_block_suspended before insert on public.rentals
  for each row execute function public.block_suspended_writes();
create trigger rentals_extend_block_suspended before update of end_sol on public.rentals
  for each row execute function public.block_suspended_writes();
create trigger maintenance_block_suspended before insert on public.maintenance_logs
  for each row execute function public.block_suspended_writes();
create trigger purchases_block_suspended before insert on public.vehicle_purchases
  for each row execute function public.block_suspended_writes();
create trigger sales_block_suspended before insert on public.vehicle_sales
  for each row execute function public.block_suspended_writes();

-- ----------------------------------------------------------------------------
-- 5. Indicadores
-- ----------------------------------------------------------------------------
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

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  credential text,
  pilot_license public.pilot_license,
  credits numeric,
  reputation numeric,
  flight_hours numeric,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  rentals_total bigint,
  rentals_active bigint,
  rentals_cancelled bigint,
  spent numeric,
  suspended boolean,
  suspended_reason text,
  is_admin boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();

  return query
  select
    u.id,
    u.email::text,
    p.space_credential_id,
    p.pilot_license,
    p.martian_credits::numeric,
    p.safety_reputation_score::numeric,
    p.flight_hours::numeric,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at is not null,
    coalesce(r.total, 0),
    coalesce(r.active, 0),
    coalesce(r.cancelled, 0),
    coalesce(r.spent, 0),
    s.user_id is not null,
    s.reason,
    a.user_id is not null
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.user_suspensions s on s.user_id = u.id
  left join public.admin_users a on a.user_id = u.id
  left join lateral (
    select
      count(*) as total,
      count(*) filter (where x.status in ('confirmed', 'in_flight')) as active,
      count(*) filter (where x.status = 'cancelled') as cancelled,
      sum(x.total_credits) filter (where x.status <> 'cancelled') as spent
    from public.rentals x
    where x.user_id = u.id
  ) r on true
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_list_audit(_limit int default 50)
returns table (
  id uuid,
  action text,
  details jsonb,
  created_at timestamptz,
  admin_email text,
  target_email text
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();

  return query
  select l.id, l.action, l.details, l.created_at, a.email::text, t.email::text
  from public.admin_audit_log l
  left join auth.users a on a.id = l.admin_id
  left join auth.users t on t.id = l.target_user_id
  order by l.created_at desc
  limit least(greatest(_limit, 1), 200);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Ações. Todas exigem motivo e ficam registradas na auditoria.
-- ----------------------------------------------------------------------------
create or replace function public.admin_adjust_credits(_user_id uuid, _delta numeric, _reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  balance numeric;
begin
  perform public.assert_admin();

  if _delta is null or _delta = 0 or abs(_delta) > 1000000 then
    raise exception 'Ajuste deve ser diferente de zero e de até MC$ 1.000.000';
  end if;
  if length(trim(coalesce(_reason, ''))) < 3 then
    raise exception 'Informe o motivo do ajuste';
  end if;

  select martian_credits into balance from public.profiles where user_id = _user_id for update;
  if balance is null then
    raise exception 'Usuário não encontrado';
  end if;
  if balance + _delta < 0 then
    raise exception 'O ajuste deixaria o saldo negativo. Saldo atual: MC$ %', balance;
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles set martian_credits = martian_credits + _delta where user_id = _user_id;
  perform set_config('app.allow_credit_change', 'off', true);

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), _user_id, 'credits_adjusted',
          jsonb_build_object('delta', _delta, 'reason', trim(_reason), 'balance', balance + _delta));

  return balance + _delta;
end;
$$;

create or replace function public.admin_set_license(
  _user_id uuid,
  _license public.pilot_license,
  _reason text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  previous public.pilot_license;
begin
  perform public.assert_admin();

  if length(trim(coalesce(_reason, ''))) < 3 then
    raise exception 'Informe o motivo da alteração';
  end if;

  select pilot_license into previous from public.profiles where user_id = _user_id for update;
  if previous is null then
    raise exception 'Usuário não encontrado';
  end if;

  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles set pilot_license = _license where user_id = _user_id;
  perform set_config('app.allow_credit_change', 'off', true);

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), _user_id, 'license_changed',
          jsonb_build_object('from', previous, 'to', _license, 'reason', trim(_reason)));
end;
$$;

create or replace function public.admin_set_suspended(
  _user_id uuid,
  _suspended boolean,
  _reason text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();

  if _user_id = auth.uid() then
    raise exception 'Você não pode suspender a própria conta';
  end if;
  if length(trim(coalesce(_reason, ''))) < 3 then
    raise exception 'Informe o motivo';
  end if;
  if not exists (select 1 from auth.users where id = _user_id) then
    raise exception 'Usuário não encontrado';
  end if;

  if _suspended then
    insert into public.user_suspensions (user_id, reason, suspended_by)
    values (_user_id, trim(_reason), auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, suspended_by = excluded.suspended_by;
  else
    delete from public.user_suspensions where user_id = _user_id;
  end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), _user_id,
          case when _suspended then 'user_suspended' else 'user_reactivated' end,
          jsonb_build_object('reason', trim(_reason)));
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Permissões
-- ----------------------------------------------------------------------------
revoke execute on function
  public.is_admin(),
  public.assert_admin(),
  public.admin_overview(),
  public.admin_list_users(),
  public.admin_list_audit(int),
  public.admin_adjust_credits(uuid, numeric, text),
  public.admin_set_license(uuid, public.pilot_license, text),
  public.admin_set_suspended(uuid, boolean, text)
from public, anon;

grant execute on function
  public.is_admin(),
  public.admin_overview(),
  public.admin_list_users(),
  public.admin_list_audit(int),
  public.admin_adjust_credits(uuid, numeric, text),
  public.admin_set_license(uuid, public.pilot_license, text),
  public.admin_set_suspended(uuid, boolean, text)
to authenticated;
