-- ====================================================================
-- ARES MOBILITY: Marketplace & Seminovos Espaciais
-- Migration: 20261029140000_ares_marketplace.sql
-- ====================================================================

create type public.sale_condition as enum ('certified_preowned', 'refurbished', 'factory_new');
create type public.sale_status as enum ('available_for_sale', 'reserved', 'sold');

create table if not exists public.vehicle_sales (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  callsign text not null unique,
  category public.vehicle_category not null,
  price_credits numeric not null,
  sol_manufactured int not null default 4200,
  flight_hours numeric not null default 0,
  hull_integrity_pct int not null default 100,
  battery_condition_pct int not null default 100,
  condition public.sale_condition not null default 'certified_preowned',
  hangar_id uuid references public.hangars(id) on delete set null,
  seller_name text not null default 'ARES Seminovos Oficiais',
  seller_user_id uuid references auth.users(id) on delete set null,
  warranty_sols int not null default 300,
  features text[] not null default '{}',
  status public.sale_status not null default 'available_for_sale',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.vehicle_sales to authenticated;
grant select on public.vehicle_sales to anon;
grant all on public.vehicle_sales to service_role;
alter table public.vehicle_sales enable row level security;

create policy "vehicle sales readable" on public.vehicle_sales
  for select using (true);

create policy "sellers can manage own listings" on public.vehicle_sales
  for all to authenticated
  using (auth.uid() = seller_user_id)
  with check (auth.uid() = seller_user_id);

-- Tabela de aquisições definitivas / títulos de propriedade
create table if not exists public.vehicle_purchases (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.vehicle_sales(id),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  price_paid_credits numeric not null,
  quantum_master_key text not null,
  created_at timestamptz not null default now()
);

grant select, insert on public.vehicle_purchases to authenticated;
grant all on public.vehicle_purchases to service_role;
alter table public.vehicle_purchases enable row level security;

create policy "buyers can view own title deeds" on public.vehicle_purchases
  for select to authenticated
  using (auth.uid() = buyer_user_id);
