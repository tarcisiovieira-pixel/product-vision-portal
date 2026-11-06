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
    <div className="space-y-6">
      <MarketplaceShowcase hangars={hangars} currentProfile={profile} />
    </div>
  );
}
