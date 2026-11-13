import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: unknown; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children as never}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/rota-que-nao-existe" } }),
}));

import { NotFound } from "@/components/NotFound";

describe("tela 404", () => {
  it("mostra o erro, o endereço pedido e caminhos de volta", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "404" })).toBeTruthy();
    expect(screen.getByText(/Esta rota não existe em Marte/)).toBeTruthy();
    expect(screen.getByTestId("not-found-path").textContent).toContain("/rota-que-nao-existe");
    expect(screen.getByRole("link", { name: "Voltar ao início" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Ir para a Locadora" }).getAttribute("href")).toBe(
      "/app/booking",
    );
  });
});
