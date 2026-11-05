import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route } from "@/routes/index";
import { BookingWizardModal } from "@/components/BookingWizardModal";
import { SEED_HANGARS, SEED_VEHICLES, SEED_WEATHER } from "@/lib/ares-seed-data";

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

// Mock Three.js Canvas
vi.mock("@/components/MarsGlobe", () => ({
  default: () => <div data-testid="mars-globe-mock">Mars Globe 3D</div>,
}));

describe("Landing Page — Localiza Experience & Booking Wizard", () => {
  const createTestClient = () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    client.setQueryData(["vehicles"], SEED_VEHICLES);
    client.setQueryData(["hangars"], SEED_HANGARS);
    client.setQueryData(["weather"], SEED_WEATHER);
    client.setQueryData(["profile"], null);
    client.setQueryData(["vehicle_sales"], []);
    return client;
  };

  it("renders Localiza-style search bar, Martian fleet showcase and Marketplace on Landing Page", async () => {
    const qc = createTestClient();
    const Landing = (Route as any).component;

    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <Landing />
        </QueryClientProvider>,
      );
    });

    // Buscador estilo Localiza
    expect(screen.getByText(/HANGAR DE RETIRADA/i)).toBeInTheDocument();
    expect(screen.getByText(/SOL INICIAL & DIAS/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pesquisar Frota/i })).toBeInTheDocument();

    // Vitrine da Frota Marciana
    expect(screen.getByText(/Escolha seu veículo para decolar em Marte/i)).toBeInTheDocument();
    expect(screen.getAllByText(/CyberCab VTOL X2/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ares Heavy Truck T-9/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Starship Hopper S1/i).length).toBeGreaterThan(0);

    // Seção de Compra & Venda (Seminovos)
    expect(screen.getByText(/Compre sua Espaçonave Própria em Marte/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anunciar Meu Veículo/i })).toBeInTheDocument();

    // Botões de reserva na vitrine
    const bookButtons = screen.getAllByRole("button", { name: /Reservar Veículo/i });
    expect(bookButtons.length).toBeGreaterThan(0);
  }, 15000);

  it("enforces pilot authentication before allowing booking confirmation in the 4-step wizard", async () => {
    const testVehicle = SEED_VEHICLES[0]!; // CyberCab VTOL X2 (daily rate 420)
    const onBookingSuccess = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      render(
        <BookingWizardModal
          vehicle={testVehicle}
          hangars={SEED_HANGARS}
          weather={SEED_WEATHER}
          initialStartSol={4219}
          initialSols={3}
          onClose={onClose}
          onBookingSuccess={onBookingSuccess}
        />,
      );
    });

    // STEP 1: VOO & ITINERÁRIO
    expect(screen.getByText(/Wizard de Locação ARES/i)).toBeInTheDocument();
    expect(screen.getByText(/Distância Areográfica Estimada:/i)).toBeInTheDocument();

    const continueBtn = screen.getByRole("button", { name: /Continuar →/i });
    await act(async () => {
      fireEvent.click(continueBtn);
    });

    // STEP 2: OPCIONAIS MARCIANOS
    expect(screen.getByText(/Seguro contra Tempestade de Sílica/i)).toBeInTheDocument();
    expect(screen.getByText(/Tanque Criogênico Extra de O₂/i)).toBeInTheDocument();
    expect(screen.getByText(/Piloto Automático Neural Nível 5/i)).toBeInTheDocument();

    // Avança para o passo 3
    const continueToPilot = screen.getByRole("button", { name: /Continuar →/i });
    await act(async () => {
      fireEvent.click(continueToPilot);
    });

    // STEP 3: AUTENTICAÇÃO OBRIGATÓRIA DO PILOTO
    expect(screen.getByText(/Autenticação de Piloto Obrigatória/i)).toBeInTheDocument();

    // O botão de confirmação deve estar desabilitado sem autenticação
    const blockedBtn = screen.getByRole("button", {
      name: /Autenticação Obrigatória para Reservar/i,
    });
    expect(blockedBtn).toBeDisabled();

    // Clica no botão de 1-clique Comandante Demo para autenticar a conta
    const demoPilotBtn = screen.getByRole("button", {
      name: /Autenticar como Comandante Demo/i,
    });
    await act(async () => {
      fireEvent.click(demoPilotBtn);
    });

    // Confirma que a credencial foi autenticada e vinculada à reserva
    expect(screen.getByText(/CREDENCIAL AUTENTICADA & VINCULADA À RESERVA/i)).toBeInTheDocument();
    expect(screen.getByText(/ARS-DEMO-01/i)).toBeInTheDocument();

    // Agora o botão de confirmação está habilitado
    const confirmBtn = screen.getByRole("button", {
      name: /Confirmar & Emitir Chave Quântica/i,
    });
    expect(confirmBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    // STEP 4: CARTÃO DE EMBARQUE & CHAVE QUÂNTICA
    expect(screen.getByText(/ARES MOBILITY · BOARDING PASS/i)).toBeInTheDocument();
    expect(screen.getByText(/Q-KEY#8F4A92/i)).toBeInTheDocument();
    expect(screen.getByText(/COMANDOS REMOTOS DO VEÍCULO/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Destravar Esclusa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pré-pressurizar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir Cockpit Completo/i })).toBeInTheDocument();
  });
});
