import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CalendarCheck, CalendarRange, LogOut, Radar, ShoppingBag, Wrench } from "lucide-react";
import { AresLogo } from "@/components/AresLogo";
import { supabase } from "@/integrations/supabase/client";
import { licenseLabel, profileQuery } from "@/lib/ares-data";

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window !== "undefined" && localStorage.getItem("ares_demo_session")) {
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      return;
    }
    try {
      const userPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise<{ data: any }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null } }), 2000),
      );
      const { data } = (await Promise.race([userPromise, timeoutPromise])) as any;
      if (data?.user) return;
    } catch {}
    throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const nav = [
  { to: "/app/booking", label: "Locadora", icon: CalendarRange },
  { to: "/app/my-rentals", label: "Minhas Reservas", icon: CalendarCheck },
  { to: "/app/hangar-3d", label: "Hangar 3D", icon: Boxes },
  { to: "/app/mars-radar", label: "Radar Marte", icon: Radar },
  { to: "/app/maintenance", label: "Manutenção", icon: Wrench },
  { to: "/app/marketplace", label: "Compra & Venda", icon: ShoppingBag },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useQuery(profileQuery);

  const signOut = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ares_demo_session");
      localStorage.removeItem("ares_demo_rentals");
      localStorage.removeItem("ares_local_maintenance_logs");
    }
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut().catch(() => {});
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="hud-grid flex min-h-screen flex-col md:flex-row">
      <aside className="glass flex shrink-0 flex-col border-y-0 border-l-0 md:sticky md:top-0 md:h-screen md:w-64">
        <div className="border-b p-5"><AresLogo /></div>
        <nav className="flex gap-1 overflow-x-auto p-3 md:flex-col">
          {nav.map((n) => (
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
            <p className="font-display text-xl text-primary">MC$ {Number(profile?.martian_credits ?? 0).toLocaleString("pt-BR")}</p>
            <button onClick={signOut} className="flex items-center gap-2 pt-2 text-muted-foreground transition hover:text-foreground">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
          <div className="flex items-center justify-between md:hidden">
            <div>
              <p className="text-muted-foreground">{profile?.space_credential_id ?? "—"}</p>
              <p className="font-display text-sm text-primary">MC$ {Number(profile?.martian_credits ?? 0).toLocaleString("pt-BR")}</p>
            </div>
            <button onClick={signOut} className="flex items-center gap-1.5 border border-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
