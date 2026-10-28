/**
 * On-screen language of the kit (`tr`) and the language switch the EP1 timeline listens to.
 * Episodes with one language never call setLang; `tr` then always returns the Vietnamese text.
 */
export type Lang = 'vi' | 'en';
export let LANG: Lang = 'vi';
const listeners: (() => void)[] = [];
/** Registers cache invalidation for language-dependent data. */
export const onLang = (fn: () => void) => listeners.push(fn);
export const setLang = (l: Lang) => {
  if (l === LANG) return;
  LANG = l;
  for (const fn of listeners) fn();
};
/** On-screen text for the current language. */
export const tr = <T>(vi: T, en: T): T => (LANG === 'en' ? en : vi);
