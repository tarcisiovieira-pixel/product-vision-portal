// Chamadas a funções do banco que ainda não constam em types.ts (arquivo gerado pelo Lovable).
import { supabase } from "@/integrations/supabase/client";

type RpcClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
