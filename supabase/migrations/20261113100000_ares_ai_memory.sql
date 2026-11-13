-- Memória persistente das IAs. Migration aditiva.
--
-- Princípios: tópicos fechados e valores validados no banco (nada de texto livre), acesso só
-- por funções que usam auth.uid(), o dono pode ver, apagar e desligar, e nada aqui guarda
-- e-mail ou nome. As tabelas ficam sem acesso direto.

-- ---------------------------------------------------------------------------
-- Preferências do usuário
-- ---------------------------------------------------------------------------
create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (
    topic in ('priority', 'party_size', 'home_hangar', 'favorite_destination',
              'budget_per_trip', 'avoid_storms', 'preferred_category', 'dismissed_addon')
  ),
  value text not null check (length(value) between 1 and 60),
  source text not null default 'stated' check (source in ('stated', 'inferred', 'feedback')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, topic, value)
);
create index if not exists ai_memory_user_idx on public.ai_memory (user_id, updated_at desc);
alter table public.ai_memory enable row level security;
revoke all on public.ai_memory from public, anon, authenticated;

create table if not exists public.ai_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  memory_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.ai_settings enable row level security;
revoke all on public.ai_settings from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Histórico de indicadores do painel (só agregados numéricos)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_snapshots (
  taken_on date primary key default current_date,
  data jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 4000)
);
alter table public.ai_snapshots enable row level security;
revoke all on public.ai_snapshots from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------
create or replace function public.ai_memory_enabled(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select memory_enabled from public.ai_settings where user_id = _uid), true);
$$;
revoke all on function public.ai_memory_enabled(uuid) from public, anon, authenticated;

create or replace function public.ai_get_memory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;
  return jsonb_build_object(
    'enabled', public.ai_memory_enabled(uid),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id, 'topic', m.topic, 'value', m.value, 'source', m.source,
          'updated_at', m.updated_at, 'expires_at', m.expires_at
        ) order by m.updated_at desc
      )
      from public.ai_memory m
      where m.user_id = uid and (m.expires_at is null or m.expires_at > now())
    ), '[]'::jsonb)
  );
end;
$$;

-- Guarda (ou atualiza) uma preferência. Valida o valor de cada tópico no banco.
create or replace function public.ai_remember(
  _topic text,
  _value text,
  _source text default 'stated',
  _ttl_days integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v text := btrim(coalesce(_value, ''));
  n numeric;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;
  if not public.ai_memory_enabled(uid) then
    return; -- memória desligada: nada é guardado
  end if;
  if _source not in ('stated', 'inferred', 'feedback') then
    raise exception 'Origem inválida';
  end if;
  if _ttl_days is not null and (_ttl_days < 1 or _ttl_days > 365) then
    raise exception 'Prazo inválido';
  end if;

  case _topic
    when 'priority' then
      if v not in ('speed', 'economy', 'comfort', 'safety') then
        raise exception 'Prioridade inválida';
      end if;
    when 'party_size' then
      if v !~ '^[0-9]{1,3}$' or v::int not between 1 and 500 then
        raise exception 'Número de pessoas inválido';
      end if;
    when 'home_hangar', 'favorite_destination' then
      if not exists (select 1 from public.hangars h where h.code = v) then
        raise exception 'Hangar não encontrado';
      end if;
    when 'budget_per_trip' then
      if v !~ '^[0-9]{1,9}$' or v::numeric not between 1 and 100000000 then
        raise exception 'Orçamento inválido';
      end if;
    when 'avoid_storms' then
      if v <> 'true' then
        raise exception 'Valor inválido';
      end if;
    when 'preferred_category' then
      if v not in ('car_vtol', 'space_truck', 'interplanetary_rocket') then
        raise exception 'Categoria inválida';
      end if;
    when 'dismissed_addon' then
      if v not in ('storm_barrier_shield', 'silica_insurance', 'extra_o2_tank',
                   'neural_autopilot_l5', 'extra_eva_suits') then
        raise exception 'Adicional inválido';
      end if;
    else
      raise exception 'Tópico inválido';
  end case;

  -- Tópicos de valor único substituem o anterior; só "dismissed_addon" acumula.
  if _topic <> 'dismissed_addon' then
    delete from public.ai_memory where user_id = uid and topic = _topic and value <> v;
  end if;

  insert into public.ai_memory (user_id, topic, value, source, expires_at)
  values (uid, _topic, v, _source,
          case when _ttl_days is null then null else now() + make_interval(days => _ttl_days) end)
  on conflict (user_id, topic, value) do update
    set updated_at = now(), source = excluded.source, expires_at = excluded.expires_at;

  -- Teto por usuário: os mais antigos saem primeiro.
  delete from public.ai_memory
  where id in (
    select id from public.ai_memory where user_id = uid
    order by updated_at desc offset 40
  );
end;
$$;

create or replace function public.ai_forget(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  delete from public.ai_memory where id = _id and user_id = auth.uid();
end;
$$;

create or replace function public.ai_forget_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  delete from public.ai_memory where user_id = auth.uid();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.ai_set_memory_enabled(_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if _on is null then
    raise exception 'Valor inválido';
  end if;
  insert into public.ai_settings (user_id, memory_enabled)
  values (auth.uid(), _on)
  on conflict (user_id) do update set memory_enabled = excluded.memory_enabled, updated_at = now();
end;
$$;

-- Histórico do painel: só administradores, só números.
create or replace function public.ai_save_snapshot(_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  if _data is null or jsonb_typeof(_data) <> 'object' then
    raise exception 'Registro inválido';
  end if;
  if (select count(*) from jsonb_each(_data)) > 30
     or exists (select 1 from jsonb_each(_data) e where jsonb_typeof(e.value) <> 'number') then
    raise exception 'Registro inválido: apenas números';
  end if;
  insert into public.ai_snapshots (taken_on, data, created_by)
  values (current_date, _data, auth.uid())
  on conflict (taken_on) do update set data = excluded.data, created_by = excluded.created_by,
                                      created_at = now();
end;
$$;

-- Último registro de um dia anterior ao de hoje (para comparar tendências).
create or replace function public.ai_last_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.ai_snapshots;
begin
  perform public.assert_admin();
  select * into s from public.ai_snapshots where taken_on < current_date order by taken_on desc limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object('taken_on', s.taken_on, 'data', s.data);
end;
$$;

revoke all on function public.ai_get_memory() from public, anon;
revoke all on function public.ai_remember(text, text, text, integer) from public, anon;
revoke all on function public.ai_forget(uuid) from public, anon;
revoke all on function public.ai_forget_all() from public, anon;
revoke all on function public.ai_set_memory_enabled(boolean) from public, anon;
revoke all on function public.ai_save_snapshot(jsonb) from public, anon;
revoke all on function public.ai_last_snapshot() from public, anon;
grant execute on function public.ai_get_memory() to authenticated;
grant execute on function public.ai_remember(text, text, text, integer) to authenticated;
grant execute on function public.ai_forget(uuid) to authenticated;
grant execute on function public.ai_forget_all() to authenticated;
grant execute on function public.ai_set_memory_enabled(boolean) to authenticated;
grant execute on function public.ai_save_snapshot(jsonb) to authenticated;
grant execute on function public.ai_last_snapshot() to authenticated;
