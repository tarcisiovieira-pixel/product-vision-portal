import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketplaceShowcase } from "@/components/MarketplaceShowcase";
import { Route } from "@/routes/app.marketplace";
import { DEMO_PROFILE, SEED_HANGARS, SEED_VEHICLE_SALES } from "@/lib/ares-seed-data";

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<any>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    createFileRoute: () => (config: any) => ({
      options: config,
      component: config.component,
      ...config,
    }),
    ClientOnly: ({ children }: { children: React.ReactNode }) => children,
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

describe("Marketplace — Compra & Venda de Veículos Espaciais", () => {
  const createTestClient = () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    client.setQueryData(["hangars"], SEED_HANGARS);
    client.setQueryData(["vehicle_sales"], SEED_VEHICLE_SALES);
    client.setQueryData(["profile"], DEMO_PROFILE);
    return client;
  };

  it("renders vehicles for sale with certified condition, price and features", async () => {
    const qc = createTestClient();

    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <MarketplaceShowcase hangars={SEED_HANGARS} currentProfile={DEMO_PROFILE} />
        </QueryClientProvider>,
      );
    });

    expect(screen.getByText(/ARES Seminovos & Concessionária/i)).toBeInTheDocument();
    expect(screen.getByText(/Compre sua Espaçonave Própria em Marte/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anunciar Meu Veículo/i })).toBeInTheDocument();

    // Veículos da concessionária
    expect(screen.getByText(/CC-X2-SEM-01/i)).toBeInTheDocument();
    expect(screen.getByText(/CC-SP-0KM-02/i)).toBeInTheDocument();
    expect(screen.getByText(/AHT-09-MIN-03/i)).toBeInTheDocument();
    expect(screen.getByText(/SSH-S1-ORB-05/i)).toBeInTheDocument();

    // Botões de compra
    const buyBtns = screen.getAllByRole("button", { name: /Comprar Espaçonave/i });
    expect(buyBtns.length).toBeGreaterThan(0);
  });

  it("opens purchase modal and confirms title deed emission", async () => {
    const qc = createTestClient();

    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <MarketplaceShowcase hangars={SEED_HANGARS} currentProfile={DEMO_PROFILE} />
        </QueryClientProvider>,
      );
    });

    const buyBtns = screen.getAllByRole("button", { name: /Comprar Espaçonave/i });
    await act(async () => {
      fireEvent.click(buyBtns[0]!);
    });

    expect(screen.getByText(/Aquisição Definitiva de Veículo/i)).toBeInTheDocument();
    expect(screen.getByText(/Comprador Identificado: ARS-DEMO-01/i)).toBeInTheDocument();

    const confirmPurchaseBtn = screen.getByRole("button", { name: /Confirmar Aquisição/i });
    await act(async () => {
      fireEvent.click(confirmPurchaseBtn);
    });

    expect(screen.getByText(/TÍTULO DE PROPRIEDADE DEFINITIVA EMITIDO/i)).toBeInTheDocument();
    expect(screen.getByText(/REGISTRO DE PROPRIETÁRIO ESPACIAL/i)).toBeInTheDocument();
  });

  it("renders authenticated marketplace page in /app/marketplace", async () => {
    const qc = createTestClient();
    const MarketplacePage = (Route as any).component;

    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <MarketplacePage />
        </QueryClientProvider>,
      );
    });

    expect(screen.getByText(/Compra, Venda e Financiamento de Espaçonaves/i)).toBeInTheDocument();
    expect(screen.getByText(/ARS-DEMO-01/i)).toBeInTheDocument();
  });
});
