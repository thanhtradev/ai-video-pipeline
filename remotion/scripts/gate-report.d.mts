/** True when every step this gate run was due to make passed (gate-report.mjs). */
export function gatesPassed(
  report: Readonly<Record<string, { ok?: boolean } | undefined>>,
  options?: { draft?: boolean },
): boolean;
