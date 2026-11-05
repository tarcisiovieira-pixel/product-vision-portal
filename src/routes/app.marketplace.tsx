import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { MarketplaceShowcase } from "@/components/MarketplaceShowcase";
import { hangarsQuery, profileQuery, vehicleSalesQuery } from "@/lib/ares-data";

export const Route = createFileRoute("/app/marketplace")({
  head: () => ({
    meta: [
      { title: "Compra & Venda de Veículos — ARES Mobility" },
      {
        name: "description",
        content:
          "Marketplace de naves novas, seminovos certificados e veículos espaciais em Marte.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(hangarsQuery),
      context.queryClient.ensureQueryData(vehicleSalesQuery),
      context.queryClient.ensureQueryData(profileQuery),
    ]),
  errorComponent: ({ error }) => (
    <div className="p-10 text-destructive">{String((error as Error)?.message ?? error)}</div>
  ),
  component: MarketplacePage,
});

function MarketplacePage() {
  const { data: hangars } = useSuspenseQuery(hangarsQuery);
  const { data: profile } = useQuery(profileQuery);

  return (
    <div className="space-y-6 p-6 md:p-10">
      <PageHeader
        kicker="ARES Seminovos & Concessionária"
        title="Compra, Venda e Financiamento de Espaçonaves"
      />

      <div className="hud-grid border border-border/70 p-4 font-mono text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-4">
        <div>
          <span>CREDENCIAIS VINCULADAS: </span>
          <strong className="text-foreground">
            {profile?.space_credential_id ?? "ARS-DEMO-01"}
          </strong>
        </div>
        <div>
          <span>SALDO DISPONÍVEL: </span>
          <strong className="font-display text-base text-primary">
            MC$ {Number(profile?.martian_credits ?? 25000).toLocaleString("pt-BR")}
          </strong>
        </div>
        <div className="text-telemetry font-bold">⚡ FINANCIAMENTO HOMOLOGADO EM ATÉ 36 SOLS</div>
      </div>

      <MarketplaceShowcase hangars={hangars} currentProfile={profile} />
    </div>
  );
}
