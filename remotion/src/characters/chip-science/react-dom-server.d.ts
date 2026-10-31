// Minimal typing for the server renderer used by hosts.test.tsx (no @types/react-dom installed).
declare module 'react-dom/server' {
  import type { ReactElement } from 'react';
  export function renderToStaticMarkup(element: ReactElement): string;
}
