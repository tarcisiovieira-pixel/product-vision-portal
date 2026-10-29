import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CalendarRange, LogOut, Radar, Wrench } from "lucide-react";
import { AresLogo } from "@/components/AresLogo";
import { supabase } from "@/integrations/supabase/client";
import { licenseLabel, profileQuery } from "@/lib/ares-data";

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const nav = [
  { to: "/app/booking", label: "Locadora", icon: CalendarRange },
  { to: "/app/hangar-3d", label: "Hangar 3D", icon: Boxes },
  { to: "/app/mars-radar", label: "Radar Marte", icon: Radar },
  { to: "/app/maintenance", label: "Manutenção", icon: Wrench },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useQuery(profileQuery);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
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
        <div className="mt-auto hidden space-y-3 border-t p-5 font-mono text-xs md:block">
          <p className="text-muted-foreground">CREDENCIAL</p>
          <p className="text-foreground">{profile?.space_credential_id ?? "—"}</p>
          <p className="text-muted-foreground">HABILITAÇÃO</p>
          <p className="text-telemetry">{profile ? licenseLabel[profile.pilot_license] : "—"}</p>
          <p className="text-muted-foreground">CRÉDITOS</p>
          <p className="font-display text-xl text-primary">MC$ {Number(profile?.martian_credits ?? 0).toLocaleString("pt-BR")}</p>
          <button onClick={signOut} className="flex items-center gap-2 pt-2 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
