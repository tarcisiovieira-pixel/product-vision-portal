import { describe, expect, it } from "vitest";
import {
  marsDistanceKm,
  isLicenseValidForCategory,
  getRequiredLicense,
  wearScore,
} from "@/lib/ares-data";

describe("Mars Physics & Telemetry Engine Functions", () => {
  it("calculates great-circle distance accurately on Mars", () => {
    // Olympus Mons (18.65, -133.8) to Jezero Crater (18.38, 77.58)
    const dist = marsDistanceKm(18.65, -133.8, 18.38, 77.58);
    expect(dist).toBeGreaterThan(6000);
    expect(dist).toBeLessThan(9000);

    // Mesma coordenada = 0 km
    expect(marsDistanceKm(0, 0, 0, 0)).toBe(0);
  });

  it("validates pilot licenses strictly for each vehicle category", () => {
    // Foguete exige Orbital
    expect(isLicenseValidForCategory("atmospheric", "interplanetary_rocket")).toBe(false);
    expect(isLicenseValidForCategory("heavy_cargo", "interplanetary_rocket")).toBe(false);
    expect(isLicenseValidForCategory("orbital", "interplanetary_rocket")).toBe(true);

    // Caminhão exige Carga Pesada ou Orbital
    expect(isLicenseValidForCategory("atmospheric", "space_truck")).toBe(false);
    expect(isLicenseValidForCategory("heavy_cargo", "space_truck")).toBe(true);
    expect(isLicenseValidForCategory("orbital", "space_truck")).toBe(true);

    // VTOL aceita qualquer licença
    expect(isLicenseValidForCategory("atmospheric", "car_vtol")).toBe(true);
    expect(isLicenseValidForCategory("heavy_cargo", "car_vtol")).toBe(true);
    expect(isLicenseValidForCategory("orbital", "car_vtol")).toBe(true);
  });

  it("returns human-readable license requirement", () => {
    expect(getRequiredLicense("interplanetary_rocket")).toBe("Orbital");
    expect(getRequiredLicense("space_truck")).toBe("Carga Pesada ou Orbital");
    expect(getRequiredLicense("car_vtol")).toBe("Atmosférico");
  });

  it("calculates wear scores correctly", () => {
    // Veículo 100% novo deve ter desgaste 0
    const newVehicle = {
      battery_pct: 100,
      dust_filter_pct: 100,
      o2_hours: 40,
      category: "car_vtol" as const,
    };
    expect(wearScore(newVehicle)).toBe(0);

    // Veículo desgastado
    const wornVehicle = {
      battery_pct: 20,
      dust_filter_pct: 15,
      o2_hours: 5,
      category: "car_vtol" as const,
    };
    expect(wearScore(wornVehicle)).toBeGreaterThan(70);
  });
});
