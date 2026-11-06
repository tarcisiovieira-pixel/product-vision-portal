// Dados fictícios do painel no modo demo. Não representam usuários reais.
import type { AdminAuditEntry, AdminOverview, AdminUser } from "./admin";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function demoUser(
  n: number,
  email: string,
  partial: Partial<AdminUser> & { created: number; lastSeen: number | null },
): AdminUser {
  const { created, lastSeen, ...rest } = partial;
  return {
    user_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    email,
    credential: `ARS-${4100 + n}-EXP`,
    pilot_license: "atmospheric",
    credits: 25000,
    reputation: 100,
    flight_hours: 0,
    created_at: daysAgo(created),
    last_sign_in_at: lastSeen === null ? null : daysAgo(lastSeen),
    email_confirmed: true,
    rentals_total: 0,
    rentals_active: 0,
    rentals_cancelled: 0,
    spent: 0,
    suspended: false,
    suspended_reason: null,
    is_admin: false,
    ...rest,
  };
}

export const DEMO_ADMIN_USERS: AdminUser[] = [
  demoUser(1, "comandante@ares.test", {
    created: 62,
    lastSeen: 0,
    pilot_license: "orbital",
    is_admin: true,
    credits: 18400,
    rentals_total: 6,
    rentals_active: 1,
    spent: 248600,
    flight_hours: 412,
  }),
  demoUser(2, "valentina@ares.test", {
    created: 41,
    lastSeen: 1,
    pilot_license: "heavy_cargo",
    credits: 7200,
    rentals_total: 4,
    rentals_active: 1,
    spent: 17800,
    flight_hours: 96,
  }),
  demoUser(3, "rafael@ares.test", {
    created: 38,
    lastSeen: 44,
    credits: 12600,
    rentals_total: 3,
    spent: 12400,
    flight_hours: 58,
  }),
  demoUser(4, "helena@ares.test", {
    created: 33,
    lastSeen: 2,
    credits: 640,
    rentals_total: 5,
    rentals_active: 1,
    spent: 24360,
    flight_hours: 120,
  }),
  demoUser(5, "otavio@ares.test", {
    created: 21,
    lastSeen: 6,
    credits: 21000,
    rentals_total: 3,
    rentals_cancelled: 2,
    spent: 4000,
  }),
  demoUser(6, "marina@ares.test", { created: 9, lastSeen: 9 }),
  demoUser(7, "bruno@ares.test", { created: 5, lastSeen: 3 }),
  demoUser(8, "icaro@ares.test", {
    created: 28,
    lastSeen: 12,
    credits: 300,
    rentals_total: 2,
    spent: 24700,
    suspended: true,
    suspended_reason: "Contestação de cobrança em análise",
  }),
  demoUser(9, "livia@ares.test", { created: 2, lastSeen: null, email_confirmed: false }),
  demoUser(10, "caio@ares.test", { created: 1, lastSeen: null, email_confirmed: false }),
];

const users = DEMO_ADMIN_USERS;
const isoDay = (date: string) => date.slice(0, 10);
const within = (date: string | null, days: number) =>
  !!date && Date.now() - new Date(date).getTime() <= days * 86_400_000;
const sum = (pick: (u: AdminUser) => number) => users.reduce((total, u) => total + pick(u), 0);

// Calculado a partir da lista: os totais precisam bater com a tabela da tela.
const revenue = sum((u) => u.spent);
const rentalsTotal = sum((u) => u.rentals_total);
const cancelled = sum((u) => u.rentals_cancelled);

export const DEMO_ADMIN_OVERVIEW: AdminOverview = {
  generated_at: new Date().toISOString(),
  users: {
    total: users.length,
    confirmed: users.filter((u) => u.email_confirmed).length,
    pending_email: users.filter((u) => !u.email_confirmed).length,
    new_7d: users.filter((u) => within(u.created_at, 7)).length,
    new_30d: users.filter((u) => within(u.created_at, 30)).length,
    active_30d: users.filter((u) => within(u.last_sign_in_at, 30)).length,
    with_rental: users.filter((u) => u.rentals_total > 0).length,
    suspended: users.filter((u) => u.suspended).length,
  },
  rentals: {
    total: rentalsTotal,
    active: sum((u) => u.rentals_active),
    cancelled,
    revenue,
    avg_ticket: Math.round(revenue / (rentalsTotal - cancelled)),
  },
  fleet: { total: 10, available: 7, in_flight: 2, maintenance: 1, storm_hold: 0, occupied: 4 },
  finance: {
    credits_circulating: sum((u) => u.credits),
    maintenance_revenue: 6350,
    marketplace_revenue: 185000,
    marketplace_sales: 1,
  },
  signups_by_day: Array.from({ length: 14 }, (_, i) => {
    const day = isoDay(daysAgo(13 - i));
    return { day, count: users.filter((u) => isoDay(u.created_at) === day).length };
  }),
  top_vehicles: [
    { callsign: "SSH-S1", name: "Starship Hopper S1", rentals: 2, revenue: 240000 },
    { callsign: "AHT-09", name: "Ares Heavy Truck T-9", rentals: 5, revenue: 41200 },
    { callsign: "APX-01", name: "Apex Phantom Hyper-VTOL", rentals: 4, revenue: 26700 },
    { callsign: "CC-X2-02", name: "CyberCab VTOL X2", rentals: 7, revenue: 15360 },
    { callsign: "CC-X2-01", name: "CyberCab VTOL X2", rentals: 5, revenue: 8600 },
  ],
};

export const DEMO_ADMIN_AUDIT: AdminAuditEntry[] = [
  {
    id: "demo-audit-1",
    action: "user_suspended",
    details: { reason: "Contestação de cobrança em análise" },
    created_at: daysAgo(3),
    admin_email: "comandante@ares.test",
    target_email: "icaro@ares.test",
  },
  {
    id: "demo-audit-2",
    action: "credits_adjusted",
    details: { delta: 5000, reason: "Compensação por tempestade" },
    created_at: daysAgo(8),
    admin_email: "comandante@ares.test",
    target_email: "valentina@ares.test",
  },
];
