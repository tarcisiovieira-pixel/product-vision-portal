// Ocupação por período. O sol final é exclusivo: uma reserva pode começar
// no sol em que a outra termina. Mesma regra da restrição no banco.
export interface OccupiedPeriod {
  vehicle_id: string;
  start_sol: number;
  end_sol: number;
}

const ACTIVE = new Set(["confirmed", "in_flight"]);

export const isActiveRental = (status: string) => ACTIVE.has(status);

export function isOccupied(
  periods: OccupiedPeriod[],
  vehicleId: string,
  startSol: number,
  endSol: number,
): boolean {
  return periods.some(
    (p) => p.vehicle_id === vehicleId && p.start_sol < endSol && startSol < p.end_sol,
  );
}
