import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockNavigate = vi.fn();

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<any>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createFileRoute: () => (config: any) => ({ options: config, component: config.component, ...config }),
    ClientOnly: ({ children }: { children: React.ReactNode }) => children,
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock Three.js / Canvas component
vi.mock("@/components/MarsGlobe", () => ({
  default: () => <div data-testid="mars-globe-mock">Mars Globe</div>,
}));

const mockSignIn = vi.fn().mockResolvedValue({
  data: { session: { user: { id: "test-user-demo" } } },
  error: null,
});
const mockSignUp = vi.fn().mockResolvedValue({
  data: { session: { user: { id: "test-user-demo" } } },
  error: null,
});

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      signInWithPassword: (...args: any[]) => mockSignIn(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
    },
  },
}));

import { Route } from "@/routes/login";
const Login = (Route as any).component;

describe("Login screen", () => {
  it("renders demo access button and form fields", async () => {
    await act(async () => {
      render(<Login />);
    });

    expect(screen.getByText(/Terminal de acesso/i)).toBeInTheDocument();
    expect(screen.getByText(/Acesso Rápido Demo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cadastrar/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("colono@jezero.mars")).toBeInTheDocument();
  });

  it("switches to registration mode with space credential and license options", async () => {
    await act(async () => {
      render(<Login />);
    });

    const registerTab = screen.getByRole("button", { name: /Cadastrar/i });
    await act(async () => {
      fireEvent.click(registerTab);
    });

    expect(screen.getByText(/Registrar credencial/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ARS-4218-XXXX/i)).toBeInTheDocument();
    expect(screen.getByText(/Habilitação de piloto/i)).toBeInTheDocument();
    expect(screen.getByText(/Atmosférico/i)).toBeInTheDocument();
    expect(screen.getByText(/Carga Pesada/i)).toBeInTheDocument();
    expect(screen.getByText(/Orbital/i)).toBeInTheDocument();
  });

  it("triggers demo access when clicking the demo button", async () => {
    await act(async () => {
      render(<Login />);
    });

    const demoBtn = screen.getByRole("button", { name: /Acesso Rápido Demo/i });
    await act(async () => {
      fireEvent.click(demoBtn);
    });

    expect(mockSignIn).toHaveBeenCalledWith({
      email: "demo@aresmobility.com",
      password: "DemoMars#2026",
    });
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/app/booking",
      replace: true,
    });
  });
});
