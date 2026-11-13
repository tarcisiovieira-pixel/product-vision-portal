// Copiloto de bordo (GPS): navegação, clima à frente, alertas de telemetria e perguntas em
// linguagem natural. Motor determinístico: o modelo de linguagem, quando há, só reformula.
// Os números que o piloto ouve vêm sempre daqui.
import type { ConsultHangar, ConsultStorm } from "./consult.js";
import { hasOffTopicWords, hasTopicWords, SPEED_KMH } from "./consult.js";
import { specsOf, type VehicleCategory } from "./fleet.js";
import {
  bearingDeg,
  closestApproach,
  compassName,
  destinationPoint,
  distanceKm,
  greatCirclePoint,
  type LatLng,
} from "./geo.js";

export interface CopilotVehicle {
  category: VehicleCategory;
  callsign: string;
  name: string;
  model_key?: string | null;
  battery_pct: number;
  o2_hours: number;
  dust_filter_pct: number;
  cabin_pressure_kpa: number;
  thruster_integrity: number;
  heat_shield_pct: number;
  speed_kmh?: number | null;
  range_km?: number | null;
  seats?: number | null;
  cargo_kg?: number | null;
}

export interface CopilotTrip {
  origin: ConsultHangar;
  destination: ConsultHangar;
  /** 0 = saída, 1 = chegada. */
  progress: number;
}

export interface NavState {
  position: LatLng;
  progress: number;
  totalKm: number;
  doneKm: number;
  remainingKm: number;
  speedKmh: number;
  etaHours: number;
  bearing: number;
  heading: string;
  /** Telemetria estimada neste ponto do trajeto (consumo proporcional ao percorrido). */
  batteryPct: number;
  o2Hours: number;
  rangeLeftKm: number;
  arrivalBatteryPct: number;
  arrivalO2Hours: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const nf1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");

export function formatDuration(hours: number): string {
  if (!(hours > 0)) return "0 min";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m === 60 ? `${h + 1} h` : m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  return `${nf1(hours)} h`;
}

export function cruiseSpeed(v: Pick<CopilotVehicle, "category" | "speed_kmh">): number {
  return v.speed_kmh && v.speed_kmh > 0 ? v.speed_kmh : SPEED_KMH[v.category];
}

/** Estado de navegação e telemetria no ponto atual do trajeto. */
export function navState(trip: CopilotTrip, v: CopilotVehicle): NavState {
  const p = clamp(Number.isFinite(trip.progress) ? trip.progress : 0, 0, 1);
  const totalKm = distanceKm(
    trip.origin.lat,
    trip.origin.lng,
    trip.destination.lat,
    trip.destination.lng,
  );
  const position = greatCirclePoint(trip.origin, trip.destination, p);
  const doneKm = totalKm * p;
  const remainingKm = totalKm - doneKm;
  const speedKmh = cruiseSpeed(v);
  const etaHours = remainingKm / speedKmh;
  const range = specsOf({ ...v, model_key: v.model_key }).range_km;
  const used = (doneKm / range) * 100;
  const batteryPct = clamp(v.battery_pct - used, 0, 100);
  const o2Hours = clamp(v.o2_hours - doneKm / speedKmh, 0, 1e9);
  const needPct = (remainingKm / range) * 100;
  const bearing = bearingDeg(position, trip.destination);
  return {
    position,
    progress: p,
    totalKm,
    doneKm,
    remainingKm,
    speedKmh,
    etaHours,
    bearing,
    heading: compassName(bearing),
    batteryPct,
    o2Hours,
    rangeLeftKm: (batteryPct / 100) * range,
    arrivalBatteryPct: batteryPct - needPct,
    arrivalO2Hours: o2Hours - etaHours,
  };
}

// ---------------------------------------------------------------------------
// Clima à frente e desvio
// ---------------------------------------------------------------------------
export interface StormAhead {
  name: string;
  severity: number;
  radiusKm: number;
  center: LatLng;
  /** Distância percorrida até entrar na tempestade (0 se já estiver dentro). */
  distanceKm: number;
  etaMinutes: number;
  inside: boolean;
}

/** Tempestades ativas no trecho que falta, da mais próxima para a mais distante. */
export function stormsAhead(
  nav: NavState,
  trip: CopilotTrip,
  storms: readonly ConsultStorm[],
  minSeverity = 1,
): StormAhead[] {
  const out: StormAhead[] = [];
  for (const s of storms) {
    if (!s.active || s.severity < minSeverity) continue;
    const here = distanceKm(nav.position.lat, nav.position.lng, s.lat, s.lng) <= s.radius_km;
    let entry: number | null = here ? 0 : null;
    if (!here) {
      const steps = 96;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const pt = greatCirclePoint(nav.position, trip.destination, t);
        if (distanceKm(pt.lat, pt.lng, s.lat, s.lng) <= s.radius_km) {
          entry = t * nav.remainingKm;
          break;
        }
      }
    }
    if (entry === null) continue;
    out.push({
      name: s.name,
      severity: s.severity,
      radiusKm: s.radius_km,
      center: { lat: s.lat, lng: s.lng },
      distanceKm: Math.round(entry),
      etaMinutes: Math.round((entry / nav.speedKmh) * 60),
      inside: here,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export interface Detour {
  waypoint: LatLng;
  extraKm: number;
  extraMinutes: number;
  totalKm: number;
  avoids: string;
}

function legClear(a: LatLng, b: LatLng, storms: readonly ConsultStorm[]): boolean {
  return storms.every(
    (s) => !s.active || closestApproach(a, b, { lat: s.lat, lng: s.lng }, 64).km > s.radius_km,
  );
}

/** Desvio por um ponto de passagem que contorna a tempestade com folga, sem cruzar outra. */
export function planDetour(
  nav: NavState,
  trip: CopilotTrip,
  storm: StormAhead,
  storms: readonly ConsultStorm[],
): Detour | null {
  if (storm.inside) return null; // dentro dela, desviar não é uma opção: é sair
  const here = nav.position;
  const dest: LatLng = trip.destination;
  const approach = closestApproach(here, dest, storm.center, 96);
  const away =
    approach.km > 1
      ? bearingDeg(storm.center, greatCirclePoint(here, dest, approach.t))
      : (bearingDeg(here, dest) + 90) % 360;
  for (const margin of [1.25, 1.6, 2.1]) {
    const wp = destinationPoint(storm.center, away, storm.radiusKm * margin);
    if (!legClear(here, wp, storms) || !legClear(wp, dest, storms)) continue;
    const total =
      distanceKm(here.lat, here.lng, wp.lat, wp.lng) +
      distanceKm(wp.lat, wp.lng, dest.lat, dest.lng);
    const extra = Math.max(0, total - nav.remainingKm);
    return {
      waypoint: wp,
      extraKm: Math.round(extra),
      extraMinutes: Math.round((extra / nav.speedKmh) * 60),
      totalKm: Math.round(total),
      avoids: storm.name,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hangares próximos (pouso de emergência)
// ---------------------------------------------------------------------------
export interface NearHangar {
  hangar: ConsultHangar;
  km: number;
  heading: string;
  /** A bateria atual alcança, com 10% de folga? */
  reachable: boolean;
}

export function nearestHangars(
  position: LatLng,
  hangars: readonly ConsultHangar[],
  rangeLeftKm: number,
  count = 3,
): NearHangar[] {
  return hangars
    .map((h) => {
      const km = distanceKm(position.lat, position.lng, h.lat, h.lng);
      return {
        hangar: h,
        km,
        heading: compassName(bearingDeg(position, h)),
        reachable: km * 1.1 <= rangeLeftKm,
      };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
export type AlertSeverity = "critical" | "warning" | "info";

export interface CopilotAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface CopilotContext {
  trip: CopilotTrip;
  vehicle: CopilotVehicle;
  storms: readonly ConsultStorm[];
  hangars: readonly ConsultHangar[];
  /** Preferência da memória: evitar tempestades mesmo as leves. */
  avoidStorms?: boolean;
}

export interface CopilotSnapshot {
  nav: NavState;
  ahead: StormAhead[];
  detour: Detour | null;
  near: NearHangar[];
  alerts: CopilotAlert[];
}

const RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function snapshot(ctx: CopilotContext): CopilotSnapshot {
  const { trip, vehicle, storms, hangars } = ctx;
  const nav = navState(trip, vehicle);
  const ahead = stormsAhead(nav, trip, storms, ctx.avoidStorms ? 2 : 1);
  const relevant = ahead.filter((s) => s.severity >= (ctx.avoidStorms ? 2 : 3));
  const detour = relevant[0] ? planDetour(nav, trip, relevant[0], storms) : null;
  const near = nearestHangars(nav.position, hangars, nav.rangeLeftKm);
  const alerts: CopilotAlert[] = [];

  const first = relevant[0];
  if (first) {
    const close = first.inside || first.distanceKm <= 300;
    const how = first.inside
      ? "Você está dentro dela: reduza a velocidade e saia pelo lado mais próximo."
      : detour
        ? `Desvio disponível: +${nf(detour.extraKm)} km (cerca de ${formatDuration(detour.extraMinutes / 60)} a mais).`
        : `Sem desvio seguro: pouse em ${near[0]?.hangar.name ?? "o hangar mais próximo"}.`;
    alerts.push({
      id: `storm:${first.name}`,
      severity: close ? "critical" : "warning",
      title: first.inside
        ? `Dentro de ${first.name} (nível ${first.severity})`
        : `${first.name} (nível ${first.severity}) à frente`,
      detail: first.inside
        ? how
        : `Em ${nf(first.distanceKm)} km, cerca de ${formatDuration(first.etaMinutes / 60)}. ${how}`,
    });
  }

  if (nav.arrivalBatteryPct < 0) {
    const reach = near.find((n) => n.reachable);
    alerts.push({
      id: "battery:short",
      severity: "critical",
      title: "Bateria não chega ao destino",
      detail: `Autonomia restante ${nf(nav.rangeLeftKm)} km para ${nf(nav.remainingKm)} km de trajeto. ${
        reach
          ? `Pouso recomendado em ${reach.hangar.name}, a ${nf(reach.km)} km (${reach.heading}).`
          : "Nenhum hangar ao alcance: reduza a velocidade para poupar energia."
      }`,
    });
  } else if (nav.arrivalBatteryPct < 15) {
    alerts.push({
      id: "battery:low",
      severity: "warning",
      title: "Bateria chega no limite",
      detail: `Você chega com ${nf(nav.arrivalBatteryPct)}% de bateria. Considere uma parada para recarga.`,
    });
  }

  if (nav.arrivalO2Hours < 0) {
    alerts.push({
      id: "o2:short",
      severity: "critical",
      title: "Oxigênio insuficiente para o trajeto",
      detail: `Restam ${nf1(nav.o2Hours)} h de O₂ e o trajeto pede ${formatDuration(nav.etaHours)}. Pouse em ${near[0]?.hangar.name ?? "o hangar mais próximo"}.`,
    });
  } else if (nav.arrivalO2Hours < 2) {
    alerts.push({
      id: "o2:low",
      severity: "warning",
      title: "Reserva de oxigênio baixa",
      detail: `Você chega com apenas ${nf1(nav.arrivalO2Hours)} h de O₂ de folga.`,
    });
  }

  if (vehicle.cabin_pressure_kpa < 80) {
    alerts.push({
      id: "cabin:critical",
      severity: "critical",
      title: "Pressão da cabine crítica",
      detail: `${nf1(vehicle.cabin_pressure_kpa)} kPa. Use os trajes e pouse imediatamente.`,
    });
  } else if (vehicle.cabin_pressure_kpa < 90) {
    alerts.push({
      id: "cabin:low",
      severity: "warning",
      title: "Pressão da cabine abaixo do normal",
      detail: `${nf1(vehicle.cabin_pressure_kpa)} kPa. Acompanhe e evite altitude elevada.`,
    });
  }

  if (vehicle.thruster_integrity < 40) {
    alerts.push({
      id: "thruster:critical",
      severity: "critical",
      title: "Propulsores degradados",
      detail: `Integridade em ${nf(vehicle.thruster_integrity)}%. Pouse no hangar mais próximo.`,
    });
  } else if (vehicle.thruster_integrity < 65) {
    alerts.push({
      id: "thruster:low",
      severity: "warning",
      title: "Propulsores com desgaste",
      detail: `Integridade em ${nf(vehicle.thruster_integrity)}%. Agende manutenção após o voo.`,
    });
  }

  if (vehicle.category === "interplanetary_rocket") {
    if (vehicle.heat_shield_pct < 50) {
      alerts.push({
        id: "shield:critical",
        severity: "critical",
        title: "Escudo térmico crítico",
        detail: `${nf(vehicle.heat_shield_pct)}%: não é seguro reentrar na atmosfera.`,
      });
    } else if (vehicle.heat_shield_pct < 70) {
      alerts.push({
        id: "shield:low",
        severity: "warning",
        title: "Escudo térmico desgastado",
        detail: `${nf(vehicle.heat_shield_pct)}%. Reentrada com cautela.`,
      });
    }
  }

  if (vehicle.dust_filter_pct < 25) {
    alerts.push({
      id: "filter:low",
      severity: "warning",
      title: "Filtro de poeira saturado",
      detail: `${nf(vehicle.dust_filter_pct)}%. Evite tempestades de sílica até a limpeza.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "nominal",
      severity: "info",
      title: "Rota nominal",
      detail: `Faltam ${nf(nav.remainingKm)} km para ${trip.destination.name}. Chegada em cerca de ${formatDuration(nav.etaHours)}.`,
    });
  }
  alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return { nav, ahead, detour, near, alerts };
}

// ---------------------------------------------------------------------------
// Perguntas em linguagem natural
// ---------------------------------------------------------------------------
export type CopilotTopic =
  | "eta"
  | "battery"
  | "oxygen"
  | "weather"
  | "detour"
  | "emergency"
  | "heading"
  | "status"
  | "speed"
  | "help"
  | "off_topic";

export interface CopilotAnswer {
  topic: CopilotTopic;
  text: string;
}

export const COPILOT_OFF_TOPIC =
  "Sou o copiloto de bordo da ARES: só falo da sua viagem em Marte, como rota, clima, bateria, oxigênio, desvios e pouso. Pergunte, por exemplo, quanto falta para chegar.";

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const FLIGHT_WORDS =
  /\b(chego|chegada|chegar|falta|faltam|eta|rota|rumo|bussola|curso|direcao|bateria|energia|autonomia|oxigenio|o2|ar|tempestade\w*|clima|vento|poeira|desvio|desviar|contornar|alternativa|pouso|pousar|emergencia|socorro|hangar\w*|status|situacao|telemetria|velocidade|km|distancia|voo|viagem|nave|veiculo|cabine|pressao|propulsor\w*|escudo|filtro|piloto|copiloto|gps|navegacao|aviso\w*|alerta\w*|perigo|risco|seguro|tudo bem)\b/;

/** O que o piloto perguntou, por regras. null = não entendi. */
export function classifyQuestion(question: string): CopilotTopic | null {
  const t = plain(question);
  if (
    /\b(emergencia|pouso|pousar|pousa|socorro|hangar mais proximo|onde (posso )?(parar|descer)|preciso parar)\b/.test(
      t,
    )
  )
    return "emergency";
  if (/\b(desvio|desviar|contornar|alternativa|evitar a tempestade|outro caminho)\b/.test(t))
    return "detour";
  if (/\b(tempestade\w*|clima|vento|poeira|previsao|tempo la fora|turbulencia)\b/.test(t))
    return "weather";
  if (/\b(oxigenio|o2|respirar|ar da cabine)\b/.test(t)) return "oxygen";
  if (/\b(bateria|energia|autonomia|carga restante|recarga|combustivel)\b/.test(t))
    return "battery";
  if (/\b(rumo|bussola|curso|direcao|para onde|pra onde|norte|sul|leste|oeste)\b/.test(t))
    return "heading";
  if (/\b(velocidade|rapido|km\/h|quao rapido)\b/.test(t)) return "speed";
  if (
    /\b(quanto falta|quando chego|chegada|chegar|eta|tempo (restante|de viagem)|quantos km|distancia|demora|falta quanto|falta muito)\b/.test(
      t,
    )
  )
    return "eta";
  if (
    /\b(status|situacao|telemetria|como estamos|como esta|tudo bem|resumo|relatorio|alertas?|avisos?|risco|perigo)\b/.test(
      t,
    )
  )
    return "status";
  if (/\b(ajuda|o que voce faz|o que posso perguntar|comandos)\b/.test(t)) return "help";
  return null;
}

/** A pergunta é do escopo do copiloto (viagem em Marte)? */
export function isCopilotTopic(question: string): boolean {
  if (hasOffTopicWords(question)) return false;
  const t = plain(question);
  return FLIGHT_WORDS.test(t) || hasTopicWords(question) || classifyQuestion(question) !== null;
}

export function answerCopilot(
  question: string,
  ctx: CopilotContext,
  snap = snapshot(ctx),
): CopilotAnswer {
  if (!isCopilotTopic(question)) return { topic: "off_topic", text: COPILOT_OFF_TOPIC };
  const topic = classifyQuestion(question) ?? "help";
  const { nav, ahead, detour, near, alerts } = snap;
  const dest = ctx.trip.destination.name;

  switch (topic) {
    case "eta":
      return {
        topic,
        text:
          nav.remainingKm < 1
            ? `Você chegou a ${dest}.`
            : `Faltam ${nf(nav.remainingKm)} km para ${dest}. Chegada em cerca de ${formatDuration(nav.etaHours)}, a ${nf(nav.speedKmh)} km/h.`,
      };
    case "battery": {
      const verdict =
        nav.arrivalBatteryPct < 0
          ? `Atenção: não chega ao destino, faltariam ${nf(-nav.arrivalBatteryPct)}% de bateria.`
          : `Chegando em ${dest}, restariam cerca de ${nf(nav.arrivalBatteryPct)}%.`;
      return {
        topic,
        text: `Bateria em ${nf(nav.batteryPct)}%, com autonomia de ${nf(nav.rangeLeftKm)} km. ${verdict}`,
      };
    }
    case "oxygen": {
      const verdict =
        nav.arrivalO2Hours < 0
          ? `Insuficiente para o trajeto: pouse antes de ${nf1(nav.o2Hours)} h.`
          : `Chegaria com ${nf1(nav.arrivalO2Hours)} h de reserva.`;
      return {
        topic,
        text: `Oxigênio: ${nf1(nav.o2Hours)} h. O trajeto pede ${formatDuration(nav.etaHours)}. ${verdict}`,
      };
    }
    case "weather": {
      if (ahead.length === 0) {
        return { topic, text: `Sem tempestades ativas no trajeto até ${dest}. Céu liberado.` };
      }
      const s = ahead[0]!;
      const where = s.inside
        ? `Você está dentro de ${s.name} (nível ${s.severity}).`
        : `À frente: ${s.name} (nível ${s.severity}), a ${nf(s.distanceKm)} km, cerca de ${formatDuration(s.etaMinutes / 60)}.`;
      const extra =
        ahead.length > 1
          ? ` Há mais ${ahead.length - 1} ${ahead.length === 2 ? "tempestade" : "tempestades"} depois.`
          : "";
      const advice = detour
        ? ` Posso desviar: +${nf(detour.extraKm)} km.`
        : s.severity >= 3 && !s.inside
          ? ` Sem desvio seguro: considere pousar em ${near[0]?.hangar.name ?? "o hangar mais próximo"}.`
          : "";
      return { topic, text: `${where}${extra}${advice}` };
    }
    case "detour": {
      const severe = ahead.find((s) => s.severity >= 1);
      if (!severe)
        return { topic, text: "Não há tempestade no trajeto, então não precisa de desvio." };
      if (severe.inside) {
        return {
          topic,
          text: `Você já está em ${severe.name}. O melhor é sair pelo lado mais próximo e só depois recalcular o desvio.`,
        };
      }
      if (!detour) {
        return {
          topic,
          text: `Não encontrei um desvio seguro em torno de ${severe.name}. Recomendo pousar em ${near[0]?.hangar.name ?? "o hangar mais próximo"}.`,
        };
      }
      return {
        topic,
        text: `Desvio por ${nf1(detour.waypoint.lat)}°, ${nf1(detour.waypoint.lng)}° contorna ${detour.avoids} com folga: +${nf(detour.extraKm)} km, cerca de ${formatDuration(detour.extraMinutes / 60)} a mais. Total ${nf(detour.totalKm)} km.`,
      };
    }
    case "emergency": {
      const list = near
        .map(
          (n) =>
            `${n.hangar.name}, a ${nf(n.km)} km ao ${n.heading}${n.reachable ? "" : " (fora do alcance da bateria)"}${n.hangar.storm_alert ? " [alerta de tempestade]" : ""}`,
        )
        .join("; ");
      const best =
        near.find((n) => n.reachable && !n.hangar.storm_alert) ?? near.find((n) => n.reachable);
      return {
        topic,
        text: `Hangares mais próximos: ${list}. ${best ? `Recomendo ${best.hangar.name}.` : "Nenhum está ao alcance da bateria: reduza a velocidade e peça resgate."}`,
      };
    }
    case "heading":
      return {
        topic,
        text: `Rumo ${nf(nav.bearing)}° (${nav.heading}) para ${dest}, a ${nf(nav.remainingKm)} km.`,
      };
    case "speed":
      return { topic, text: `Velocidade de cruzeiro: ${nf(nav.speedKmh)} km/h.` };
    case "status": {
      const top = alerts[0]!;
      return {
        topic,
        text: `Trajeto em ${nf(nav.progress * 100)}%, bateria ${nf(nav.batteryPct)}%, oxigênio ${nf1(nav.o2Hours)} h. ${
          top.severity === "info" ? "Tudo normal." : `${top.title}: ${top.detail}`
        }`,
      };
    }
    default:
      return {
        topic: "help",
        text: "Posso informar: quanto falta, bateria, oxigênio, clima e tempestades, desvio, hangar para pouso de emergência, rumo e o status geral.",
      };
  }
}
