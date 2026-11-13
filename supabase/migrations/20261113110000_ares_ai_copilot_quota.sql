-- Cota diária também para o copiloto de bordo. Migration aditiva: só amplia os tipos aceitos.

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage
  add constraint ai_usage_kind_check check (kind in ('consult', 'analytics', 'copilot'));

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
  if _kind not in ('consult', 'analytics', 'copilot') then
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
