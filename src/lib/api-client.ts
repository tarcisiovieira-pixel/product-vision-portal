// Cliente da API Fastify. Só é usado quando VITE_API_URL está definida.
import { supabase } from "@/integrations/supabase/client";

const baseUrl = () => (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/+$/, "");

export const apiEnabled = () => Boolean(baseUrl());

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Não foi possível falar com o servidor. Tente novamente.");
  }

  const payload = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new Error(payload?.message ?? `Erro ${res.status} no servidor.`);
  return payload as T;
}
