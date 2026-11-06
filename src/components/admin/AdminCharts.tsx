import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminOverview } from "@/lib/admin";

const dayLabel = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
};

function SignupTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: { day: string } }[];
}) {
  const point = payload?.[0];
  if (!active || !point) return null;
  return (
    <div className="border border-telemetry/40 bg-surface px-3 py-2 font-mono text-xs shadow-lg">
      <p className="text-muted-foreground">{dayLabel(point.payload.day)}</p>
      <p className="font-bold text-foreground">
        {point.value} {point.value === 1 ? "cadastro" : "cadastros"}
      </p>
    </div>
  );
}

export function SignupsChart({ data }: { data: AdminOverview["signups_by_day"] }) {
  return (
    <div className="h-44" role="img" aria-label="Cadastros por dia nos últimos 14 dias">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: -28, bottom: 0 }}>
          <XAxis
            dataKey="day"
            tickFormatter={dayLabel}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval={1}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.35 }}
            content={<SignupTooltip />}
            isAnimationActive={false}
          />
          <Bar
            dataKey="count"
            fill="var(--telemetry)"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopVehicles({ data }: { data: AdminOverview["top_vehicles"] }) {
  const max = Math.max(...data.map((v) => v.revenue), 1);
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem reservas ainda.</p>;
  }
  return (
    <ul className="space-y-3">
      {data.map((v) => (
        <li key={v.callsign} title={`${v.name}: ${v.rentals} reservas`}>
          <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
            <span className="truncate text-foreground">{v.callsign}</span>
            <span className="shrink-0 text-muted-foreground">
              MC$ {Number(v.revenue).toLocaleString("pt-BR")} · {v.rentals} res.
            </span>
          </div>
          <div className="mt-1 h-2 bg-muted/40">
            <div
              className="h-full rounded-r-[4px] bg-telemetry"
              style={{ width: `${(Number(v.revenue) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
