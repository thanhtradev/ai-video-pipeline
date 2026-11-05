import { useEffect, useState } from 'react';

// Recharts takes colours as props, so the CSS tokens are read once and again when the colour
// scheme changes. Nothing here injects a stylesheet: the content security policy stays 'self'.

export interface ChartTheme {
  completed: string;
  started: string;
  failed: string;
  grid: string;
  ink: string;
  muted: string;
  card: string;
  line: string;
}

const FALLBACK: ChartTheme = {
  completed: '#1f7a4d',
  started: '#2a6fd6',
  failed: '#bb2d24',
  grid: '#e3e9ee',
  ink: '#17242f',
  muted: '#566875',
  card: '#ffffff',
  line: '#c6d1d9',
};

function readTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    completed: token('--chart-completed', FALLBACK.completed),
    started: token('--chart-started', FALLBACK.started),
    failed: token('--chart-failed', FALLBACK.failed),
    grid: token('--chart-grid', FALLBACK.grid),
    ink: token('--ink', FALLBACK.ink),
    muted: token('--muted', FALLBACK.muted),
    card: token('--card', FALLBACK.card),
    line: token('--line', FALLBACK.line),
  };
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);
  useEffect(() => {
    setTheme(readTheme());
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => setTheme(readTheme());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return theme;
}

const dayLabel = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });

/** "2026-11-05" as "05 Nov". The day is already a local date, so it is parsed as one. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return dayLabel.format(new Date(year, month - 1, date));
}

/** The style Recharts gives its tooltip box, in the console's colours. */
export function tooltipStyle(theme: ChartTheme): React.CSSProperties {
  return {
    background: theme.card,
    border: `1px solid ${theme.line}`,
    borderRadius: 6,
    color: theme.ink,
    fontSize: 13,
  };
}
