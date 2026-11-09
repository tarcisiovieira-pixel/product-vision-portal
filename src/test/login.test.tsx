import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockNavigate = vi.fn();

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<any>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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

// Mock Three.js / Canvas component
vi.mock("@/components/MarsGlobe", () => ({
  default: () => <div data-testid="mars-globe-mock">Mars Globe</div>,
}));

const mockSignIn = vi.fn().mockResolvedValue({
  data: { session: { user: { id: "test-user-demo" } } },
  error: null,
});
const mockReset = vi.fn().mockResolvedValue({ data: {}, error: null });
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
      signOut: vi.fn().mockResolvedValue({}),
      resetPasswordForEmail: (...args: any[]) => mockReset(...args),
    },
  },
}));

import { Route } from "@/routes/login";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isDemoSession } from "@/lib/session";

const LoginScreen = (Route as any).component;
const Login = () => (
  <QueryClientProvider client={new QueryClient()}>
    <LoginScreen />
  </QueryClientProvider>
);

describe("Login screen", () => {
  beforeEach(() => localStorage.clear());

  it("renders demo access button and form fields", async () => {
    await act(async () => {
      render(<Login />);
    });

    expect(screen.getByText(/Terminal de acesso/i)).toBeInTheDocument();
    expect(screen.getByText(/Entrar no modo demo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Entrar$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cadastrar/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("colono@jezero.mars")).toBeInTheDocument();
  });

  it("switches to registration mode with space credential and the fixed initial license", async () => {
    await act(async () => {
      render(<Login />);
    });

    const registerTab = screen.getByRole("button", { name: /Cadastrar/i });
    await act(async () => {
      fireEvent.click(registerTab);
    });

    expect(screen.getByText(/Registrar credencial/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ARS-4218-XXXX/i)).toBeInTheDocument();
    // A habilitação não é escolhida no cadastro: promoções são feitas pela equipe.
    expect(screen.getByText(/Habilitação inicial: Atmosférico/i)).toBeInTheDocument();
    expect(screen.queryByText(/Carga Pesada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Orbital/i)).not.toBeInTheDocument();
  });

  it("triggers demo access when clicking the demo button", async () => {
    await act(async () => {
      render(<Login />);
    });

    const demoBtn = screen.getByRole("button", { name: /Entrar no modo demo/i });
    await act(async () => {
      fireEvent.click(demoBtn);
    });

    // Demo é local: não pode depender da rede nem carregar senha no bundle.
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(isDemoSession()).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/app/booking",
      replace: true,
    });
  });

  describe("Esqueci minha senha", () => {
    beforeEach(() => mockReset.mockClear());

    it("pede o e-mail antes de enviar o link", async () => {
      await act(async () => {
        render(<Login />);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Esqueci minha senha/i }));
      });
      expect(mockReset).not.toHaveBeenCalled();
      expect(screen.getByText(/Digite seu e-mail no campo acima/i)).toBeInTheDocument();
    });

    it("envia o link para a tela de redefinição e confirma sem revelar se a conta existe", async () => {
      await act(async () => {
        render(<Login />);
      });
      fireEvent.change(screen.getByPlaceholderText("colono@jezero.mars"), {
        target: { value: "piloto@exemplo.com" },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Esqueci minha senha/i }));
      });
      expect(mockReset).toHaveBeenCalledWith("piloto@exemplo.com", {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      expect(screen.getByText(/Se existir uma conta com piloto@exemplo.com/i)).toBeInTheDocument();
    });

    it("mostra erro em português quando o limite de e-mails estoura", async () => {
      mockReset.mockResolvedValueOnce({
        data: null,
        error: new Error("email rate limit exceeded"),
      });
      await act(async () => {
        render(<Login />);
      });
      fireEvent.change(screen.getByPlaceholderText("colono@jezero.mars"), {
        target: { value: "piloto@exemplo.com" },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Esqueci minha senha/i }));
      });
      expect(screen.getByText(/Muitas tentativas/i)).toBeInTheDocument();
      expect(screen.queryByText(/Verifique seu e-mail/i)).not.toBeInTheDocument();
    });

    it("não oferece o link no modo de cadastro", async () => {
      await act(async () => {
        render(<Login />);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Cadastrar/i }));
      });
      expect(
        screen.queryByRole("button", { name: /Esqueci minha senha/i }),
      ).not.toBeInTheDocument();
    });
  });
});
