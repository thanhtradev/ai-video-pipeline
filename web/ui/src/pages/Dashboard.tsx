import type { ReportPeriod } from '../../../shared/types';
import { api } from '../api';
import { CostChart } from '../charts/CostChart';
import { DailyChart } from '../charts/DailyChart';
import { Card, ErrorNote, Link, Loading, PageHeader, StatTile } from '../components';
import { formatCost } from '../format';
import { replaceUrl, usePoll, useSearchParams } from '../hooks';
import { Failures } from './dashboard/Failures';
import { KitTable } from './dashboard/KitTable';
import { NeedsYou } from './dashboard/NeedsYou';
import { PeriodSummary } from './dashboard/PeriodSummary';
import { inProduction, sumDays } from './dashboard/sums';
import { WorkerTiles } from './Workers';

const PERIODS: readonly { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

function periodOf(params: URLSearchParams): ReportPeriod {
  const wanted = params.get('period');
  return PERIODS.find((period) => period.value === wanted)?.value ?? 'today';
}

export function Dashboard() {
  // The address holds the period, so a reload and a shared link show the same numbers.
  const period = periodOf(useSearchParams());
  const attention = usePoll(api.attention, 'attention');
  const workers = usePoll(api.workers, 'workers');
  const dashboard = usePoll(() => api.dashboard(period), period);
  const report = usePoll(() => api.report(period), period);
  const reloadAll = (): void => {
    attention.reload();
    dashboard.reload();
    report.reload();
  };

  const totals = dashboard.data ? sumDays(dashboard.data.days) : null;
  const needs = attention.data
    ? attention.data.approvals.length + attention.data.stopped.length
    : null;
  const online = workers.data?.filter((worker) => worker.online).length ?? null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <div className="segmented" role="group" aria-label="Period">
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={period === option.value}
                onClick={() =>
                  replaceUrl(option.value === 'today' ? '/' : `/?period=${option.value}`)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />
      {attention.error && <ErrorNote error={attention.error} />}
      {dashboard.error && <ErrorNote error={dashboard.error} />}

      <div className="tiles">
        <StatTile
          label="Need you"
          value={needs ?? '–'}
          to="/videos?state=approval"
          tone={needs ? 'approval' : undefined}
        />
        <StatTile
          label="In production"
          value={dashboard.data ? inProduction(dashboard.data.status_counts) : '–'}
          to="/videos?state=active"
        />
        <StatTile label="Finished" value={totals?.completed ?? '–'} tone="ok" />
        <StatTile
          label="Failed"
          value={totals?.failed ?? '–'}
          tone={totals?.failed ? 'stopped' : undefined}
        />
        <StatTile label="Cost" value={totals ? formatCost(totals.cost) : '–'} />
        <StatTile
          label="Workers online"
          value={workers.data ? `${online} of ${workers.data.length}` : '–'}
          to="/workers"
          tone={workers.data && online !== workers.data.length ? 'stopped' : undefined}
        />
      </div>

      <div className="grid">
        {attention.data ? (
          <NeedsYou data={attention.data} onChanged={reloadAll} />
        ) : (
          <Card title="Needs you" className="span-8">
            <Loading />
          </Card>
        )}
        <Card
          id="workers"
          title="Workers"
          className="span-4"
          action={<Link to="/workers">All workers</Link>}
        >
          {workers.error && <ErrorNote error={workers.error} />}
          {workers.data?.length === 0 && <p className="quiet">No worker has reported in yet.</p>}
          {workers.data && workers.data.length > 0 && (
            <WorkerTiles workers={workers.data} isCompact />
          )}
        </Card>

        <Card id="videos-per-day" title="Videos per day" className="span-7">
          {dashboard.data ? <DailyChart days={dashboard.data.days} /> : <Loading />}
        </Card>
        <Card id="cost-per-day" title="Cost per day" className="span-5">
          {dashboard.data ? <CostChart days={dashboard.data.days} /> : <Loading />}
          <p className="chart-note">
            Costs are recorded provider costs. Claude usage has no recorded cost.
          </p>
        </Card>

        {dashboard.data && <Failures failures={dashboard.data.failures} onChanged={reloadAll} />}
        {dashboard.data && <KitTable kits={dashboard.data.kits} />}

        {report.error && <ErrorNote error={report.error} />}
        {report.data && <PeriodSummary report={report.data} />}
      </div>
    </>
  );
}
