import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/800.css';
import '@fontsource/patrick-hand/400.css';
import { cancelRender, continueRender, delayRender } from 'remotion';

// Fonts ship with the bundle (@fontsource, SIL OFL) so a render needs no network: the episode
// workspace renders inside a sandbox with networking denied (D-053). The @font-face rules load
// lazily, so rendering waits until every face is ready with its Vietnamese glyphs.

export const FONT = "'Baloo 2'";
/** Handwriting (red teacher's remark). */
export const HAND = "'Patrick Hand'";

const SAMPLE = 'Tiếng Việt ầẩẫậđ';
const FACES = [`600 64px ${FONT}`, `800 64px ${FONT}`, `400 64px ${HAND}`];

const handle = delayRender('Loading channel fonts');
Promise.all(FACES.map((face) => document.fonts.load(face, SAMPLE)))
  .then(() => continueRender(handle))
  .catch((error: unknown) => cancelRender(error));
