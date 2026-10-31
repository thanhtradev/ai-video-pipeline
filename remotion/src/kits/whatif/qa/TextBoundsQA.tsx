import React, { useEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Freeze,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/**
 * Text-out-of-frame QA: frame i of this composition = frame i × every of the episode. After the frame is built, measures all visible text
 * (HTML elements with direct text + SVG <text>, real opacity > 5%) and logs to the console any text partly outside the composition frame.
 * Text COMPLETELY outside the frame (invisible) is ignored. Text on a blurred background layer (blur > 2px) is tagged "blur" (informational). Run: node scripts/tiktok2/check-text-bounds.mjs <episode>.
 */
const MARGIN = 2;

const effectiveOpacity = (el: Element) => {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    o *= parseFloat(cs.opacity || '1');
    if (e instanceof SVGElement)
      o *=
        parseFloat(e.getAttribute('opacity') ?? '1') *
        parseFloat(e.getAttribute('fill-opacity') ?? '1');
  }
  return o;
};

/** Largest CSS blur on the path up to the root (Stage far/near background layers blur by depth). */
const blurOf = (el: Element) => {
  let b = 0;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(e).filter);
    if (m) b = Math.max(b, parseFloat(m[1]));
  }
  return b;
};

const ownText = (el: Element) =>
  el instanceof SVGTextElement
    ? (el.textContent ?? '').trim()
    : Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();

const measure = (root: HTMLElement, W: number, H: number) => {
  const box = root.getBoundingClientRect();
  const sx = box.width / W;
  const sy = box.height / H;
  const hits: string[] = [];
  root.querySelectorAll('*').forEach((el) => {
    if (el instanceof SVGTSpanElement) return;
    const txt = ownText(el);
    if (!txt || !/[\p{L}\p{N}]/u.test(txt)) return;
    if (effectiveOpacity(el) < 0.05) return;
    const r = el.getBoundingClientRect();
    const x0 = (r.left - box.left) / sx,
      x1 = (r.right - box.left) / sx,
      y0 = (r.top - box.top) / sy,
      y1 = (r.bottom - box.top) / sy;
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    if (x1 <= 0 || x0 >= W || y1 <= 0 || y0 >= H) return;
    const out = { l: -x0, r: x1 - W, t: -y0, b: y1 - H };
    const worst = Math.max(out.l, out.r, out.t, out.b);
    if (worst <= MARGIN) return;
    const side = (Object.keys(out) as (keyof typeof out)[])
      .filter((k) => out[k] > MARGIN)
      .map((k) => `${k}${Math.round(out[k])}`)
      .join(',');
    // "blur" = text on a blurred background layer (edge-cut like any background object in close-ups) – informational only
    const kind = blurOf(el) > 2 ? 'blur' : el instanceof SVGElement ? 'svg' : 'html';
    hits.push(
      `${kind}|${side}|${Math.round(x0)},${Math.round(y0)},${Math.round(x1)},${Math.round(y1)}|${txt.slice(0, 40)}`,
    );
  });
  return hits;
};

const Probe: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useVideoConfig();
  const [handle] = useState(() => delayRender(`text-bounds ${at}`));
  useEffect(() => {
    let alive = true;
    // wait for fonts + the scene's other delayRender calls, then measure on the browser's next frame
    document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!alive || !ref.current) return;
          console.log(`TEXTQA-PING ${at}`);
          for (const h of measure(ref.current, width, height)) console.log(`TEXTQA|${at}|${h}`);
          continueRender(handle);
        }),
      ),
    );
    return () => {
      alive = false;
    };
  }, [at, handle, width, height]);
  return (
    <AbsoluteFill ref={ref} style={{ overflow: 'hidden' }}>
      {children}
    </AbsoluteFill>
  );
};

export const TextBoundsQA: React.FC<{ every: number; children: React.ReactNode }> = ({
  every,
  children,
}) => {
  const at = useCurrentFrame() * every;
  return (
    <Probe key={at} at={at}>
      <Freeze frame={at}>{children}</Freeze>
    </Probe>
  );
};
