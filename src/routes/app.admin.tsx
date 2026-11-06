import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { AdminUserDialog } from "@/components/admin/AdminUserDialog";
import { SignupsChart, TopVehicles } from "@/components/admin/AdminCharts";
import { InfoTip } from "@/components/InfoTip";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  SEGMENTS,
  adminAuditQuery,
  adminOverviewQuery,
  adminStatusQuery,
  adminUsersQuery,
  matchesSegment,
  percent,
  ratio,
  usersToCsv,
  type AdminAuditEntry,
  type AdminUser,
  type UserSegment,
} from "@/lib/admin";
import { licenseLabel } from "@/lib/ares-data";
import { isDemoSession } from "@/lib/session";

export const Route = createFileRoute("/app/admin")({
  beforeLoad: async ({ context }) => {
    const allowed = await context.queryClient.fetchQuery({ ...adminStatusQuery, staleTime: 0 });
    if (!allowed) throw redirect({ to: "/app/booking" });
  },
  head: () => ({ meta: [{ title: "Painel administrativo — ARES Mobility" }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminOverviewQuery),
      context.queryClient.ensureQueryData(adminUsersQuery),
    ]),
  errorComponent: ({ error }) => (
    <div className="p-10 font-mono text-sm text-destructive">{String(error)}</div>
  ),
  component: AdminPage,
});

const money = (value: number) => `MC$ ${Number(value).toLocaleString("pt-BR")}`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

function Tile({
  label,
  value,
  context,
  info,
}: {
  label: string;
  value: string | number;
  context: string;
  info: string;
}) {
  return (
    <div className="glass p-4">
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        <InfoTip label={`Como é calculado: ${label}`}>{info}</InfoTip>
      </p>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{context}</p>
    </div>
  );
}

type SortKey = "created_at" | "last_sign_in_at" | "credits" | "spent" | "rentals_total";

const SORTABLE: { key: SortKey; label: string }[] = [
  { key: "credits", label: "Saldo" },
  { key: "spent", label: "Gasto" },
  { key: "rentals_total", label: "Reservas" },
  { key: "created_at", label: "Cadastro" },
  { key: "last_sign_in_at", label: "Último acesso" },
];

function sortValue(u: AdminUser, key: SortKey): number {
  const value = u[key];
  if (typeof value === "number") return value;
  return value ? new Date(value).getTime() : 0;
}

// Marca UTF-8: sem ela, o Excel embaralha os acentos.
const BOM = String.fromCharCode(0xfeff);

function downloadCsv(users: AdminUser[]) {
  const url = URL.createObjectURL(new Blob([BOM + usersToCsv(users)], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ares-usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const AUDIT_LABEL: Record<string, string> = {
  credits_adjusted: "Ajuste de créditos",
  license_changed: "Habilitação alterada",
  user_suspended: "Conta suspensa",
  user_reactivated: "Conta reativada",
};

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 py-2 font-mono text-xs last:border-0">
      <span className="text-foreground">
        {AUDIT_LABEL[entry.action] ?? entry.action} · {entry.target_email ?? "conta removida"}
      </span>
      <span className="text-muted-foreground">
        {String(entry.details["reason"] ?? "")} · {entry.admin_email ?? "—"} ·{" "}
        {date(entry.created_at)}
      </span>
    </li>
  );
}

function AdminPage() {
  const { data: overview, refetch, isFetching } = useSuspenseQuery(adminOverviewQuery);
  const { data: users } = useSuspenseQuery(adminUsersQuery);
  const { data: audit = [] } = useQuery(adminAuditQuery);

  const [segment, setSegment] = useState<UserSegment>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "created_at",
    desc: true,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoSession()) return;
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });
  }, []);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        SEGMENTS.map((s) => [s.id, users.filter((u) => matchesSegment(u, s.id)).length]),
      ),
    [users],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users
      .filter((u) => matchesSegment(u, segment))
      .filter(
        (u) =>
          !term ||
          u.email.toLowerCase().includes(term) ||
          (u.credential ?? "").toLowerCase().includes(term),
      )
      .sort((a, b) => {
        const diff = sortValue(a, sort.key) - sortValue(b, sort.key);
        return sort.desc ? -diff : diff;
      });
  }, [users, segment, search, sort]);

  const selected = users.find((u) => u.user_id === selectedId) ?? null;
  const { users: u, rentals: r, fleet: f, finance } = overview;
  const totalRevenue =
    Number(r.revenue) + Number(finance.maintenance_revenue) + Number(finance.marketplace_revenue);
  const SortIcon = sort.desc ? ArrowDown : ArrowUp;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <PageHeader
        kicker="Administração"
        title="Painel de usuários"
        info="Indicadores calculados no banco a cada atualização. Toda ação exige motivo e fica registrada na auditoria."
      >
        <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
          {isDemoSession() && (
            <span className="border border-warning/50 bg-warning/10 px-2 py-1 text-warning">
              Dados fictícios
            </span>
          )}
          <span>Atualizado {new Date(overview.generated_at).toLocaleTimeString("pt-BR")}</span>
          <button
            type="button"
            aria-label="Atualizar indicadores"
            onClick={() => refetch()}
            className="p-1 transition hover:text-telemetry"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </PageHeader>

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Usuários"
          value={u.total}
          context={`+${u.new_7d} em 7 dias · +${u.new_30d} em 30`}
          info="Todas as contas criadas, confirmadas ou não."
        />
        <Tile
          label="Ativos em 30 dias"
          value={percent(ratio(u.active_30d, u.confirmed))}
          context={`${u.active_30d} de ${u.confirmed} confirmados`}
          info="Contas confirmadas que entraram nos últimos 30 dias."
        />
        <Tile
          label="Conversão"
          value={percent(ratio(u.with_rental, u.confirmed))}
          context={`${u.with_rental} já reservaram`}
          info="Contas com ao menos uma reserva, sobre as contas confirmadas."
        />
        <Tile
          label="Cancelamento"
          value={percent(ratio(r.cancelled, r.total))}
          context={`${r.cancelled} de ${r.total} reservas`}
          info="Reservas canceladas sobre o total de reservas."
        />
        <Tile
          label="Receita total"
          value={money(totalRevenue)}
          context={`Reservas ${money(r.revenue)}`}
          info="Reservas não canceladas, manutenção e vendas do marketplace."
        />
        <Tile
          label="Ticket médio"
          value={money(r.avg_ticket)}
          context={`${r.active} reservas ativas`}
          info="Valor médio por reserva, sem contar as canceladas."
        />
        <Tile
          label="Ocupação da frota"
          value={percent(ratio(f.occupied, f.total))}
          context={`${f.occupied} de ${f.total} veículos`}
          info="Veículos com reserva confirmada ou em voo, sobre o total da frota."
        />
        <Tile
          label="Créditos em circulação"
          value={money(finance.credits_circulating)}
          context={`${finance.marketplace_sales} ${finance.marketplace_sales === 1 ? "venda" : "vendas"} no marketplace`}
          info="Soma do saldo de todos os usuários. É o que ainda pode virar reserva."
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="glass p-5">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-primary">
            Cadastros nos últimos 14 dias
          </h2>
          <SignupsChart data={overview.signups_by_day} />
        </div>
        <div className="glass p-5">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-primary">
            Veículos que mais faturam
          </h2>
          <TopVehicles data={overview.top_vehicles} />
        </div>
      </section>

      <section aria-label="Exige atenção" className="space-y-2">
        <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
          <ShieldAlert className="h-4 w-4" /> Exige atenção
        </h2>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {SEGMENTS.map((s) => (
            <div
              key={s.id}
              className={`flex items-start justify-between gap-2 border p-3 transition ${
                segment === s.id
                  ? "border-telemetry bg-telemetry/10"
                  : "border-border/60 hover:border-telemetry/50"
              }`}
            >
              <button
                type="button"
                aria-pressed={segment === s.id}
                onClick={() => setSegment(segment === s.id ? "all" : s.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block font-display text-xl font-bold text-foreground">
                  {counts[s.id]}
                </span>
                <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                  {s.label}
                </span>
              </button>
              <InfoTip label={s.label}>{s.hint}</InfoTip>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Usuários" className="glass p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-primary">
            {visible.length} de {users.length} usuários
          </h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 border border-border bg-background/50 px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar e-mail ou credencial"
                aria-label="Buscar usuário"
                className="w-52 bg-transparent font-mono text-xs text-foreground focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => downloadCsv(visible)}
              className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition hover:border-telemetry hover:text-telemetry"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Usuário</th>
                <th className="py-2 pr-3 font-normal">Habilitação</th>
                {SORTABLE.map((column) => (
                  <th
                    key={column.key}
                    className="py-2 pr-3 font-normal"
                    aria-sort={
                      sort.key === column.key ? (sort.desc ? "descending" : "ascending") : "none"
                    }
                  >
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() =>
                        setSort({
                          key: column.key,
                          desc: sort.key === column.key ? !sort.desc : true,
                        })
                      }
                    >
                      {column.label}
                      {sort.key === column.key && <SortIcon className="h-3 w-3" />}
                    </button>
                  </th>
                ))}
                <th className="py-2 font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr
                  key={user.user_id}
                  className="border-b border-border/40 transition last:border-0 hover:bg-surface/60"
                >
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(user.user_id)}
                      className="text-left text-foreground hover:text-telemetry"
                    >
                      {user.email}
                      <span className="block text-[10px] text-muted-foreground">
                        {user.credential ?? "—"}
                      </span>
                    </button>
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {user.pilot_license ? licenseLabel[user.pilot_license] : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-foreground">{money(user.credits)}</td>
                  <td className="py-2.5 pr-3 text-foreground">{money(user.spent)}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {user.rentals_total}
                    {user.rentals_cancelled > 0 && ` (${user.rentals_cancelled} canc.)`}
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{date(user.created_at)}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {date(user.last_sign_in_at)}
                  </td>
                  <td className="py-2.5">
                    {user.suspended ? (
                      <span className="text-warning">Suspenso</span>
                    ) : !user.email_confirmed ? (
                      <span className="text-muted-foreground">E-mail pendente</span>
                    ) : user.is_admin ? (
                      <span className="text-telemetry">Admin</span>
                    ) : (
                      <span className="text-foreground">Ativo</span>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Auditoria" className="glass p-5">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">
          Últimas ações administrativas
        </h2>
        {audit.length === 0 ? (
          <p className="py-4 text-center font-mono text-xs text-muted-foreground">
            Nenhuma ação registrada.
          </p>
        ) : (
          <ul>
            {audit.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <AdminUserDialog
          key={selected.user_id}
          user={selected}
          currentUserId={currentUserId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
