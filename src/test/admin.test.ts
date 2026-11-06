import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), auth: {} } }));

import { DEMO_ADMIN_OVERVIEW, DEMO_ADMIN_USERS } from "@/lib/admin-demo";
import {
  adjustCredits,
  matchesSegment,
  percent,
  ratio,
  usersToCsv,
  type AdminUser,
} from "@/lib/admin";
import { startDemoSession } from "@/lib/session";

const now = Date.parse("2026-11-07T12:00:00Z");
const base = DEMO_ADMIN_USERS[0]!;
const user = (over: Partial<AdminUser>): AdminUser => ({
  ...base,
  is_admin: false,
  credits: 5000,
  rentals_total: 0,
  rentals_cancelled: 0,
  suspended: false,
  email_confirmed: true,
  last_sign_in_at: "2026-11-06T12:00:00Z",
  ...over,
});

describe("segmentos de atenção", () => {
  it("e-mail pendente", () => {
    expect(matchesSegment(user({ email_confirmed: false }), "pending", now)).toBe(true);
    expect(matchesSegment(user({}), "pending", now)).toBe(false);
  });

  it("nunca reservou exige conta confirmada", () => {
    expect(matchesSegment(user({}), "never_rented", now)).toBe(true);
    expect(matchesSegment(user({ email_confirmed: false }), "never_rented", now)).toBe(false);
    expect(matchesSegment(user({ rentals_total: 1 }), "never_rented", now)).toBe(false);
  });

  it("inativo: já reservou e sumiu há mais de 30 dias", () => {
    const old = "2026-09-01T00:00:00Z";
    expect(matchesSegment(user({ rentals_total: 2, last_sign_in_at: old }), "inactive", now)).toBe(
      true,
    );
    expect(matchesSegment(user({ rentals_total: 2 }), "inactive", now)).toBe(false);
    expect(matchesSegment(user({ last_sign_in_at: old }), "inactive", now)).toBe(false);
  });

  it("saldo baixo", () => {
    expect(matchesSegment(user({ credits: 999 }), "low_balance", now)).toBe(true);
    expect(matchesSegment(user({ credits: 1000 }), "low_balance", now)).toBe(false);
  });

  it("cancela muito: mínimo de 2 e ao menos metade", () => {
    expect(
      matchesSegment(user({ rentals_total: 4, rentals_cancelled: 2 }), "cancels_often", now),
    ).toBe(true);
    expect(
      matchesSegment(user({ rentals_total: 5, rentals_cancelled: 2 }), "cancels_often", now),
    ).toBe(false);
    expect(
      matchesSegment(user({ rentals_total: 1, rentals_cancelled: 1 }), "cancels_often", now),
    ).toBe(false);
  });
});

describe("indicadores", () => {
  it("não divide por zero", () => {
    expect(ratio(0, 0)).toBe(0);
    expect(percent(ratio(1, 3))).toBe("33,3%");
  });
});

describe("exportação CSV", () => {
  it("escapa aspas", () => {
    const csv = usersToCsv([user({ credential: 'A"B' })]);
    expect(csv).toContain('"A""B"');
  });

  it("neutraliza fórmula em campo do usuário", () => {
    const csv = usersToCsv([user({ credential: "=HYPERLINK(1)" })]);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });

  it("não altera números negativos", () => {
    expect(usersToCsv([user({ credits: -5 })])).toContain('"-5"');
  });
});

describe("modo demo", () => {
  it("indicadores batem com a lista de usuários", () => {
    const o = DEMO_ADMIN_OVERVIEW;
    const list = DEMO_ADMIN_USERS;
    const revenue = list.reduce((total, u) => total + u.spent, 0);
    expect(o.users.total).toBe(list.length);
    expect(o.rentals.revenue).toBe(revenue);
    expect(o.top_vehicles.reduce((total, v) => total + v.revenue, 0)).toBe(revenue);
    expect(o.finance.credits_circulating).toBe(list.reduce((t, u) => t + u.credits, 0));
    expect(o.signups_by_day.reduce((t, d) => t + d.count, 0)).toBe(
      list.filter((u) => Date.now() - Date.parse(u.created_at) < 14 * 86_400_000).length,
    );
  });

  it("é somente leitura", async () => {
    startDemoSession();
    await expect(adjustCredits(base.user_id, 100, "teste")).rejects.toThrow(/somente leitura/);
  });
});
