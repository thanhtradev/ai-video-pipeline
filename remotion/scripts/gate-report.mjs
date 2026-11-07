// What a gate run must pass (episode-gates.mjs). A draft run skips the audio mix (D-114).

const STEPS = ['typecheck', 'sfx', 'board', 'mix', 'textBounds'];

/** True when every step this run was due to make passed. A skipped mix never counts as a pass. */
export function gatesPassed(report, { draft = false } = {}) {
  const due = draft ? STEPS.filter((step) => step !== 'mix') : STEPS;
  return due.every((step) => report[step]?.ok === true);
}
