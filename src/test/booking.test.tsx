import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock Supabase
const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<any>("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: () => (config: any) => ({
      options: config,
      component: config.component,
      ...config,
    }),
    Link: ({ children, to, className }: any) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  };
});

// Mock query options data
vi.mock("@/lib/ares-data", async () => {
  const actual = await vi.importActual<any>("@/lib/ares-data");
  return {
    ...actual,
    vehiclesQuery: { queryKey: ["vehicles"], queryFn: vi.fn() },
    hangarsQuery: { queryKey: ["hangars"], queryFn: vi.fn() },
    weatherQuery: { queryKey: ["weather"], queryFn: vi.fn() },
    rentalsQuery: { queryKey: ["rentals"], queryFn: vi.fn() },
    profileQuery: { queryKey: ["profile"], queryFn: vi.fn() },
  };
});

import { Route } from "@/routes/app.booking";
const Booking = (Route as any).component;

const mockVehicles = [
  {
    id: "veh-1",
    name: "CyberCab VTOL X2",
    callsign: "CC-X2-01",
    category: "car_vtol",
    daily_rate_sol: 420,
    battery_pct: 95,
    o2_hours: 36,
    dust_filter_pct: 88,
    cabin_pressure_kpa: 101.3,
    status: "available",
    hangar_id: "hng-1",
    lat: 18.7,
    lng: -133.6,
    altitude_km: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "veh-2",
    name: "Starship Hopper S1",
    callsign: "SSH-S1",
    category: "interplanetary_rocket",
    daily_rate_sol: 48000,
    battery_pct: 100,
    o2_hours: 900,
    dust_filter_pct: 95,
    cabin_pressure_kpa: 101.3,
    status: "available",
    hangar_id: "hng-1",
    lat: 18.6,
    lng: -134.0,
    altitude_km: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockHangars = [
  {
    id: "hng-1",
    name: "Olympus Mons Hub",
    code: "OLY-01",
    sector: "Tharsis",
    lat: 18.65,
    lng: -133.8,
    elevation_km: 21.9,
    storm_alert: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "hng-2",
    name: "Jezero Crater Station",
    code: "JEZ-02",
    sector: "Isidis",
    lat: 18.38,
    lng: 77.58,
    elevation_km: -2.6,
    storm_alert: false,
    created_at: new Date().toISOString(),
  },
];

const mockWeather = [
  {
    id: "wea-1",
    name: "Tempestade Acidalia",
    sector: "Acidalia Planitia",
    severity: 2,
    wind_speed_kmh: 45,
    radiation_msv: 0.18,
    lat: 46.0,
    lng: -25.0,
    radius_km: 300,
    active: false,
    created_at: new Date().toISOString(),
  },
];

const mockRentals = [
  {
    id: "rnt-1",
    vehicle_id: "veh-1",
    pickup_hangar_id: "hng-1",
    dropoff_hangar_id: "hng-2",
    start_sol: 4219,
    end_sol: 4222,
    total_credits: 1620,
    silica_insurance: true,
    extra_o2_tank: false,
    neural_autopilot_l5: false,
    extra_eva_suits: 1,
    quantum_key: "Q-KEY#8F4A92",
    status: "confirmed",
    created_at: new Date().toISOString(),
    user_id: "user-1",
  },
];

const mockProfileAtmospheric = {
  id: "prof-1",
  user_id: "user-1",
  space_credential_id: "ARS-4218-ALPHA",
  pilot_license: "atmospheric",
  martian_credits: 25000,
  safety_reputation_score: 100,
  flight_hours: 42,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("Booking route component", () => {
  it("renders booking screen with addons, distance and license compatibility", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    qc.setQueryData(["vehicles"], mockVehicles);
    qc.setQueryData(["hangars"], mockHangars);
    qc.setQueryData(["weather"], mockWeather);
    qc.setQueryData(["rentals"], mockRentals);
    qc.setQueryData(["profile"], mockProfileAtmospheric);

    mockRpc.mockResolvedValue({ data: "new-rental-id", error: null });

    render(
      <QueryClientProvider client={qc}>
        <Booking />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/Para onde vamos voar hoje\?/i)).toBeInTheDocument();
    expect(screen.getByText("CyberCab VTOL X2")).toBeInTheDocument();
    expect(screen.getByText("Starship Hopper S1")).toBeInTheDocument();
    expect(screen.getByText(/Seguro de Sílica/i)).toBeInTheDocument();
    expect(screen.getByText(/Distância Great-Circle/i)).toBeInTheDocument();

    // Veículo VTOL deve estar compatível com licença atmosférica
    const bookButtons = screen.getAllByRole("button", { name: /Reservar Agora/i });
    expect(bookButtons.length).toBeGreaterThan(0);
    fireEvent.click(bookButtons[0]);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        "book_vehicle",
        expect.objectContaining({
          _vehicle_id: "veh-1",
          _pickup: "hng-1",
          _dropoff: "hng-1",
          _start_sol: 4219,
          _end_sol: 4222,
          _silica_insurance: true,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Reserva confirmada!/i)).toBeInTheDocument();
    });
  });

  it("blocks booking of rocket for colonist without orbital license", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    qc.setQueryData(["vehicles"], mockVehicles);
    qc.setQueryData(["hangars"], mockHangars);
    qc.setQueryData(["weather"], mockWeather);
    qc.setQueryData(["rentals"], mockRentals);
    qc.setQueryData(["profile"], mockProfileAtmospheric); // Licença atmosférica

    render(
      <QueryClientProvider client={qc}>
        <Booking />
      </QueryClientProvider>,
    );

    // Starship exige licença Orbital
    expect(screen.getByText(/Exige Licença Orbital/i)).toBeInTheDocument();
    const disabledButton = screen.getByRole("button", { name: /Requer Licença Orbital/i });
    expect(disabledButton).toBeDisabled();
  });

  it("opens quantum boarding pass modal with remote vehicle controls", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    qc.setQueryData(["vehicles"], mockVehicles);
    qc.setQueryData(["hangars"], mockHangars);
    qc.setQueryData(["weather"], mockWeather);
    qc.setQueryData(["rentals"], mockRentals);
    qc.setQueryData(["profile"], mockProfileAtmospheric);

    render(
      <QueryClientProvider client={qc}>
        <Booking />
      </QueryClientProvider>,
    );

    const keyButton = screen.getByRole("button", { name: /Chave Quântica/i });
    fireEvent.click(keyButton);

    expect(screen.getByText(/Boarding Pass Quântico/i)).toBeInTheDocument();
    expect(screen.getAllByText("Q-KEY#8F4A92").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Destravar Esclusa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pré-pressurizar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chamar Autopiloto/i })).toBeInTheDocument();

    // Clica em destravar esclusa
    const unlockBtn = screen.getByRole("button", { name: /Destravar Esclusa/i });
    fireEvent.click(unlockBtn);

    expect(screen.getByText(/Esclusa de ar principal destravada/i)).toBeInTheDocument();
  });
});
