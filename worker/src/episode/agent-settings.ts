import { join } from 'node:path';

// Claude Code settings for the episode agent (D-053, D-054), written outside the workspace. Spike
// results (2026-10-26, CLI 2.1.310): Read/Edit permission rules confine the file tools; Bash runs
// in the macOS sandbox, which denies network, writes outside the workspace and reads of the paths
// below. Sandboxed Bash would otherwise be auto-allowed, so auto-allow is off: only the two
// commands below (any arguments, never chained with another command) and the CLI's built-in
// read-only commands (cat, ls, grep, sed, …) run. No npm (it reads ~/.npmrc). Glob/Grep tools do
// not exist in this CLI version; the workspace has FILES.md instead.

const TYPECHECK_PREFIX = 'node node_modules/typescript/bin/tsc';
const SFX_PREFIX = 'node sfx/generate-sfx.mjs';
export const TYPECHECK_COMMAND = `${TYPECHECK_PREFIX} -p tsconfig.json`;
export const SFX_COMMAND = `${SFX_PREFIX} public/sfx`;

/** Home paths with credentials or private data that sandboxed commands must not read. */
const DENY_READ = [
  '~/.ssh',
  '~/.config',
  '~/.claude',
  '~/.claude.json',
  '~/.aws',
  '~/.gnupg',
  '~/.netrc',
  '~/.npmrc',
  '~/.docker',
  '~/.kube',
  '~/Library',
  '~/Documents',
  '~/Desktop',
  '~/Downloads',
  '~/Pictures',
  '~/Movies',
  '~/Music',
  '~/MediaLibrary',
  '~/.zsh_history',
  '~/.bash_history',
  '/Volumes',
];

/** Workspace files the worker provides; the agent must not change them. */
const PROTECTED = [
  'CLAUDE.md',
  '.claude',
  'brief.md',
  'rules.md',
  'feedback.md',
  'FILES.md',
  'kit',
  'package.json',
  'tsconfig.json',
  'src/index.ts',
  'src/Root.tsx',
  'src/time.ts',
  'src/env.d.ts',
  'src/data',
  'public/voice.wav',
  'node_modules',
];

/** Settings for a workspace at the absolute (real) path `ws`. */
export function agentSettings(ws: string) {
  // "//" marks an absolute path in permission rules.
  const abs = (path: string) => `/${join(ws, path)}`;
  return {
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      network: { allowedDomains: [], strictAllowlist: true },
      filesystem: { denyRead: DENY_READ, denyWrite: PROTECTED.map((p) => join(ws, p)) },
    },
    permissions: {
      allow: [
        `Read(${abs('**')})`,
        `Edit(${abs('src/episode/**')})`,
        `Edit(${abs('sfx/**')})`,
        `Bash(${TYPECHECK_PREFIX}:*)`,
        `Bash(${SFX_PREFIX}:*)`,
      ],
      deny: [
        'WebFetch',
        'WebSearch',
        'Read(~/.ssh/**)',
        'Read(~/.config/**)',
        'Read(~/.claude/**)',
      ],
    },
  };
}
