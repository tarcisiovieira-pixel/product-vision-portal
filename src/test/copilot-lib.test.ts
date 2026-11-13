import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ enabled: true, post: vi.fn(), real: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), auth: {} } }));
vi.mock("@/lib/api-client", () => ({
  apiEnabled: () => api.enabled,
  apiGet: vi.fn(),
  apiPost: api.post,
  apiPut: vi.fn(),
}));
vi.mock("@/lib/ares-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ares-data")>()),
  hasRealSession: async () => api.real,
}));

import type { ConsultHangar } from "@shared/consult";
import type { CopilotContext, CopilotVehicle } from "@shared/copilot";
import { askCopilot } from "@/lib/copilot";
import { speakable } from "@/lib/voice";
import { SEED_HANGARS, SEED_WEATHER } from "@/lib/ares-seed-data";
import { startDemoSession } from "@/lib/session";

const hangars = SEED_HANGARS as unknown as ConsultHangar[];
const vehicle: CopilotVehicle = {
  category: "car_vtol",
  callsign: "CC-1",
  name: "CyberCab",
  battery_pct: 100,
  o2_hours: 40,
  dust_filter_pct: 90,
  cabin_pressure_kpa: 101,
  thruster_integrity: 95,
  heat_shield_pct: 100,
  speed_kmh: 640,
  range_km: 20000,
};
const ctx = (): CopilotContext => ({
  trip: { origin: hangars[1]!, destination: hangars[0]!, progress: 0.2 },
  vehicle,
  storms: SEED_WEATHER as unknown as CopilotContext["storms"],
  hangars,
});
const ids = { vehicleId: "v", originId: "o", destinationId: "d", progress: 0.2 };

beforeEach(() => {
  localStorage.clear();
  api.enabled = true;
  api.real = true;
  api.post.mockReset();
});

describe("copiloto (cliente)", () => {
  it("no demo responde localmente, sem API", async () => {
    startDemoSession();
    const res = await askCopilot("quanto falta?", ctx(), ids);
    expect(res).toMatchObject({ mode: "rules", topic: "eta", fallbackReason: "modo demo" });
    expect(res.reply).toMatch(/Faltam/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("conta real usa a API com os identificadores da viagem", async () => {
    api.post.mockResolvedValue({ mode: "llm", topic: "eta", reply: "ok" });
    const res = await askCopilot("quanto falta?", ctx(), ids);
    expect(res.mode).toBe("llm");
    expect(api.post).toHaveBeenCalledWith("/v1/ai/copilot", { message: "quanto falta?", ...ids });
  });

  it("se a API falhar, o motor local responde e explica o motivo", async () => {
    api.post.mockRejectedValue(new Error("Não foi possível falar com o servidor."));
    const res = await askCopilot("tem tempestade?", ctx(), ids);
    expect(res.mode).toBe("rules");
    expect(res.fallbackReason).toMatch(/servidor/);
    expect(res.reply).toMatch(/tempest|Utopia|Céu/i);
  });

  it("sem API configurada fica no motor local", async () => {
    api.enabled = false;
    const res = await askCopilot("quanto falta?", ctx(), ids);
    expect(res.mode).toBe("rules");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("assunto fora do escopo: resposta fixa do copiloto", async () => {
    startDemoSession();
    const res = await askCopilot("quem ganhou o jogo do Flamengo?", ctx(), ids);
    expect(res.offTopic).toBe(true);
    expect(res.reply).toMatch(/copiloto de bordo da ARES/);
  });
});

describe("texto falado", () => {
  it("troca símbolos e unidades por palavras e limpa marcação", () => {
    const out = speakable(
      "**Atenção:** 6.238 km, 320 km/h, 101 kPa, rumo 52°, bateria 80%, MC$ 500 🚀",
    );
    expect(out).toBe(
      "Atenção: 6.238 quilômetros, 320 quilômetros por hora, 101 quilopascais, rumo 52 graus, bateria 80 por cento, créditos 500",
    );
  });

  it("limita o tamanho", () => {
    expect(speakable("a ".repeat(500)).length).toBeLessThanOrEqual(400);
  });
});
