export function confirmAction(message: string): boolean {
  const c = (globalThis as any).confirm;
  return typeof c === 'function' ? !!c(message) : true;
}

/** Returns the text, or null if the admin cancelled. */
export function askText(message: string, initial = ''): string | null {
  const p = (globalThis as any).prompt;
  if (typeof p !== 'function') return initial;
  const r = p(message, initial);
  return r === null ? null : String(r).trim();
}
