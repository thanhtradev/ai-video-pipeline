import { useState } from 'react';
import type { ReportPeriod } from '../../../shared/types';
import { api } from '../api';
import { Card, ErrorNote, Loading, PageHeader } from '../components';
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
    <>
      <PageHeader
        title="Report"
        lead={data ? `Since ${formatTime(data.since)}` : undefined}
        actions={
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
        }
      />
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && (
        <>
          <Card title="Outcomes">
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
            <p className="chart-note">
              Costs are recorded provider costs. Claude usage has no recorded cost.
            </p>
          </Card>
          <Card title="Slowest steps">
            {data.steps.length === 0 && <p className="quiet">No step finished in this period.</p>}
            {data.steps.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Step</th>
                      <th scope="col" className="num">
                        Runs
                      </th>
                      <th scope="col" className="num">
                        Typical time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.steps.map((step) => (
                      <tr key={step.step}>
                        <td>{step.step}</td>
                        <td className="num">{step.runs}</td>
                        <td className="num">{formatDuration(step.median_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
