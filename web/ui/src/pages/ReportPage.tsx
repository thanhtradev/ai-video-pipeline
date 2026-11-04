import { useState } from 'react';
import type { ReportPeriod } from '../../../shared/types';
import { api } from '../api';
import { ErrorNote, Loading } from '../components';
import { formatCost, formatDuration, formatTime } from '../format';
import { usePoll } from '../hooks';

const PERIODS: readonly { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

export function ReportPage() {
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const { data, error, isLoading } = usePoll(() => api.report(period), period);
  return (
    <section aria-labelledby="report">
      <h1 id="report">Report</h1>
      <div className="segmented" role="group" aria-label="Period">
        {PERIODS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && (
        <>
          <p className="quiet">Since {formatTime(data.since)}</p>
          <dl className="facts">
            <dt>Started</dt>
            <dd>{data.created}</dd>
            <dt>Finished</dt>
            <dd>{data.completed}</dd>
            <dt>Failed</dt>
            <dd>{data.failed}</dd>
            <dt>Cancelled</dt>
            <dd>{data.cancelled}</dd>
            <dt>In production now</dt>
            <dd>{data.active}</dd>
            <dt>Stopped now</dt>
            <dd>{data.stopped}</dd>
            <dt>Cost</dt>
            <dd>{formatCost(data.cost)}</dd>
            <dt>Finished minutes</dt>
            <dd>
              {data.minutes.toFixed(1)} from {data.minutes_videos} videos
            </dd>
          </dl>
          <p className="quiet">
            Costs are recorded provider costs. Claude usage has no recorded cost.
          </p>
          <h2>Slowest steps</h2>
          {data.steps.length === 0 && <p className="quiet">No step finished in this period.</p>}
          <table className="plain-table">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Runs</th>
                <th scope="col">Typical time</th>
              </tr>
            </thead>
            <tbody>
              {data.steps.map((step) => (
                <tr key={step.step}>
                  <td>{step.step}</td>
                  <td>{step.runs}</td>
                  <td>{formatDuration(step.median_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
