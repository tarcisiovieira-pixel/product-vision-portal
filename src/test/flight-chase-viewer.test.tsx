import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlightChaseViewer3D } from "@/components/FlightChaseViewer3D";
import { SEED_HANGARS, SEED_VEHICLES } from "@/lib/ares-seed-data";

// Mock @react-three/fiber and @react-three/drei
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: () => {},
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => <div data-testid="orbit-controls" />,
  Sparkles: () => <div data-testid="sparkles" />,
  Stars: () => <div data-testid="stars" />,
}));

describe("FlightChaseViewer3D interactive component", () => {
  const vtolCar = SEED_VEHICLES[0]; // CyberCab VTOL X2
  const hangars = SEED_HANGARS;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders flight chase telemetry HUD with speed, altitude, and coordinates", () => {
    render(
      <FlightChaseViewer3D
        vehicle={vtolCar}
        allVehicles={SEED_VEHICLES}
        hangars={hangars}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText("CyberCab VTOL X2")[0]).toBeInTheDocument();
    expect(screen.getAllByText("CC-X2-01")[0]).toBeInTheDocument();
    expect(screen.getByText(/DIRETOR DE VOO/i)).toBeInTheDocument();
    expect(screen.getByText(/COORD AREOGRÁFICA/i)).toBeInTheDocument();
    expect(screen.getByText(/ITINERÁRIO DA NAVE/i)).toBeInTheDocument();
  });

  it("toggles camera modes between Chase, Cockpit, and 360 Orbit", () => {
    render(
      <FlightChaseViewer3D
        vehicle={vtolCar}
        allVehicles={SEED_VEHICLES}
        hangars={hangars}
        onClose={vi.fn()}
      />,
    );

    const chaseBtn = screen.getByText(/Chase Cam/i);
    const cockpitBtn = screen.getByText(/Cockpit HUD/i);
    const orbitBtn = screen.getByText(/Inspeção Livre 360°/i);

    expect(chaseBtn).toBeInTheDocument();
    expect(cockpitBtn).toBeInTheDocument();
    expect(orbitBtn).toBeInTheDocument();

    // Switch to Cockpit
    fireEvent.click(cockpitBtn);
    expect(cockpitBtn.className).toContain("text-telemetry");

    // Switch to Orbit
    fireEvent.click(orbitBtn);
    expect(orbitBtn.className).toContain("text-telemetry");
  });

  it("activates turbo plasma boost increasing speed and visual indicators", () => {
    render(
      <FlightChaseViewer3D
        vehicle={vtolCar}
        allVehicles={SEED_VEHICLES}
        hangars={hangars}
        onClose={vi.fn()}
      />,
    );

    const boostBtn = screen.getByText(/ATIVAR TURBO PLASMA/i);
    expect(boostBtn).toBeInTheDocument();

    fireEvent.click(boostBtn);
    expect(screen.getByText(/TURBO ATIVO/i)).toBeInTheDocument();
  });

  it("allows switching vehicles in flight from flying car to Starship rocket", () => {
    const handleSelectVehicle = vi.fn();
    const handleNavigateHangar = vi.fn();
    const inFlightVehicles = SEED_VEHICLES.map((v) =>
      v.callsign === "SSH-S1" ? { ...v, status: "in_flight" as const, speed_kmh: 14200 } : v,
    );

    render(
      <FlightChaseViewer3D
        vehicle={vtolCar}
        allVehicles={inFlightVehicles}
        hangars={hangars}
        onClose={vi.fn()}
        onSelectVehicle={handleSelectVehicle}
        onNavigateHangar={handleNavigateHangar}
      />,
    );

    const rocketButton = screen.getByRole("button", { name: /SSH-S1/i });
    expect(rocketButton).toBeInTheDocument();

    fireEvent.click(rocketButton);
    expect(handleSelectVehicle).toHaveBeenCalled();
  });

  it("redirects parked vehicles to the garage / Hangar 3D when clicked", () => {
    const handleNavigateHangar = vi.fn();
    const handleClose = vi.fn();

    render(
      <FlightChaseViewer3D
        vehicle={vtolCar}
        allVehicles={SEED_VEHICLES}
        hangars={hangars}
        onClose={handleClose}
        onNavigateHangar={handleNavigateHangar}
      />,
    );

    // CC-X2-01 está na garagem (disponível)
    const parkedButton = screen.getByRole("button", { name: /CC-X2-01/i });
    expect(parkedButton).toBeInTheDocument();

    fireEvent.click(parkedButton);
    expect(handleClose).toHaveBeenCalled();
    expect(handleNavigateHangar).toHaveBeenCalledWith(
      expect.objectContaining({ callsign: "CC-X2-01" }),
    );
  });
});
