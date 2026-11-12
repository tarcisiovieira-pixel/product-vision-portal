import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Boxes,
  CalendarCheck,
  CalendarRange,
  KeyRound,
  LogOut,
  Radar,
  ShieldCheck,
  ShoppingBag,
  Wrench,
} from "lucide-react";
import { AresLogo } from "@/components/AresLogo";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { supabase } from "@/integrations/supabase/client";
import { adminStatusQuery } from "@/lib/admin";
import { licenseLabel, profileQuery } from "@/lib/ares-data";
import { clearDemoState, isDemoSession } from "@/lib/session";

const money = (value: number | string | null | undefined) =>
  value == null ? "—" : Number(value).toLocaleString("pt-BR");

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async () => {
    // Conta real sempre vence: resquícios do demo são descartados.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      clearDemoState();
      return;
    }
    if (isDemoSession()) return;
    try {
      const userPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null } }), 2000),
      );
      const { data } = await Promise.race([userPromise, timeoutPromise]);
      if (data?.user) return;
    } catch {
      // getUser falhou ou expirou: segue para o redirect de login.
    }
    throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const nav = [
  { to: "/app/booking", label: "Locadora", icon: CalendarRange },
  { to: "/app/consultor", label: "Consultor IA", icon: Bot },
  { to: "/app/my-rentals", label: "Minhas Reservas", icon: CalendarCheck },
  { to: "/app/hangar-3d", label: "Hangar 3D", icon: Boxes },
  { to: "/app/mars-radar", label: "Radar Marte", icon: Radar },
  { to: "/app/maintenance", label: "Manutenção", icon: Wrench },
  { to: "/app/marketplace", label: "Compra & Venda", icon: ShoppingBag },
] as const;

const adminLink = { to: "/app/admin", label: "Administração", icon: ShieldCheck } as const;

function AppLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useQuery(profileQuery);
  const { data: isAdmin } = useQuery(adminStatusQuery);
  const links = isAdmin ? [...nav, adminLink] : nav;
  const [changingPassword, setChangingPassword] = useState(false);

  const openChangePassword = () => {
    if (isDemoSession()) {
      toast.info("Indisponível no modo demo", {
        description: "O demo não tem senha. Crie uma conta para usar este recurso.",
      });
      return;
    }
    setChangingPassword(true);
  };

  const signOut = async () => {
    clearDemoState();
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut().catch(() => {});
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="hud-grid flex min-h-screen flex-col md:flex-row">
      <aside className="glass flex shrink-0 flex-col border-y-0 border-l-0 md:sticky md:top-0 md:h-screen md:w-64">
        <div className="border-b p-5">
          <AresLogo />
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 md:flex-col">
          {links.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 border border-transparent px-3 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
              activeProps={{ className: "!border-primary/50 bg-primary/10 !text-primary" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t p-5 font-mono text-xs">
          <div className="hidden space-y-3 md:block">
            <p className="text-muted-foreground">CREDENCIAL</p>
            <p className="text-foreground">{profile?.space_credential_id ?? "—"}</p>
            <p className="text-muted-foreground">HABILITAÇÃO</p>
            <p className="text-telemetry">{profile ? licenseLabel[profile.pilot_license] : "—"}</p>
            <p className="text-muted-foreground">CRÉDITOS</p>
            <p className="font-display text-xl text-primary">
              MC$ {money(profile?.martian_credits)}
            </p>
            <button
              onClick={openChangePassword}
              className="flex items-center gap-2 pt-2 text-muted-foreground transition hover:text-foreground"
            >
              <KeyRound className="h-4 w-4" /> Alterar senha
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
          <div className="flex items-center justify-between md:hidden">
            <div>
              <p className="text-muted-foreground">{profile?.space_credential_id ?? "—"}</p>
              <p className="font-display text-sm text-primary">
                MC$ {money(profile?.martian_credits)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openChangePassword}
                aria-label="Alterar senha"
                className="flex items-center border border-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <KeyRound className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 border border-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
