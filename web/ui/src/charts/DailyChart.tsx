import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardDay } from '../../../shared/types';
import { formatDay, tooltipStyle, useChartTheme } from './chartTheme';

const HEIGHT = 220;

/**
 * Finished and failed videos stacked per day, with started as a line over them. One axis: all
 * three are counts of videos. The table under it carries the same numbers for a screen reader.
 */
export function DailyChart({ days }: { days: DashboardDay[] }) {
  const theme = useChartTheme();
  const rows = days.map((day) => ({ ...day, label: formatDay(day.day) }));
  const isEmpty = rows.every((row) => row.started + row.completed + row.failed === 0);
  return (
    <>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
              allowDecimals={false}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ fill: theme.grid }} />
            <Legend wrapperStyle={{ fontSize: 12, color: theme.muted }} iconSize={10} />
            <Bar
              dataKey="completed"
              name="Finished"
              stackId="videos"
              fill={theme.completed}
              radius={[0, 0, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              dataKey="failed"
              name="Failed"
              stackId="videos"
              fill={theme.failed}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Line
              dataKey="started"
              name="Started"
              type="monotone"
              stroke={theme.started}
              strokeWidth={2}
              dot={{ r: 3, fill: theme.started, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {isEmpty && <p className="chart-note">No video started or finished in this period.</p>}
      <table className="sr-only">
        <caption>Videos per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Started</th>
            <th scope="col">Finished</th>
            <th scope="col">Failed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <td>{row.label}</td>
              <td>{row.started}</td>
              <td>{row.completed}</td>
              <td>{row.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
