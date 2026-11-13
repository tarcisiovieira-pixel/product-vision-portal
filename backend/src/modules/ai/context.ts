import type {
  ConsultContext,
  ConsultHangar,
  ConsultStorm,
  ConsultVehicle,
  License,
} from "../../lib/shared.js";
import type { UserDb } from "../../lib/supabase.js";

/** Catálogo, clima e dados do usuário logado (a RLS garante que o perfil é o dele). */
export async function loadContext(db: UserDb, userId: string): Promise<ConsultContext> {
  const [vehicles, hangars, storms, profiles] = await Promise.all([
    db.list("vehicles", "callsign"),
    db.list("hangars", "name"),
    db.list("weather_events", "severity"),
    db.list("profiles", "created_at"),
  ]);
  const profile = (
    profiles as { user_id: string; pilot_license: License; martian_credits: number }[]
  ).find((p) => p.user_id === userId);
  return {
    vehicles: (vehicles as (ConsultVehicle & { deleted_at?: string | null })[]).filter(
      (v) => !v.deleted_at,
    ),
    hangars: hangars as ConsultHangar[],
    storms: storms as ConsultStorm[],
    license: profile?.pilot_license ?? null,
    credits: profile ? Number(profile.martian_credits) : null,
  };
}
