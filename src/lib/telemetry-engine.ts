import { useState, useEffect, useRef } from "react";
import { marsDistanceKm, type Hangar, type Vehicle, type WeatherEvent } from "@/lib/ares-data";

export interface SimulatedVehicle extends Vehicle {
  simSpeedKmh: number;
  simAltitudeKm: number;
  inStorm: boolean;
  stormSeverityWarning?: number;
}

export interface SimulatedStorm extends WeatherEvent {
  pulseRadiusKm: number;
}

export interface TelemetryState {
  simulatedVehicles: SimulatedVehicle[];
  simulatedStorms: SimulatedStorm[];
  activeAlerts: Array<{
    id: string;
    message: string;
    severity: "info" | "warning" | "danger";
    solTime: string;
  }>;
  telemetryTicks: number;
}

/** Interpolação esférica SLERP simplificada entre duas coordenadas areográficas */
function interpolateCoord(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  progress: number,
): [number, number] {
  const p = Math.max(0, Math.min(1, progress));
  const lat = lat1 + (lat2 - lat1) * p;
  const lng = lng1 + (lng2 - lng1) * p;
  return [lat, lng];
}

export function useLiveTelemetry(vehicles: Vehicle[], weather: WeatherEvent[], hangars: Hangar[]) {
  const [state, setState] = useState<TelemetryState>({
    simulatedVehicles: vehicles.map((v) => ({
      ...v,
      simSpeedKmh:
        v.speed_kmh ||
        (v.status === "in_flight"
          ? v.category === "interplanetary_rocket"
            ? 14200
            : v.category === "car_vtol"
              ? 640
              : 210
          : 0),
      simAltitudeKm:
        v.altitude_km ||
        (v.status === "in_flight" ? (v.category === "interplanetary_rocket" ? 64 : 2.2) : 0),
      inStorm: false,
    })),
    simulatedStorms: weather.map((w) => ({
      ...w,
      pulseRadiusKm: Number(w.radius_km),
    })),
    activeAlerts: [],
    telemetryTicks: 0,
  });

  const progressRef = useRef<Record<string, number>>({});
  const directionRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // Inicializa progresso de cada veículo em voo
    vehicles.forEach((v) => {
      if (!(v.id in progressRef.current)) {
        progressRef.current[v.id] = Math.random();
        directionRef.current[v.id] = Math.random() > 0.5 ? 1 : -1;
      }
    });

    const interval = setInterval(() => {
      setState((prev) => {
        const ticks = prev.telemetryTicks + 1;
        const timeSec = ticks * 1.5;

        // 1. Simulação das Tempestades (pulsação e deriva atmosférica)
        const updatedStorms: SimulatedStorm[] = weather.map((w, idx) => {
          const oscillation = Math.sin(timeSec * 0.4 + idx) * (Number(w.radius_km) * 0.08);
          const driftLat = Math.sin(timeSec * 0.1 + idx) * 0.12;
          const driftLng = Math.cos(timeSec * 0.12 + idx) * 0.18;
          return {
            ...w,
            lat: w.lat + driftLat,
            lng: w.lng + driftLng,
            pulseRadiusKm: Math.round(Number(w.radius_km) + oscillation),
          };
        });

        const newAlerts: TelemetryState["activeAlerts"] = [];

        // 2. Simulação de Veículos em voo
        const updatedVehicles: SimulatedVehicle[] = vehicles.map((v) => {
          let lat = v.lat;
          let lng = v.lng;
          let speed =
            v.status === "in_flight"
              ? v.category === "interplanetary_rocket"
                ? 14200
                : v.category === "car_vtol"
                  ? 640
                  : 210
              : 0;
          let alt =
            v.altitude_km ||
            (v.status === "in_flight" ? (v.category === "interplanetary_rocket" ? 64 : 2.2) : 0);

          if (v.status === "in_flight") {
            // Movimenta o veículo entre os dois primeiros hangares ou coordenadas
            const h1 = hangars[0] ?? { lat: 18.65, lng: -133.8 };
            const h2 = hangars[1] ?? { lat: 18.38, lng: 77.58 };

            const dir = directionRef.current[v.id] ?? 1;
            let p = (progressRef.current[v.id] ?? 0) + 0.003 * dir;
            if (p >= 1) {
              p = 1;
              directionRef.current[v.id] = -1;
            } else if (p <= 0) {
              p = 0;
              directionRef.current[v.id] = 1;
            }
            progressRef.current[v.id] = p;

            const [nLat, nLng] = interpolateCoord(h1.lat, h1.lng, h2.lat, h2.lng, p);
            lat = nLat;
            lng = nLng;
            // Efeito de altitude dinâmica (parábola)
            alt = Math.max(
              1.2,
              (v.category === "interplanetary_rocket" ? 70 : 3.5) * Math.sin(p * Math.PI),
            );
          }

          // Checa se intercepta tempestade
          let inStorm = false;
          let stormSeverity: number | undefined;

          for (const s of updatedStorms) {
            if (!s.active) continue;
            const dist = marsDistanceKm(lat, lng, s.lat, s.lng);
            if (dist <= s.pulseRadiusKm) {
              inStorm = true;
              stormSeverity = s.severity;
              speed = Math.round(speed * 0.75); // Vento desacelera veículo
              break;
            }
          }

          if (inStorm && v.status === "in_flight") {
            newAlerts.push({
              id: `${v.id}-storm`,
              message: `ALERTA: ${v.callsign} atravessando tempestade severa (Sev ${stormSeverity}/5). Filtro sob desgaste abrasivo.`,
              severity: "warning",
              solTime: "SOL 4218 · 10:14",
            });
          }

          return {
            ...v,
            lat,
            lng,
            altitude_km: alt,
            simSpeedKmh: speed,
            simAltitudeKm: alt,
            inStorm,
            stormSeverityWarning: stormSeverity,
          };
        });

        return {
          simulatedVehicles: updatedVehicles,
          simulatedStorms: updatedStorms,
          activeAlerts: newAlerts,
          telemetryTicks: ticks,
        };
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [vehicles, weather, hangars]);

  return state;
}
