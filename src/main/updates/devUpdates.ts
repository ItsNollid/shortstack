// The development channel: not a download, but a rebuild. On the machine the source lives on, the
// newest version is whatever is checked out — and the way to get it is the same batch file that has
// to close the running app before it can replace it. This exists because "the exe in dist is not
// the newest one" is the normal state of that arrangement, and nothing used to say so.
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

export const LAUNCHER = 'Build and run ShortStack.bat';

/**
 * How far above the starting folder to look for the project. A packaged build runs from
 * dist\win-unpacked\resources\app.asar, which is four levels below it. Looking further would start
 * finding unrelated repositories on someone else's machine.
 */
const MAX_LEVELS_UP = 4;

export interface DevUpdateDeps {
  /** Where to start looking. Any folder at or within a few levels below the project will do. */
  projectDir: string;
  git?(args: string[], cwd: string): Promise<string>;
}

const gitIn = async (args: string[], cwd: string): Promise<string> => {
  const { stdout } = await run('git', args, { cwd, windowsHide: true });
  return stdout.trim();
};

/**
 * The ShortStack project folder, found by walking up from where the app is running.
 *
 * This used to be worked out as three levels up from the app, which from
 * dist\win-unpacked\resources\app.asar is dist — not the project. So in the packaged build this
 * computer actually runs, the "your source is ahead of this build" check never found a repository and
 * the rebuild button never found its batch file: the feature could not appear where it was needed.
 *
 * A folder only counts if it has both a repository and the launcher, so an installed copy on a friend's
 * machine finds nothing rather than a repository that happens to sit above it.
 */
export function locateProject(start: string, levels = MAX_LEVELS_UP): string | null {
  let dir = path.resolve(start);
  for (let level = 0; level <= levels; level += 1) {
    if (fs.existsSync(path.join(dir, '.git')) && fs.existsSync(path.join(dir, LAUNCHER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export interface SourceState {
  headCommit: string;
  /** Commits on the checked-out branch that this build does not contain. */
  commitsBehind: number;
}

/** Strips the trailing + that marks a build made from a tree with uncommitted changes. */
export const bareCommit = (commit: string): string => commit.replace(/\+$/, '');

/**
 * How far the checked-out source has moved past the running build. Null whenever the question does
 * not apply: no project found, not a repository, or a build from a commit git has never heard of.
 */
export async function sourceState(deps: DevUpdateDeps, buildCommit: string): Promise<SourceState | null> {
  const git = deps.git ?? gitIn;
  const built = bareCommit(buildCommit);
  if (built === '' || built === 'unknown' || built === 'dev') return null;

  try {
    const root = locateProject(deps.projectDir);
    if (root === null) return null;
    const headCommit = await git(['rev-parse', '--short', 'HEAD'], root);
    if (headCommit === '') return null;
    if (headCommit === built) return { headCommit, commitsBehind: 0 };

    // Commits reachable from HEAD but not from what was built. A commit git cannot resolve — a
    // build from a branch since deleted, say — throws, and the answer is then simply unknown.
    const count = await git(['rev-list', '--count', `${built}..HEAD`], root);
    const commitsBehind = Number(count);
    return Number.isFinite(commitsBehind) ? { headCommit, commitsBehind } : null;
  } catch {
    return null;
  }
}

/**
 * Starts the batch file in its own console and returns. It closes this app before it can replace
 * the folder the app is running from, so there is nothing sensible to wait for.
 */
export function startRebuild(projectDir: string, launcher = LAUNCHER): boolean {
  const root = locateProject(projectDir);
  if (root === null) return false;
  const script = path.join(root, launcher);
  if (!fs.existsSync(script)) return false;

  const child = spawn('cmd.exe', ['/c', 'start', '""', script], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  return true;
}
