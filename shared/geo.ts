// Geometria esférica para Marte: distâncias, rumos e trajetos pelo círculo máximo.
// Sem dependências: usado por front e API.

export const MARS_RADIUS_KM = 3389.5;
/** Quilômetros por grau de arco na superfície de Marte. */
export const KM_PER_DEGREE = (MARS_RADIUS_KM * Math.PI) / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const normLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

/** Distância pelo círculo máximo, em km (arredondada). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(MARS_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Ponto a uma fração t (0 a 1) do caminho mais curto entre dois pontos. */
export function greatCirclePoint(a: LatLng, b: LatLng, t: number): LatLng {
  const φ1 = rad(a.lat);
  const λ1 = rad(a.lng);
  const φ2 = rad(b.lat);
  const λ2 = rad(b.lng);
  const δ =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
      ),
    );
  if (δ < 1e-9) return { lat: a.lat, lng: a.lng };
  const A = Math.sin((1 - t) * δ) / Math.sin(δ);
  const B = Math.sin(t * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: normLng(deg(Math.atan2(y, x))) };
}

/** Rumo inicial (0 a 360, 0 = norte) de a para b. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Ponto a dist km de a, seguindo o rumo informado. */
export function destinationPoint(a: LatLng, bearing: number, dist: number): LatLng {
  const δ = dist / MARS_RADIUS_KM;
  const θ = rad(bearing);
  const φ1 = rad(a.lat);
  const λ1 = rad(a.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: deg(φ2), lng: normLng(deg(λ2)) };
}

const COMPASS = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];
export const compassName = (bearing: number) => COMPASS[Math.round(bearing / 45) % 8]!;

/** Menor distância (km) entre um ponto e o caminho de a até b, e a fração t em que isso ocorre. */
export function closestApproach(
  a: LatLng,
  b: LatLng,
  point: LatLng,
  steps = 96,
): { km: number; t: number } {
  let best = { km: Number.POSITIVE_INFINITY, t: 0 };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = greatCirclePoint(a, b, t);
    const km = distanceKm(p.lat, p.lng, point.lat, point.lng);
    if (km < best.km) best = { km, t };
  }
  return best;
}
