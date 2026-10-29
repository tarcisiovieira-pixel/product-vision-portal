import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Vehicle = Tables<"vehicles">;
export type Hangar = Tables<"hangars">;
export type WeatherEvent = Tables<"weather_events">;
export type Profile = Tables<"profiles">;
export type Rental = Tables<"rentals">;

async function run<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export const vehiclesQuery = queryOptions({
  queryKey: ["vehicles"],
  queryFn: () => run<Vehicle[]>(supabase.from("vehicles").select("*").order("category").order("callsign")),
});
export const hangarsQuery = queryOptions({
  queryKey: ["hangars"],
  queryFn: () => run<Hangar[]>(supabase.from("hangars").select("*").order("name")),
});
export const weatherQuery = queryOptions({
  queryKey: ["weather"],
  queryFn: () => run<WeatherEvent[]>(supabase.from("weather_events").select("*").order("severity", { ascending: false })),
});
export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
});
export const rentalsQuery = queryOptions({
  queryKey: ["rentals"],
  queryFn: () => run<Rental[]>(supabase.from("rentals").select("*").order("created_at", { ascending: false })),
});

export const categoryLabel: Record<Vehicle["category"], string> = {
  car_vtol: "Carro Voador VTOL",
  space_truck: "Caminhão Espacial",
  interplanetary_rocket: "Foguete Interplanetário",
};
export const statusLabel: Record<Vehicle["status"], string> = {
  available: "Disponível",
  in_flight: "Em voo",
  maintenance: "Manutenção",
  storm_hold: "Retido por tempestade",
};
export const licenseLabel: Record<Profile["pilot_license"], string> = {
  atmospheric: "Atmosférico",
  heavy_cargo: "Carga Pesada",
  orbital: "Orbital",
};

/** Lat/lng in degrees → point on a sphere of radius r (three.js Y-up). */
export function latLngToVec(lat: number, lng: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const th = ((lng + 180) * Math.PI) / 180;
  return [-Math.sin(phi) * Math.cos(th) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(th) * r];
}

/** Maintenance urgency 0–100 from wear signals. */
export function wearScore(v: Pick<Vehicle, "battery_pct" | "dust_filter_pct" | "o2_hours" | "category">) {
  const o2Target = v.category === "interplanetary_rocket" ? 900 : v.category === "space_truck" ? 120 : 40;
  const o2 = Math.min(100, (Number(v.o2_hours) / o2Target) * 100);
  return Math.round(100 - (v.battery_pct * 0.3 + v.dust_filter_pct * 0.45 + o2 * 0.25));
}
