import { useNavigate } from "@tanstack/react-router";

/**
 * `useNavigate` que não quebra quando o componente é renderizado fora de um Router
 * (ex.: testes de componentes isolados). Retorna `null` nesse caso.
 *
 * A presença do Router é constante durante a vida do componente, então a ordem dos
 * hooks não muda entre renders.
 */
export function useSafeNavigate(): ReturnType<typeof useNavigate> | null {
  try {
    return useNavigate();
  } catch {
    return null;
  }
}
