import type { Cost, DashboardDay, StatusCounts } from '../../../../shared/types';

export interface PeriodTotals {
  started: number;
  completed: number;
  failed: number;
  cost: Cost;
}

/** The tiles sum the chart's rows, so the two always agree. */
export function sumDays(days: DashboardDay[]): PeriodTotals {
  return days.reduce<PeriodTotals>(
    (totals, day) => ({
      started: totals.started + day.started,
      completed: totals.completed + day.completed,
      failed: totals.failed + day.failed,
      cost: Object.entries(day.cost).reduce<Cost>(
        (cost, [currency, amount]) => ({ ...cost, [currency]: (cost[currency] ?? 0) + amount }),
        totals.cost,
      ),
    }),
    { started: 0, completed: 0, failed: 0, cost: {} },
  );
}

/** Videos not finished, the same set as the Videos page's "In production" filter. */
export function inProduction(counts: StatusCounts): number {
  return counts.stopped + counts.approval + counts.running + counts.waiting;
}
