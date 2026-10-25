import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/800.css';
import { useEffect, useState, type ReactNode } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';

// Be Vietnam Pro (SIL OFL) has full Vietnamese diacritics. The @font-face rules load lazily, so
// rendering waits until both weights are ready; otherwise early frames fall back to another font.

export const FONT_FAMILY = '"Be Vietnam Pro", sans-serif';
const SAMPLE = 'Tiếng Việt ầẩẫậđ';

export function FontGate({ children }: { children: ReactNode }) {
  const [handle] = useState(() => delayRender('Loading Be Vietnam Pro'));
  useEffect(() => {
    Promise.all(
      ['500', '800'].map((weight) =>
        document.fonts.load(`${weight} 64px "Be Vietnam Pro"`, SAMPLE),
      ),
    )
      .then(() => continueRender(handle))
      .catch((error: unknown) => cancelRender(error));
  }, [handle]);
  return <>{children}</>;
}
