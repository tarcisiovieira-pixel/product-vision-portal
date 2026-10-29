create type public.pilot_license as enum ('atmospheric','heavy_cargo','orbital');
create type public.vehicle_category as enum ('car_vtol','space_truck','interplanetary_rocket');
create type public.vehicle_status as enum ('available','in_flight','maintenance','storm_hold');

create or replace function public.update_updated_at_column() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  space_credential_id text,
  pilot_license public.pilot_license not null default 'atmospheric',
  martian_credits numeric not null default 25000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = user_id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger profiles_updated before update on public.profiles for each row execute function public.update_updated_at_column();

-- prevent users from editing their own credits
create or replace function public.protect_profile_credits() returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.allow_credit_change', true) is distinct from 'on' then
    new.martian_credits = old.martian_credits;
  end if;
  return new;
end; $$;
create trigger profiles_protect_credits before update on public.profiles for each row execute function public.protect_profile_credits();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare lic text := new.raw_user_meta_data->>'pilot_license';
begin
  insert into public.profiles (user_id, space_credential_id, pilot_license)
  values (new.id, new.raw_user_meta_data->>'space_credential_id',
    case when lic in ('atmospheric','heavy_cargo','orbital') then lic::public.pilot_license else 'atmospheric' end);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.hangars (
  id uuid primary key default gen_random_uuid(),
  name text not null, code text not null unique, sector text not null,
  lat double precision not null, lng double precision not null,
  elevation_km double precision not null default 0,
  storm_alert boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.hangars to authenticated;
grant all on public.hangars to service_role;
alter table public.hangars enable row level security;
create policy "hangars readable" on public.hangars for select to authenticated using (true);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null, callsign text not null unique,
  category public.vehicle_category not null,
  daily_rate_sol numeric not null,
  battery_pct int not null default 100, o2_hours numeric not null default 0, dust_filter_pct int not null default 100,
  status public.vehicle_status not null default 'available',
  hangar_id uuid references public.hangars(id) on delete set null,
  lat double precision not null default 0, lng double precision not null default 0, altitude_km double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select on public.vehicles to authenticated;
grant all on public.vehicles to service_role;
alter table public.vehicles enable row level security;
create policy "vehicles readable" on public.vehicles for select to authenticated using (true);
create trigger vehicles_updated before update on public.vehicles for each row execute function public.update_updated_at_column();

create table public.weather_events (
  id uuid primary key default gen_random_uuid(),
  name text not null, sector text not null, severity int not null default 1,
  wind_speed_kmh numeric not null default 0,
  lat double precision not null, lng double precision not null, radius_km numeric not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.weather_events to authenticated;
grant all on public.weather_events to service_role;
alter table public.weather_events enable row level security;
create policy "weather readable" on public.weather_events for select to authenticated using (true);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  vehicle_id uuid not null references public.vehicles(id),
  pickup_hangar_id uuid not null references public.hangars(id),
  dropoff_hangar_id uuid not null references public.hangars(id),
  start_sol int not null, end_sol int not null,
  total_credits numeric not null,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);
grant select on public.rentals to authenticated;
grant all on public.rentals to service_role;
alter table public.rentals enable row level security;
create policy "own rentals" on public.rentals for select to authenticated using (auth.uid() = user_id);

create or replace function public.book_vehicle(_vehicle_id uuid, _pickup uuid, _dropoff uuid, _start_sol int, _end_sol int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.vehicles; cost numeric; credits numeric; rid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if _end_sol <= _start_sol then raise exception 'Período inválido'; end if;
  select * into v from public.vehicles where id = _vehicle_id for update;
  if v.id is null then raise exception 'Veículo não encontrado'; end if;
  if v.status <> 'available' then raise exception 'Veículo indisponível'; end if;
  cost := v.daily_rate_sol * (_end_sol - _start_sol);
  select martian_credits into credits from public.profiles where user_id = auth.uid() for update;
  if credits is null or credits < cost then raise exception 'Créditos marcianos insuficientes'; end if;
  perform set_config('app.allow_credit_change', 'on', true);
  update public.profiles set martian_credits = martian_credits - cost where user_id = auth.uid();
  perform set_config('app.allow_credit_change', 'off', true);
  insert into public.rentals (user_id, vehicle_id, pickup_hangar_id, dropoff_hangar_id, start_sol, end_sol, total_credits)
  values (auth.uid(), _vehicle_id, _pickup, _dropoff, _start_sol, _end_sol, cost) returning id into rid;
  return rid;
end; $$;
revoke execute on function public.book_vehicle(uuid,uuid,uuid,int,int) from public, anon;
grant execute on function public.book_vehicle(uuid,uuid,uuid,int,int) to authenticated;

alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.weather_events;

insert into public.hangars (name, code, sector, lat, lng, elevation_km, storm_alert) values
('Olympus Mons Hub','OLY-01','Tharsis',18.65,-133.8,21.9,false),
('Jezero Crater Station','JEZ-02','Isidis',18.38,77.58,-2.6,false),
('Valles Marineris Dock','VAL-03','Coprates',-8.0,-70.0,-4.0,false),
('Acidalia Outpost','ACI-04','Acidalia Planitia',46.7,-22.0,-4.1,true),
('Gale Crater Base','GAL-05','Aeolis',-5.4,137.8,-4.5,false);

insert into public.vehicles (name, callsign, category, daily_rate_sol, battery_pct, o2_hours, dust_filter_pct, status, hangar_id, lat, lng, altitude_km)
select v.name, v.callsign, v.category::public.vehicle_category, v.rate, v.bat, v.o2, v.filter, v.status::public.vehicle_status, h.id, v.lat, v.lng, v.alt
from (values
('CyberCab VTOL X2','CC-X2-01','car_vtol',420,92,36,88,'available','OLY-01',18.7,-133.6,0.0),
('CyberCab VTOL X2','CC-X2-02','car_vtol',420,61,22,54,'in_flight','JEZ-02',20.1,74.2,1.8),
('CyberCab VTOL Sport','CC-SP-03','car_vtol',560,100,40,97,'available','GAL-05',-5.3,137.9,0.0),
('Ares Heavy Truck T-9','AHT-09','space_truck',1180,74,120,41,'available','VAL-03',-8.1,-69.8,0.0),
('Ares Heavy Truck T-12','AHT-12','space_truck',1450,38,90,19,'maintenance','VAL-03',-8.0,-70.1,0.0),
('Ares Heavy Truck T-9','AHT-14','space_truck',1180,55,110,62,'storm_hold','ACI-04',46.5,-22.3,0.0),
('Starship Hopper S1','SSH-S1','interplanetary_rocket',48000,100,900,95,'available','OLY-01',18.6,-134.0,0.0),
('Starship Hopper S2','SSH-S2','interplanetary_rocket',52000,83,760,77,'in_flight','GAL-05',-2.0,140.0,64.0)
) as v(name,callsign,category,rate,bat,o2,filter,status,hcode,lat,lng,alt)
join public.hangars h on h.code = v.hcode;

insert into public.weather_events (name, sector, severity, wind_speed_kmh, lat, lng, radius_km, active) values
('Tempestade Acidalia','Acidalia Planitia',4,96,46.0,-25.0,620,true),
('Redemoinho Hellas','Hellas Basin',2,48,-42.0,70.0,180,true),
('Frente de poeira Utopia','Utopia Planitia',3,72,46.0,118.0,400,true),
('Tempestade Noachis (dissipada)','Noachis Terra',1,20,-45.0,-10.0,90,false);