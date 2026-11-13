// Fonte única de verdade sobre o modo demo.
//
// Regra: o modo demo é um "sandbox" local, ativado SOMENTE pelo botão de demo.
// Conta real nunca grava nem lê nada destas chaves.
import type { QueryClient } from "@tanstack/react-query";
import type { Profile, Rental } from "./ares-data";
import { DEMO_PROFILE } from "./ares-seed-data";

const KEYS = {
  session: "ares_demo_session",
  rentals: "ares_demo_rentals",
  maintenance: "ares_local_maintenance_logs",
  sales: "ares_marketplace_sales",
  promo: "ares_active_promo",
  vehicles: "ares_demo_vehicles",
  audit: "ares_demo_audit",
} as const;

export const DEMO_USER_ID = DEMO_PROFILE.user_id;

const hasStorage = () => typeof window !== "undefined" && "localStorage" in window;

function readJson<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (hasStorage()) localStorage.setItem(key, JSON.stringify(value));
}

export function isDemoSession(): boolean {
  return hasStorage() && !!localStorage.getItem(KEYS.session);
}

export function readDemoProfile(): Profile | null {
  return isDemoSession() ? readJson<Profile>(KEYS.session, DEMO_PROFILE) : null;
}

export function writeDemoProfile(profile: Profile): void {
  writeJson(KEYS.session, profile);
}

/** Debita (ou devolve, com valor negativo) créditos do comandante demo. */
export function adjustDemoCredits(delta: number): Profile {
  const profile = readDemoProfile() ?? DEMO_PROFILE;
  const updated = { ...profile, martian_credits: Number(profile.martian_credits) + delta };
  writeDemoProfile(updated);
  return updated;
}

export const readDemoRentals = () => readJson<Rental[]>(KEYS.rentals, []);
export const writeDemoRentals = (rentals: Rental[]) => writeJson(KEYS.rentals, rentals);
export const readDemoMaintenance = <T>() => readJson<T[]>(KEYS.maintenance, []);
export const writeDemoMaintenance = (logs: unknown[]) => writeJson(KEYS.maintenance, logs);
export const readDemoSales = <T>() => readJson<T[]>(KEYS.sales, []);
export const writeDemoSales = (sales: unknown[]) => writeJson(KEYS.sales, sales);
/** Frota editada no demo. null = ainda não editada (vale a frota de exemplo). */
export const readDemoVehicles = <T>() => readJson<T[] | null>(KEYS.vehicles, null);
export const writeDemoVehicles = (vehicles: unknown[]) => writeJson(KEYS.vehicles, vehicles);
export const readDemoAudit = <T>() => readJson<T[]>(KEYS.audit, []);
export const writeDemoAudit = (entries: unknown[]) => writeJson(KEYS.audit, entries);

export function clearDemoState(): void {
  if (!hasStorage()) return;
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}

/** Inicia o sandbox demo do zero, sem herdar nada de uma sessão anterior. */
export function startDemoSession(queryClient?: QueryClient): Profile {
  clearDemoState();
  const now = new Date().toISOString();
  const profile: Profile = { ...DEMO_PROFILE, created_at: now, updated_at: now };
  writeDemoProfile(profile);
  queryClient?.clear();
  return profile;
}

/** Chamar após login/cadastro real: elimina qualquer resquício do demo. */
export function enterRealSession(queryClient?: QueryClient): void {
  clearDemoState();
  queryClient?.clear();
}
