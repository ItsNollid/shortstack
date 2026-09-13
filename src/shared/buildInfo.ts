// What build this is. The values are replaced at build time by electron.vite.config.ts; the
// fallbacks are what a dev server sees, where the question does not arise.
declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;

export interface BuildInfo {
  /** ISO timestamp of when this build was produced. */
  builtAt: string;
  /** Short git commit, with a trailing + when the tree had uncommitted changes. */
  commit: string;
}

export function buildInfo(): BuildInfo {
  return {
    builtAt: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : new Date().toISOString(),
    commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev'
  };
}

/** "12 Sep 2026, 23:31 · d44a4ec" — short enough to sit in a corner, specific enough to compare. */
export function describeBuild(info: BuildInfo, now: Date = new Date()): string {
  const built = new Date(info.builtAt);
  if (Number.isNaN(built.getTime())) return info.commit;

  const when = built.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const ageDays = Math.floor((now.getTime() - built.getTime()) / 86_400_000);
  const age = ageDays >= 1 ? ` · ${ageDays} day${ageDays === 1 ? '' : 's'} old` : '';
  return `${when} · ${info.commit}${age}`;
}
