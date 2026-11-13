-- Cota diária das IAs generativas. Só controla custo: o motor de regras não consome cota.
-- Migration aditiva: não altera nenhuma tabela ou função existente.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  kind text not null check (kind in ('consult', 'analytics')),
  used integer not null default 0 check (used >= 0),
  primary key (user_id, day, kind)
);

-- Ninguém lê nem grava direto: o acesso é só pela função abaixo.
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public, anon, authenticated;

-- Consome uma chamada da cota do dia. Devolve false (sem consumir) quando o limite foi atingido.
create or replace function public.ai_take_quota(_kind text, _limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  taken integer;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;
  if _kind not in ('consult', 'analytics') then
    raise exception 'Tipo de IA inválido';
  end if;
  if _limit is null or _limit < 1 or _limit > 1000 then
    raise exception 'Limite inválido';
  end if;

  insert into public.ai_usage (user_id, day, kind, used)
  values (uid, current_date, _kind, 1)
  on conflict (user_id, day, kind)
  do update set used = public.ai_usage.used + 1
  where public.ai_usage.used < _limit
  returning used into taken;

  return taken is not null;
end;
$$;

revoke all on function public.ai_take_quota(text, integer) from public, anon;
grant execute on function public.ai_take_quota(text, integer) to authenticated;
