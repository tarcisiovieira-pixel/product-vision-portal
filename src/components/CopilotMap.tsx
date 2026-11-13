import { KM_PER_DEGREE, greatCirclePoint, type LatLng } from "@shared/geo";
import type { ConsultHangar, ConsultStorm } from "@shared/consult";
import type { Detour, NavState } from "@shared/copilot";

const W = 720;
const H = 360;
const x = (lng: number) => ((lng + 180) / 360) * W;
const y = (lat: number) => ((90 - lat) / 180) * H;

/** Trecho do caminho em pontos do mapa; quebra a linha ao cruzar o meridiano de 180°. */
function pathD(from: LatLng, to: LatLng, steps = 72): string {
  let d = "";
  let prev: LatLng | null = null;
  for (let i = 0; i <= steps; i++) {
    const p = greatCirclePoint(from, to, i / steps);
    const jump = prev !== null && Math.abs(p.lng - prev.lng) > 180;
    d += `${i === 0 || jump ? "M" : "L"}${x(p.lng).toFixed(1)} ${y(p.lat).toFixed(1)} `;
    prev = p;
  }
  return d.trim();
}

const stormColor = (severity: number) =>
  severity >= 4 ? "#ef4444" : severity === 3 ? "#f97316" : "#eab308";

/** Mapa de Marte (projeção simples) com a rota, o desvio, as tempestades e o veículo. */
export function CopilotMap({
  hangars,
  storms,
  origin,
  destination,
  nav,
  detour,
}: {
  hangars: readonly ConsultHangar[];
  storms: readonly ConsultStorm[];
  origin: ConsultHangar;
  destination: ConsultHangar;
  nav: NavState;
  detour: Detour | null;
}) {
  const here = nav.position;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Mapa da rota de ${origin.name} a ${destination.name}`}
      className="w-full border border-border/60 bg-background/60"
      data-testid="copilot-map"
    >
      {[-60, -30, 0, 30, 60].map((lat) => (
        <line key={`la${lat}`} x1={0} x2={W} y1={y(lat)} y2={y(lat)} stroke="#ffffff10" />
      ))}
      {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => (
        <line key={`lo${lng}`} y1={0} y2={H} x1={x(lng)} x2={x(lng)} stroke="#ffffff10" />
      ))}

      {storms
        .filter((s) => s.active)
        .map((s) => (
          <g key={s.name}>
            <circle
              cx={x(s.lng)}
              cy={y(s.lat)}
              r={(s.radius_km / KM_PER_DEGREE) * (W / 360)}
              fill={stormColor(s.severity)}
              fillOpacity={0.18}
              stroke={stormColor(s.severity)}
              strokeOpacity={0.7}
            />
            <text x={x(s.lng)} y={y(s.lat)} fontSize="9" fill="#fca5a5" textAnchor="middle">
              {s.name}
            </text>
          </g>
        ))}

      <path
        d={pathD(origin, destination)}
        fill="none"
        stroke="#22d3ee"
        strokeOpacity={0.35}
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <path d={pathD(origin, here)} fill="none" stroke="#22d3ee" strokeWidth={2.5} />
      {detour && (
        <path
          data-testid="copilot-detour"
          d={`${pathD(here, detour.waypoint, 40)} ${pathD(detour.waypoint, destination, 40)}`}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={2}
          strokeDasharray="6 3"
        />
      )}

      {hangars.map((h) => {
        const isEnd = h.id === origin.id || h.id === destination.id;
        return (
          <g key={h.id}>
            <circle
              cx={x(h.lng)}
              cy={y(h.lat)}
              r={isEnd ? 5 : 3}
              fill={h.storm_alert ? "#f97316" : isEnd ? "#22d3ee" : "#94a3b8"}
            />
            <text
              x={x(h.lng) + 7}
              y={y(h.lat) + 3}
              fontSize="9"
              fill={isEnd ? "#e2e8f0" : "#94a3b8"}
            >
              {h.code}
            </text>
          </g>
        );
      })}

      <g
        transform={`translate(${x(here.lng)} ${y(here.lat)}) rotate(${nav.bearing})`}
        data-testid="copilot-vehicle"
      >
        <polygon points="0,-9 6,7 0,3 -6,7" fill="#ff5a1f" stroke="#fff" strokeWidth={1} />
      </g>
    </svg>
  );
}
