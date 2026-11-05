import type { Report } from '../../../../shared/types';
import { formatDuration, formatTime } from '../../format';

/** The rest of the bot's /report: what the tiles and charts do not already show. */
export function PeriodSummary({ report }: { report: Report }) {
  return (
    <details className="card summary span-12">
      <summary>Period summary, since {formatTime(report.since)}</summary>
      <div className="grid">
        <dl className="facts span-5">
          <dt>Started</dt>
          <dd>{report.created}</dd>
          <dt>Cancelled</dt>
          <dd>{report.cancelled}</dd>
          <dt>Finished minutes</dt>
          <dd>
            {report.minutes.toFixed(1)} from {report.minutes_videos} videos
          </dd>
          <dt>Approvals decided</dt>
          <dd>
            {report.approvals.decided}
            {report.approvals.median_seconds !== null && report.approvals.decided > 0
              ? `, typically in ${formatDuration(report.approvals.median_seconds)}`
              : ''}
          </dd>
        </dl>
        <div className="span-7">
          {report.steps.length === 0 && <p className="quiet">No step finished in this period.</p>}
          {report.steps.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Slowest steps</th>
                  <th scope="col" className="num">
                    Runs
                  </th>
                  <th scope="col" className="num">
                    Typical time
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.steps.map((step) => (
                  <tr key={step.step}>
                    <td>{step.step}</td>
                    <td className="num">{step.runs}</td>
                    <td className="num">{formatDuration(step.median_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="chart-note">
        The bot's /report counts 7 and 30 days as rolling windows; the tiles and charts use whole
        days.
      </p>
    </details>
  );
}
