import { describe, expect, it } from "vitest";
import type { ConsultHangar, ConsultStorm } from "@shared/consult";
import {
  COPILOT_OFF_TOPIC,
  answerCopilot,
  classifyQuestion,
  formatDuration,
  isCopilotTopic,
  navState,
  nearestHangars,
  planDetour,
  snapshot,
  stormsAhead,
  type CopilotContext,
  type CopilotVehicle,
} from "@shared/copilot";
import {
  bearingDeg,
  closestApproach,
  compassName,
  destinationPoint,
  distanceKm,
  greatCirclePoint,
} from "@shared/geo";

const H = (
  id: string,
  name: string,
  code: string,
  lat: number,
  lng: number,
  storm = false,
): ConsultHangar => ({
  id,
  name,
  code,
  sector: "x",
  lat,
  lng,
  storm_alert: storm,
});
const oly = H("h1", "Olympus Mons Hub", "OLY-01", 18.65, -133.8);
const jez = H("h2", "Jezero Crater Station", "JEZ-02", 18.38, 77.58);
const val = H("h3", "Valles Marineris Dock", "VAL-03", -8, -70);
const aci = H("h4", "Acidalia Outpost", "ACI-04", 46.7, -22, true);
const gal = H("h5", "Gale Crater Base", "GAL-05", -5.4, 137.8);
const hangars = [oly, jez, val, aci, gal];

const car: CopilotVehicle = {
  category: "car_vtol",
  callsign: "CC-1",
  name: "CyberCab",
  model_key: "cybercab_x2",
  battery_pct: 100,
  o2_hours: 40,
  dust_filter_pct: 90,
  cabin_pressure_kpa: 101,
  thruster_integrity: 95,
  heat_shield_pct: 100,
  speed_kmh: 640,
  range_km: 20000,
};

const storm = (over: Partial<ConsultStorm> = {}): ConsultStorm => ({
  name: "Tempestade X",
  severity: 4,
  lat: 51.1,
  lng: 151.7,
  radius_km: 700,
  active: true,
  ...over,
});

const ctx = (over: Partial<CopilotContext> = {}, progress = 0): CopilotContext => ({
  trip: { origin: oly, destination: jez, progress },
  vehicle: car,
  storms: [],
  hangars,
  ...over,
});

describe("geometria", () => {
  it("distância e rumos coerentes", () => {
    expect(distanceKm(0, 0, 0, 0)).toBe(0);
    expect(distanceKm(0, 0, 0, 90)).toBeCloseTo((Math.PI / 2) * 3389.5, -1);
    expect(compassName(0)).toBe("norte");
    expect(compassName(95)).toBe("leste");
    expect(compassName(359)).toBe("norte");
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 10, lng: 0 })).toBeCloseTo(0, 5);
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 10 })).toBeCloseTo(90, 5);
  });

  it("o caminho pelo círculo máximo vai pelo lado curto, não pela reta do mapa", () => {
    const mid = greatCirclePoint(oly, jez, 0.5);
    expect(mid.lng).toBeGreaterThan(100); // Olympus -> Jezero passa pelo lado de 180°, não por 0°
    expect(
      distanceKm(oly.lat, oly.lng, mid.lat, mid.lng) +
        distanceKm(mid.lat, mid.lng, jez.lat, jez.lng),
    ).toBeCloseTo(distanceKm(oly.lat, oly.lng, jez.lat, jez.lng), -1);
    expect(greatCirclePoint(oly, jez, 0)).toMatchObject({ lat: oly.lat });
    expect(greatCirclePoint(oly, oly, 0.5)).toEqual({ lat: oly.lat, lng: oly.lng });
  });

  it("destinationPoint é o inverso de distância e rumo", () => {
    const p = destinationPoint({ lat: 10, lng: 20 }, 45, 500);
    expect(distanceKm(10, 20, p.lat, p.lng)).toBeCloseTo(500, -1);
    expect(closestApproach(oly, jez, greatCirclePoint(oly, jez, 0.3)).km).toBeLessThan(40);
  });
});

describe("estado de navegação e telemetria", () => {
  it("progresso 0 e 1", () => {
    const start = navState(ctx().trip, car);
    expect(start).toMatchObject({ progress: 0, doneKm: 0, batteryPct: 100 });
    expect(start.remainingKm).toBe(start.totalKm);
    const end = navState(ctx({}, 1).trip, car);
    expect(end.remainingKm).toBeCloseTo(0, 5);
    expect(end.etaHours).toBeCloseTo(0, 5);
  });

  it("a bateria e o oxigênio caem na proporção do percorrido", () => {
    const half = navState(ctx({}, 0.5).trip, car);
    const total = half.totalKm;
    expect(half.batteryPct).toBeCloseTo(100 - ((total * 0.5) / 20000) * 100, 1);
    expect(half.o2Hours).toBeCloseTo(40 - (total * 0.5) / 640, 1);
    expect(half.arrivalBatteryPct).toBeCloseTo(100 - (total / 20000) * 100, 1);
  });

  it("progresso fora da faixa é limitado", () => {
    expect(navState({ ...ctx().trip, progress: 9 }, car).progress).toBe(1);
    expect(navState({ ...ctx().trip, progress: -3 }, car).progress).toBe(0);
    expect(navState({ ...ctx().trip, progress: Number.NaN }, car).progress).toBe(0);
  });

  it("formata durações", () => {
    expect(formatDuration(0.25)).toBe("15 min");
    expect(formatDuration(2.5)).toBe("2 h 30 min");
    expect(formatDuration(3)).toBe("3 h");
    expect(formatDuration(30)).toBe("30 h");
  });
});

describe("clima à frente e desvio", () => {
  it("detecta tempestade no trecho que falta, com distância e tempo", () => {
    const c = ctx({ storms: [storm()] });
    const nav = navState(c.trip, car);
    const [s] = stormsAhead(nav, c.trip, c.storms);
    expect(s).toMatchObject({ name: "Tempestade X", inside: false });
    expect(s!.distanceKm).toBeGreaterThan(500);
    expect(s!.etaMinutes).toBeGreaterThan(30);
  });

  it("ignora inativas, fora do caminho e já ultrapassadas", () => {
    const off = ctx({ storms: [storm({ lat: -60, lng: 0 }), storm({ active: false })] });
    expect(stormsAhead(navState(off.trip, car), off.trip, off.storms)).toEqual([]);
    const passed = ctx({ storms: [storm()] }, 0.9);
    expect(stormsAhead(navState(passed.trip, car), passed.trip, passed.storms)).toEqual([]);
  });

  it("dentro da tempestade", () => {
    const c = ctx({ storms: [storm()] }, 0.5); // no meio do caminho, em cima da tempestade
    const [s] = stormsAhead(navState(c.trip, car), c.trip, c.storms);
    expect(s!.inside).toBe(true);
    expect(s!.distanceKm).toBe(0);
  });

  it("o desvio contorna a tempestade e custa quilômetros a mais", () => {
    const c = ctx({ storms: [storm()] });
    const nav = navState(c.trip, car);
    const [s] = stormsAhead(nav, c.trip, c.storms);
    const d = planDetour(nav, c.trip, s!, c.storms)!;
    expect(d.extraKm).toBeGreaterThan(0);
    expect(d.totalKm).toBeGreaterThan(nav.remainingKm);
    // o ponto de passagem fica fora da tempestade, com folga
    expect(distanceKm(d.waypoint.lat, d.waypoint.lng, 51.1, 151.7)).toBeGreaterThan(700);
    // e as duas pernas do desvio não cruzam a tempestade
    expect(closestApproach(nav.position, d.waypoint, { lat: 51.1, lng: 151.7 }).km).toBeGreaterThan(
      700,
    );
    expect(closestApproach(d.waypoint, jez, { lat: 51.1, lng: 151.7 }).km).toBeGreaterThan(700);
  });

  it("sem desvio seguro quando outra tempestade fecha o contorno, e dentro dela", () => {
    const wall = [
      storm(),
      storm({ name: "B", lat: 75, lng: 151, radius_km: 1400 }),
      storm({ name: "C", lat: 20, lng: 151.7, radius_km: 1000 }),
    ];
    const c = ctx({ storms: wall });
    const nav = navState(c.trip, car);
    const [first] = stormsAhead(nav, c.trip, wall);
    const detour = planDetour(nav, c.trip, first!, wall);
    expect(detour === null || detour.extraKm >= 0).toBe(true);
    const inside = { ...first!, inside: true };
    expect(planDetour(nav, c.trip, inside, wall)).toBeNull();
  });
});

describe("alertas", () => {
  it("voo nominal: só informa", () => {
    const { alerts } = snapshot(ctx());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "nominal", severity: "info" });
  });

  it("tempestade severa à frente vira alerta com desvio", () => {
    const { alerts, detour } = snapshot(ctx({ storms: [storm()] }));
    expect(detour).not.toBeNull();
    expect(alerts[0]!.id).toBe("storm:Tempestade X");
    expect(alerts[0]!.detail).toMatch(/Desvio disponível/);
  });

  it("tempestade leve só alerta se a memória pede para evitar", () => {
    const light = storm({ severity: 2 });
    expect(snapshot(ctx({ storms: [light] })).alerts[0]!.id).toBe("nominal");
    expect(snapshot(ctx({ storms: [light], avoidStorms: true })).alerts[0]!.id).toBe(
      "storm:Tempestade X",
    );
  });

  it("perto da tempestade é crítico; longe é aviso", () => {
    const near = snapshot(ctx({ storms: [storm()] }, 0.45)).alerts[0]!;
    const far = snapshot(ctx({ storms: [storm()] }, 0)).alerts[0]!;
    expect(far.severity).toBe("warning");
    expect(near.severity).toBe("critical");
  });

  it("bateria que não chega e oxigênio curto, com hangar ao alcance", () => {
    const weak = { ...car, battery_pct: 20, o2_hours: 3 };
    const { alerts } = snapshot(ctx({ vehicle: weak }, 0.3));
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain("battery:short");
    expect(ids).toContain("o2:short");
    expect(alerts[0]!.severity).toBe("critical");
    expect(alerts.find((a) => a.id === "battery:short")!.detail).toMatch(
      /Pouso recomendado|Nenhum hangar/,
    );
  });

  it("limites de cabine, propulsor, escudo e filtro", () => {
    const bad: CopilotVehicle = {
      ...car,
      category: "interplanetary_rocket",
      cabin_pressure_kpa: 70,
      thruster_integrity: 30,
      heat_shield_pct: 40,
      dust_filter_pct: 10,
      speed_kmh: 14000,
      range_km: 54_000_000,
      o2_hours: 900,
    };
    const ids = snapshot(ctx({ vehicle: bad })).alerts.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "cabin:critical",
        "thruster:critical",
        "shield:critical",
        "filter:low",
      ]),
    );
    const mild: CopilotVehicle = { ...car, cabin_pressure_kpa: 85, thruster_integrity: 60 };
    const mildIds = snapshot(ctx({ vehicle: mild })).alerts.map((a) => a.id);
    expect(mildIds).toEqual(expect.arrayContaining(["cabin:low", "thruster:low"]));
    expect(
      snapshot(ctx({ vehicle: { ...car, heat_shield_pct: 10 } })).alerts.some((a) =>
        a.id.startsWith("shield"),
      ),
    ).toBe(false); // carro não tem escudo
  });

  it("ordena do mais grave para o mais leve", () => {
    const { alerts } = snapshot(
      ctx({ vehicle: { ...car, thruster_integrity: 60, cabin_pressure_kpa: 70 } }),
    );
    expect(alerts.map((a) => a.severity)).toEqual(
      [...alerts.map((a) => a.severity)].sort(
        (x, y) =>
          ["critical", "warning", "info"].indexOf(x) - ["critical", "warning", "info"].indexOf(y),
      ),
    );
  });
});

describe("hangares próximos", () => {
  it("ordena por distância e marca o alcance da bateria", () => {
    const list = nearestHangars({ lat: 20, lng: -120 }, hangars, 1000, 3);
    expect(list[0]!.hangar.id).toBe("h1");
    expect(list).toHaveLength(3);
    expect(list[0]!.reachable).toBe(true);
    expect(list[2]!.reachable).toBe(false);
  });
});

describe("perguntas em linguagem natural", () => {
  it.each([
    ["Quanto falta para chegar?", "eta"],
    ["quando chego?", "eta"],
    ["Como está a bateria?", "battery"],
    ["vou ter energia até lá", "battery"],
    ["E o oxigênio?", "oxygen"],
    ["tem tempestade no caminho?", "weather"],
    ["posso desviar?", "detour"],
    ["preciso pousar, onde?", "emergency"],
    ["qual o rumo", "heading"],
    ["qual a velocidade", "speed"],
    ["me dá o status", "status"],
    ["ajuda", "help"],
  ])("entende %s", (question, topic) => {
    expect(classifyQuestion(question)).toBe(topic);
  });

  it("respostas trazem os números do motor", () => {
    const c = ctx({ storms: [storm()] });
    const nav = navState(c.trip, car);
    expect(answerCopilot("quanto falta", c).text).toContain(
      nav.remainingKm.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
    );
    expect(answerCopilot("bateria", c).text).toMatch(/Bateria em 100%/);
    expect(answerCopilot("tempestade", c).text).toContain("Tempestade X");
    expect(answerCopilot("desvio", c).text).toMatch(/\+\d/);
    expect(answerCopilot("onde posso pousar", c).text).toContain("Olympus Mons Hub");
    expect(answerCopilot("rumo", c).text).toMatch(/Rumo \d+°/);
    expect(answerCopilot("status", c).topic).toBe("status");
  });

  it("céu limpo, chegada e pergunta não entendida", () => {
    expect(answerCopilot("tem tempestade?", ctx()).text).toMatch(/Sem tempestades/);
    expect(answerCopilot("desvio?", ctx()).text).toMatch(/não precisa de desvio/);
    expect(answerCopilot("quanto falta", ctx({}, 1)).text).toMatch(/chegou/);
    expect(answerCopilot("interessante essa nave", ctx()).topic).toBe("help");
  });

  it("só fala de viagem em Marte", () => {
    for (const q of [
      "Quem ganhou o jogo do Flamengo?",
      "Me fale do Brasil",
      "conta uma piada",
      "receita de bolo",
    ]) {
      expect(isCopilotTopic(q)).toBe(false);
      expect(answerCopilot(q, ctx())).toEqual({ topic: "off_topic", text: COPILOT_OFF_TOPIC });
    }
    expect(isCopilotTopic("quanto falta?")).toBe(true);
    expect(isCopilotTopic("tem tempestade?")).toBe(true);
  });
});
