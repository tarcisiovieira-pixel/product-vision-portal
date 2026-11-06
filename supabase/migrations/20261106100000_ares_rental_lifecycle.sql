-- ============================================================================
-- ARES — Ciclo de vida da reserva + vitrine do marketplace
-- Migration ADITIVA. Antes dela, "Estender" e "Cancelar" não persistiam:
-- authenticated não tem UPDATE em rentals, e a tela informava sucesso mesmo assim.
-- ============================================================================

create or replace function public.cancel_rental(_rental_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  r public.rentals;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select * into r from public.rentals
  where id = _rental_id and user_id = auth.uid()
  for update;
  if r.id is null then
    raise exception 'Reserva não encontrada';
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

  select * into v from public.vehicles where id = r.vehicle_id;
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
end;
$$;

revoke execute on function public.cancel_rental(uuid) from public, anon;
revoke execute on function public.extend_rental(uuid, int) from public, anon;
grant execute on function public.cancel_rental(uuid) to authenticated;
grant execute on function public.extend_rental(uuid, int) to authenticated;

-- Vitrine inicial: sem isso o marketplace de contas reais nasce vazio.
insert into public.vehicle_sales (
  name, callsign, category, price_credits, sol_manufactured, flight_hours,
  hull_integrity_pct, battery_condition_pct, condition, hangar_id, seller_name, warranty_sols, features
)
select s.name, s.callsign, s.category::public.vehicle_category, s.price, s.sol, s.hours,
       s.hull, s.battery, s.condition::public.sale_condition,
       (select id from public.hangars order by name limit 1),
       'ARES Seminovos Oficiais', s.warranty, s.features
from (values
  ('CyberCab VTOL X2', 'CC-X2-SEM-DB1', 'car_vtol', 18500, 4120, 840, 98, 94, 'certified_preowned', 300, array['Filtro de sílica novo']),
  ('CyberCab VTOL Sport', 'CC-SP-0KM-DB2', 'car_vtol', 24000, 4215, 12, 100, 100, 'factory_new', 500, array['Zero KM']),
  ('Ares Heavy Truck T-9', 'AHT-09-MIN-DB3', 'space_truck', 96000, 3980, 2150, 94, 89, 'refurbished', 200, array['Blindagem de cânion'])
) as s(name, callsign, category, price, sol, hours, hull, battery, condition, warranty, features)
where not exists (select 1 from public.vehicle_sales v where v.callsign = s.callsign);
