import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  enabled: true,
  post: vi.fn(),
  get: vi.fn(),
  real: true,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), auth: {} } }));
vi.mock("@/lib/api-client", () => ({
  apiEnabled: () => api.enabled,
  apiGet: api.get,
  apiPost: api.post,
  apiPut: vi.fn(),
}));
vi.mock("@/lib/ares-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ares-data")>()),
  hasRealSession: async () => api.real,
}));

import type { AnalyticsInput } from "@shared/analytics";
import type { ConsultContext, ConsultHangar, ConsultVehicle } from "@shared/consult";
import { UpsellPanel } from "@/components/UpsellPanel";
import { askConsultant, summarizeInsights } from "@/lib/ai";
import { SEED_HANGARS, SEED_VEHICLES, SEED_WEATHER } from "@/lib/ares-seed-data";
import { clearDemoState, startDemoSession } from "@/lib/session";

const ctx = (): ConsultContext => ({
  vehicles: SEED_VEHICLES as unknown as ConsultVehicle[],
  hangars: SEED_HANGARS as unknown as ConsultHangar[],
  storms: SEED_WEATHER as unknown as ConsultContext["storms"],
  license: "orbital",
  credits: 25000,
});

beforeEach(() => {
  localStorage.clear();
  clearDemoState();
  api.enabled = true;
  api.real = true;
  api.post.mockReset();
  api.get.mockReset();
});

describe("consultor", () => {
  it("no demo responde localmente, sem chamar a API", async () => {
    startDemoSession();
    const res = await askConsultant("Somos 2 pessoas, de Olympus para Jezero", ctx());
    expect(res.mode).toBe("rules");
    expect(res.fallbackReason).toBe("modo demo");
    expect(res.reply.length).toBeGreaterThan(10);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("assunto fora do escopo: resposta fixa, sem indicações", async () => {
    startDemoSession();
    for (const text of ["Quem ganhou o jogo do Flamengo?", "Fale sobre o Brasil"]) {
      const res = await askConsultant(text, ctx());
      expect(res.offTopic).toBe(true);
      expect(res.recommendations).toHaveLength(0);
      expect(res.reply).toMatch(/ARES Mobility em Marte/);
    }
  });

  it("conta real usa a API", async () => {
    api.post.mockResolvedValue({
      mode: "llm",
      reply: "ok",
      recommendations: [],
      missing: [],
      notes: [],
    });
    const res = await askConsultant("Quero um carro", ctx());
    expect(res.mode).toBe("llm");
    expect(api.post).toHaveBeenCalledWith("/v1/ai/consult", { message: "Quero um carro" });
  });

  it("se a API falhar, o motor local responde e explica o motivo", async () => {
    api.post.mockRejectedValue(new Error("Não foi possível falar com o servidor."));
    const res = await askConsultant("Somos 2 pessoas, de Olympus para Jezero", ctx());
    expect(res.mode).toBe("rules");
    expect(res.fallbackReason).toMatch(/servidor/);
    expect(res.recommendations.length).toBeGreaterThan(0);
  });

  it("sem API configurada fica no motor local", async () => {
    api.enabled = false;
    const res = await askConsultant("Quero um carro", ctx());
    expect(res.mode).toBe("rules");
    expect(api.post).not.toHaveBeenCalled();
  });
});

const input = (): AnalyticsInput => ({
  users: {
    total: 20,
    confirmed: 14,
    pending_email: 6,
    new_7d: 1,
    active_30d: 5,
    with_rental: 4,
    suspended: 1,
  },
  segments: {
    pending: 6,
    never_rented: 5,
    inactive: 2,
    low_balance: 1,
    cancels_often: 0,
    suspended: 1,
  },
  rentals: { total: 12, active: 2, cancelled: 1, revenue: 50000, avg_ticket: 4000 },
  fleet: { total: 10, available: 7, maintenance: 1, storm_hold: 0, occupied: 2 },
  vehicles: [
    {
      callsign: "CC-1",
      name: "X",
      daily_rate_sol: 400,
      status: "available",
      rentals_total: 3,
      rentals_active: 1,
      revenue: 9000,
      deleted_at: null,
    },
  ],
});

describe("resumo analítico", () => {
  const insights = [
    { id: "a", severity: "warning" as const, title: "Pendentes", detail: "6 de 20" },
  ];

  it("envia só agregados à API (nenhum e-mail, nome ou indicativo)", async () => {
    api.post.mockResolvedValue({ mode: "llm", summary: "ok", priorities: [] });
    await summarizeInsights(input(), insights);
    const [path, body] = api.post.mock.calls[0]!;
    expect(path).toBe("/v1/ai/analytics/summary");
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/@|CC-1/);
    expect(body.totals).toMatchObject({ users: 20, pendingEmail: 6, fleetDown: 1 });
  });

  it("no demo e sem API devolve o resumo de regras", async () => {
    startDemoSession();
    const res = await summarizeInsights(input(), insights);
    expect(res.mode).toBe("rules");
    expect(res.summary).toMatch(/ponto de atenção/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("falha da API cai no resumo de regras", async () => {
    api.post.mockRejectedValue(new Error("fora do ar"));
    const res = await summarizeInsights(input(), insights);
    expect(res).toMatchObject({ mode: "rules", fallbackReason: "fora do ar" });
  });
});

describe("painel de sugestões", () => {
  const hangar = (over: Partial<ConsultHangar>): ConsultHangar => ({
    id: "h1",
    name: "Olympus Mons Hub",
    code: "OLY-01",
    sector: "Tharsis",
    lat: 18.65,
    lng: -133.8,
    storm_alert: false,
    ...over,
  });
  const vehicle: ConsultVehicle = {
    id: "v1",
    name: "CyberCab",
    callsign: "CC-1",
    category: "car_vtol",
    model_key: "cybercab_x2",
    daily_rate_sol: 420,
    hangar_id: "h1",
    status: "available",
    seats: 4,
    cargo_kg: 200,
    range_km: 9000,
    battery_pct: 90,
    dust_filter_pct: 15,
  };
  const draft = (extra = {}) => ({
    vehicle,
    pickup: hangar({}),
    dropoff: null,
    days: 3,
    addons: {},
    storms: [],
    credits: 50000,
    ...extra,
  });

  it("mostra a evidência e o custo, e aplica só quando o cliente pede", () => {
    const apply = vi.fn();
    render(<UpsellPanel draft={draft()} onApplyAddon={apply} />);
    expect(screen.getByText(/filtro de poeira/i)).toBeTruthy();
    expect(screen.getByText(/\+MC\$ 120\/sol/)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(apply).toHaveBeenCalledWith("silica_insurance");
  });

  it("pode ser dispensada", () => {
    render(<UpsellPanel draft={draft()} onApplyAddon={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Dispensar/ }));
    expect(screen.queryByTestId("upsell-panel")).toBeNull();
  });

  it("não aparece quando não há motivo", () => {
    render(
      <UpsellPanel
        draft={draft({ vehicle: { ...vehicle, dust_filter_pct: 90 } })}
        onApplyAddon={() => {}}
      />,
    );
    expect(screen.queryByTestId("upsell-panel")).toBeNull();
  });

  it("obrigatória não pode ser dispensada, e sem saldo o botão trava", () => {
    render(
      <UpsellPanel
        draft={draft({ pickup: hangar({ storm_alert: true }), credits: 100 })}
        onApplyAddon={() => {}}
      />,
    );
    expect(screen.getByText("Obrigatório")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Dispensar: Barreira/ })).toBeNull();
    expect(
      (screen.getAllByRole("button", { name: "Sem saldo" })[0] as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
