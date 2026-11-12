// Resposta em texto do consultor quando não há modelo de linguagem (ou como reserva dele).
import type { ConsultResult } from "./consult.js";

const brl = (n: number) => `MC$ ${n.toLocaleString("pt-BR")}`;

export function describeResult(
  result: ConsultResult,
  vehicles: ReadonlyMap<string, { name: string; callsign: string }>,
): string {
  const [best, ...others] = result.recommendations;
  if (!best) {
    const ask = result.missing.length ? ` Para ajudar melhor: ${result.missing[0]}` : "";
    return `${result.notes[0] ?? "Não encontrei um veículo para esse pedido."}${ask}`;
  }
  const v = vehicles.get(best.vehicleId);
  const label = v ? `${v.name} (${v.callsign})` : "o veículo indicado";
  const days = best.days === 1 ? "1 sol" : `${best.days} sóis`;
  const parts = [
    `Minha indicação é ${label}: ${brl(best.estimate.total)} por ${days}${best.addons.length ? ", já com os adicionais necessários" : ""}.`,
  ];
  if (best.reasons[0]) parts.push(best.reasons[0]);
  if (best.route) {
    parts.push(
      `O trajeto tem ${best.route.distanceKm.toLocaleString("pt-BR")} km, cerca de ${best.route.hours} h.`,
    );
  }
  if (best.warnings[0]) parts.push(`Atenção: ${best.warnings[0]}`);
  if (others.length) parts.push(`Veja também as outras ${others.length} opções abaixo.`);
  if (result.missing.length) parts.push(`Para refinar: ${result.missing[0]}`);
  return parts.join(" ");
}
