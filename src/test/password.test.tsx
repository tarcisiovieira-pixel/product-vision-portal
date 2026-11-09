import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockNavigate = vi.fn();
const auth = vi.hoisted(() => ({
  session: null as unknown,
  updateUser: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
  unsubscribe: vi.fn(),
}));

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
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
      updateUser: (...args: unknown[]) => auth.updateUser(...args),
    },
  },
}));

import { PasswordForm } from "@/components/PasswordForm";
import { Route } from "@/routes/redefinir-senha";
import { passwordErrorMessage, validateNewPassword } from "@/lib/password";

const ResetPassword = (Route as any).component;

describe("validateNewPassword", () => {
  it.each([
    ["", "", /Digite/],
    ["   ", "   ", /Digite/],
    ["1234567", "1234567", /pelo menos 8/],
    ["a".repeat(73), "a".repeat(73), /no máximo 72/],
    ["senha-boa-1", "senha-boa-2", /não são iguais/],
  ])("recusa %j", (password, confirm, pattern) => {
    expect(validateNewPassword(password, confirm)).toMatch(pattern);
  });

  it.each(["12345678", "uma senha com espaços", "a".repeat(72)])("aceita %j", (password) => {
    expect(validateNewPassword(password, password)).toBeNull();
  });
});

describe("passwordErrorMessage", () => {
  it.each([
    ["New password should be different from the old password.", /diferente da atual/],
    ["Password is known to be weak and easy to guess", /fraca demais/],
    ["Password should be at least 6 characters", /pelo menos 8/],
    ["Auth session missing!", /link expirou/],
    ["email rate limit exceeded", /Muitas tentativas/],
    ["Failed to fetch", /Sem conexão/],
  ])("traduz %j", (message, pattern) => {
    expect(passwordErrorMessage(new Error(message))).toMatch(pattern);
  });

  it("devolve a mensagem original quando não conhece o erro", () => {
    expect(passwordErrorMessage(new Error("algo novo"))).toBe("algo novo");
  });
});

describe("PasswordForm", () => {
  const fill = (password: string, confirm: string) => {
    fireEvent.change(screen.getByLabelText("NOVA SENHA"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("CONFIRMAR NOVA SENHA"), { target: { value: confirm } });
  };

  it("não envia senha inválida e mostra o motivo", async () => {
    const onSubmit = vi.fn();
    render(<PasswordForm onSubmit={onSubmit} submitLabel="Salvar" />);
    fill("curta", "curta");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/pelo menos 8/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não envia quando as senhas diferem", async () => {
    const onSubmit = vi.fn();
    render(<PasswordForm onSubmit={onSubmit} submitLabel="Salvar" />);
    fill("senha-boa-1", "senha-boa-2");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não são iguais/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("envia a senha válida", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PasswordForm onSubmit={onSubmit} submitLabel="Salvar" />);
    fill("senha-boa-1", "senha-boa-1");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("senha-boa-1"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra o erro do servidor em português", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("New password should be different from the old password."));
    render(<PasswordForm onSubmit={onSubmit} submitLabel="Salvar" />);
    fill("senha-boa-1", "senha-boa-1");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/diferente da atual/);
  });

  it("alterna a visibilidade das senhas", () => {
    render(<PasswordForm onSubmit={vi.fn()} submitLabel="Salvar" />);
    expect(screen.getByLabelText("NOVA SENHA")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: /Mostrar senhas/ }));
    expect(screen.getByLabelText("NOVA SENHA")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("CONFIRMAR NOVA SENHA")).toHaveAttribute("type", "text");
  });
});

describe("tela /redefinir-senha", () => {
  beforeEach(() => {
    auth.session = null;
    auth.listener = null;
    auth.updateUser.mockReset();
    auth.unsubscribe.mockReset();
    mockNavigate.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("com o link válido (sessão de recuperação) mostra o formulário", async () => {
    auth.session = { user: { id: "u1" } };
    render(<ResetPassword />);
    expect(await screen.findByLabelText("NOVA SENHA")).toBeInTheDocument();
  });

  it("abre o formulário quando o evento de recuperação chega depois", async () => {
    render(<ResetPassword />);
    expect(screen.getByRole("status")).toHaveTextContent(/Validando/);
    await act(async () => auth.listener?.("PASSWORD_RECOVERY", { user: { id: "u1" } }));
    expect(await screen.findByLabelText("NOVA SENHA")).toBeInTheDocument();
  });

  it("sem sessão, depois do prazo, explica que o link não vale e leva ao login", async () => {
    vi.useFakeTimers();
    render(<ResetPassword />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/expirou, já foi usado ou não é válido/);
    expect(screen.getByRole("link", { name: /Voltar ao login/ })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("NOVA SENHA")).not.toBeInTheDocument();
  });

  it("salva a senha, avisa e segue para o app", async () => {
    auth.session = { user: { id: "u1" } };
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("NOVA SENHA"), {
      target: { value: "nova-senha-9" },
    });
    fireEvent.change(screen.getByLabelText("CONFIRMAR NOVA SENHA"), {
      target: { value: "nova-senha-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar nova senha/ }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "nova-senha-9" }));
    expect(await screen.findByText(/Senha alterada/)).toBeInTheDocument();
    await waitFor(
      () => expect(mockNavigate).toHaveBeenCalledWith({ to: "/app/booking", replace: true }),
      {
        timeout: 4000,
      },
    );
  });

  it("não navega quando o servidor recusa a nova senha", async () => {
    auth.session = { user: { id: "u1" } };
    auth.updateUser.mockResolvedValue({
      data: null,
      error: new Error("Password is known to be weak and easy to guess"),
    });
    render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("NOVA SENHA"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByLabelText("CONFIRMAR NOVA SENHA"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar nova senha/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/fraca demais/);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("limpa o ouvinte de autenticação ao sair da tela", async () => {
    const { unmount } = render(<ResetPassword />);
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });
});
