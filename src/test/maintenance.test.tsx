import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock Supabase
const mockRpc = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: () => ({
      update: (...args: any[]) => mockUpdate(...args),
    }),
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
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock Three.js / Canvas component
vi.mock("@/components/HangarScene", () => ({
  default: () => <div data-testid="hangar-scene-mock">Hangar Scene 3D</div>,
}));

// Mock query options data
vi.mock("@/lib/ares-data", async () => {
  const actual = await vi.importActual<any>("@/lib/ares-data");
  return {
    ...actual,
    vehiclesQuery: { queryKey: ["vehicles"], queryFn: vi.fn() },
    maintenanceLogsQuery: { queryKey: ["maintenance_logs"], queryFn: vi.fn() },
    profileQuery: { queryKey: ["profile"], queryFn: vi.fn() },
  };
});

import { Route } from "@/routes/app.maintenance";
const Maintenance = (Route as any).component;

const mockVehicles = [
  {
    id: "veh-1",
    name: "CyberCab VTOL X2",
    callsign: "CC-X2-01",
    category: "car_vtol",
    daily_rate_sol: 420,
    battery_pct: 35, // Crítico
    o2_hours: 12,
    dust_filter_pct: 42, // Crítico
    cabin_pressure_kpa: 101.3,
    thruster_integrity: 85,
    status: "available",
    hangar_id: "hng-1",
    lat: 18.7,
    lng: -133.6,
    altitude_km: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockLogs = [
  {
    id: "log-1",
    vehicle_id: "veh-1",
    user_id: "user-1",
    service_type: "silica_clean",
    status: "completed",
    credits_cost: 450,
    notes: "Limpeza periódica de rotina",
    created_at: new Date().toISOString(),
  },
];

describe("Maintenance route component", () => {
  it("renders diagnostics, hotspots and triggers ultrasonic silica clean", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    qc.setQueryData(["vehicles"], mockVehicles);
    qc.setQueryData(["maintenance_logs"], mockLogs);

    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    render(
      <QueryClientProvider client={qc}>
        <Maintenance />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/Saúde da frota/i)).toBeInTheDocument();
    expect(screen.getByText("CC-X2-01 — CyberCab VTOL X2")).toBeInTheDocument();
    expect(screen.getAllByText(/Filtro Sílica/i).length).toBeGreaterThan(0);

    // Executa limpeza ultrassônica
    const cleanButton = screen.getByRole("button", { name: /Limpeza Ultrassônica/i });
    fireEvent.click(cleanButton);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        "execute_maintenance",
        expect.objectContaining({
          _vehicle_id: "veh-1",
          _service_type: "silica_clean",
        }),
      );
    });
  });
});
