// The development channel: not a download, but a rebuild. On the machine the source lives on, the
// newest version is whatever is checked out — and the way to get it is the same batch file that has
// to close the running app before it can replace it. This exists because "the exe in dist is not
// the newest one" is the normal state of that arrangement, and nothing used to say so.
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

export interface DevUpdateDeps {
  /** The project folder. In a packaged copy on someone else's machine there is no git here. */
  projectDir: string;
  git?(args: string[], cwd: string): Promise<string>;
}

const gitIn = async (args: string[], cwd: string): Promise<string> => {
  const { stdout } = await run('git', args, { cwd, windowsHide: true });
  return stdout.trim();
};

export interface SourceState {
  headCommit: string;
  /** Commits on the checked-out branch that this build does not contain. */
  commitsBehind: number;
}

/** Strips the trailing + that marks a build made from a tree with uncommitted changes. */
export const bareCommit = (commit: string): string => commit.replace(/\+$/, '');

/**
 * How far the checked-out source has moved past the running build. Null whenever the question does
 * not apply: no git, not a repository, or a build from a commit git has never heard of.
 */
export async function sourceState(deps: DevUpdateDeps, buildCommit: string): Promise<SourceState | null> {
  const git = deps.git ?? gitIn;
  const built = bareCommit(buildCommit);
  if (built === '' || built === 'unknown' || built === 'dev') return null;

  try {
    if (!fs.existsSync(path.join(deps.projectDir, '.git'))) return null;
    const headCommit = await git(['rev-parse', '--short', 'HEAD'], deps.projectDir);
    if (headCommit === '') return null;
    if (headCommit === built) return { headCommit, commitsBehind: 0 };

    // Commits reachable from HEAD but not from what was built. A commit git cannot resolve — a
    // build from a branch since deleted, say — throws, and the answer is then simply unknown.
    const count = await git(['rev-list', '--count', `${built}..HEAD`], deps.projectDir);
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
export function startRebuild(projectDir: string, launcher = 'Build and run ShortStack.bat'): boolean {
  const script = path.join(projectDir, launcher);
  if (!fs.existsSync(script)) return false;

  const child = spawn('cmd.exe', ['/c', 'start', '""', script], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  return true;
}
