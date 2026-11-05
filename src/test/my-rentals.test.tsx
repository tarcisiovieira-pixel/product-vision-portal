import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock Supabase
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: mockUpdate,
    }),
  },
}));

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<any>("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: () => (config: any) => ({ options: config, component: config.component, ...config }),
    Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>,
    useNavigate: () => vi.fn(),
  };
});

// Mock query options data
vi.mock("@/lib/ares-data", async () => {
  const actual = await vi.importActual<any>("@/lib/ares-data");
  return {
    ...actual,
    vehiclesQuery: { queryKey: ["vehicles"], queryFn: () => Promise.resolve([]) },
    hangarsQuery: { queryKey: ["hangars"], queryFn: () => Promise.resolve([]) },
    rentalsQuery: { queryKey: ["rentals"], queryFn: () => Promise.resolve([]) },
    profileQuery: { queryKey: ["profile"], queryFn: () => Promise.resolve(null) },
  };
});

import { Route } from "@/routes/app.my-rentals";
const MyRentals = (Route as any).component;

const mockVehicles = [
  {
    id: "veh-vtol-2",
    name: "CyberCab VTOL Interceptor",
    callsign: "CC-X2-02",
    category: "car_vtol",
    daily_rate_sol: 450,
    battery_pct: 78,
    o2_hours: 48,
    dust_filter_pct: 91,
    cabin_pressure_kpa: 101.3,
    status: "in_flight",
    speed_kmh: 640,
    altitude_km: 8.5,
    hangar_id: "hng-1",
  },
  {
    id: "veh-vtol-3",
    name: "CyberCab VTOL Sport",
    callsign: "CC-SP-03",
    category: "car_vtol",
    daily_rate_sol: 520,
    battery_pct: 100,
    o2_hours: 40,
    dust_filter_pct: 97,
    cabin_pressure_kpa: 101.3,
    status: "available",
    speed_kmh: 0,
    altitude_km: 0,
    hangar_id: "hng-1",
  },
];

const mockHangars = [
  {
    id: "hng-1",
    name: "Hangar Olympus Alpha",
    code: "OLY-01",
    region: "Olympus Mons",
    lat: 18.65,
    lng: -133.8,
  },
  {
    id: "hng-2",
    name: "Hangar Marineris Port",
    code: "VAL-02",
    region: "Valles Marineris",
    lat: -14.0,
    lng: -59.2,
  },
];

const mockRentals = [
  {
    id: "rent-test-01",
    user_id: "usr-01",
    vehicle_id: "veh-vtol-2",
    pickup_hangar_id: "hng-1",
    return_hangar_id: "hng-2",
    start_sol: 742,
    end_sol: 745,
    total_credits: 1350,
    status: "in_flight",
    quantum_key: "QK-ARES-8831-VAL",
    addons: ["silica_insurance", "extra_o2"],
  },
  {
    id: "rent-test-02",
    user_id: "usr-01",
    vehicle_id: "veh-vtol-3",
    pickup_hangar_id: "hng-1",
    return_hangar_id: "hng-1",
    start_sol: 746,
    end_sol: 748,
    total_credits: 1040,
    status: "confirmed",
    quantum_key: "QK-ARES-9942-OLY",
    addons: ["autopilot_ai"],
  },
];

describe("MyRentals component", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    qc.setQueryData(["vehicles"], mockVehicles);
    qc.setQueryData(["hangars"], mockHangars);
    qc.setQueryData(["rentals"], mockRentals);
    qc.setQueryData(["profile"], { id: "usr-01", full_name: "Comandante Shepard", credits_balance: 50000 });
  });

  it("renders page header and pilot metrics summary cards", () => {
    render(
      <QueryClientProvider client={qc}>
        <MyRentals />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Minhas Reservas")).toBeInTheDocument();
    expect(screen.getByText(/Histórico de Frota/i)).toBeInTheDocument();
    expect(screen.getByText("Total de Reservas")).toBeInTheDocument();
    expect(screen.getByText(/Reservas Ativas \/ Voo/i)).toBeInTheDocument();
    expect(screen.getByText("Sols em Missão")).toBeInTheDocument();
    expect(screen.getAllByText(/Créditos Marcianos/i)[0]).toBeInTheDocument();
  });

  it("renders rental cards with vehicle info, itinerary, and quantum key", () => {
    render(
      <QueryClientProvider client={qc}>
        <MyRentals />
      </QueryClientProvider>,
    );

    expect(screen.getByText("CyberCab VTOL Interceptor")).toBeInTheDocument();
    expect(screen.getByText("CyberCab VTOL Sport")).toBeInTheDocument();
    expect(screen.getByText("QK-ARES-8831-VAL")).toBeInTheDocument();
    expect(screen.getByText("QK-ARES-9942-OLY")).toBeInTheDocument();
  });

  it("filters reservations by status when clicking status tabs", () => {
    render(
      <QueryClientProvider client={qc}>
        <MyRentals />
      </QueryClientProvider>,
    );

    // Initial state: both are shown
    expect(screen.getByText("CyberCab VTOL Interceptor")).toBeInTheDocument();
    expect(screen.getByText("CyberCab VTOL Sport")).toBeInTheDocument();

    // Filter to "Em Voo" only
    const flightFilterBtn = screen.getByRole("button", { name: /Em Voo/i });
    fireEvent.click(flightFilterBtn);

    expect(screen.getByText("CyberCab VTOL Interceptor")).toBeInTheDocument();
    expect(screen.queryByText("CyberCab VTOL Sport")).not.toBeInTheDocument();

    // Filter to "Confirmadas" only
    const confirmedFilterBtn = screen.getByRole("button", { name: /Confirmadas/i });
    fireEvent.click(confirmedFilterBtn);

    expect(screen.queryByText("CyberCab VTOL Interceptor")).not.toBeInTheDocument();
    expect(screen.getByText("CyberCab VTOL Sport")).toBeInTheDocument();
  });

  it("opens Boarding Pass modal and triggers quantum vehicle controls", async () => {
    render(
      <QueryClientProvider client={qc}>
        <MyRentals />
      </QueryClientProvider>,
    );

    // Click "Chave Quântica & Controles" on the first rental
    const boardingPassBtns = screen.getAllByRole("button", { name: /Chave Quântica & Controles/i });
    fireEvent.click(boardingPassBtns[0]);

    // Modal should appear
    expect(screen.getByText(/Boarding Pass Quântico/i)).toBeInTheDocument();
    expect(screen.getByText(/TELEMETRIA & COMANDOS REMOTOS/i)).toBeInTheDocument();

    // Trigger Destravar Esclusa
    const unlockBtn = screen.getByRole("button", { name: /Destravar Esclusa/i });
    fireEvent.click(unlockBtn);

    expect(screen.getByText(/Esclusa despressurizada e destravada para embarque/i)).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: /Fechar/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/TELEMETRIA & COMANDOS REMOTOS/i)).not.toBeInTheDocument();
    });
  });

  it("applies promotional coupon and stores active promo in localStorage", () => {
    render(
      <QueryClientProvider client={qc}>
        <MyRentals />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/APEX-VIP35/i)).toBeInTheDocument();
    expect(screen.getByText(/ESCUDO-ZERO/i)).toBeInTheDocument();

    const applyBtn = screen.getByRole("button", { name: /Usar Cupom APEX-VIP35/i });
    fireEvent.click(applyBtn);

    const activePromo = JSON.parse(localStorage.getItem("ares_active_promo") || "{}");
    expect(activePromo.coupon).toBe("APEX-VIP35");
  });

  it("extends rental duration when clicking Estender (+1 Sol)", async () => {
    render(
      <QueryClientProvider client={qc}>
        <MyRentals />
      </QueryClientProvider>,
    );

    const extendButtons = screen.getAllByRole("button", { name: /Estender/i });
    fireEvent.click(extendButtons[0]);

    const storedRentals = JSON.parse(localStorage.getItem("ares_demo_rentals") || "[]");
    expect(storedRentals.length).toBeGreaterThan(0);
    expect(storedRentals[0].end_sol).toBe(746); // 745 + 1
  });
});
