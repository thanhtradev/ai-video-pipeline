import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardDay } from '../../../shared/types';
import { formatDay, tooltipStyle, useChartTheme } from './chartTheme';

const HEIGHT = 220;

export function currenciesOf(days: DashboardDay[]): string[] {
  return [...new Set(days.flatMap((day) => Object.keys(day.cost)))].sort();
}

/**
 * Recorded provider cost per day. Usually one currency, one series; with several, one bar group
 * per currency, each named, because their scales differ and they never share a total.
 */
export function CostChart({ days }: { days: DashboardDay[] }) {
  const theme = useChartTheme();
  const currencies = currenciesOf(days);
  const series = [theme.started, theme.completed, theme.failed];
  const rows: Record<string, string | number>[] = days.map((day) => ({
    day: day.day,
    label: formatDay(day.day),
    ...Object.fromEntries(currencies.map((currency) => [currency, day.cost[currency] ?? 0])),
  }));
  if (currencies.length === 0) {
    return <p className="chart-note">No cost was recorded in this period.</p>;
  }
  return (
    <>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis
              dataKey="label"
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: theme.grid }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ fill: theme.grid }} />
            {currencies.length > 1 && (
              <Legend wrapperStyle={{ fontSize: 12, color: theme.muted }} iconSize={10} />
            )}
            {currencies.map((currency, index) => (
              <Bar
                key={currency}
                dataKey={currency}
                name={currency}
                fill={series[index % series.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Cost per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {currencies.map((currency) => (
              <th key={currency} scope="col">
                {currency}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row['day'])}>
              <td>{row['label']}</td>
              {currencies.map((currency) => (
                <td key={currency}>{String(row[currency] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
