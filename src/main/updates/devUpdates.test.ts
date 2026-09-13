import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { bareCommit, sourceState, startRebuild } from './devUpdates';

const dirs: string[] = [];
const repo = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-dev-'));
  fs.mkdirSync(path.join(dir, '.git'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const git = (answers: Record<string, string>) => async (args: string[]): Promise<string> => {
  const key = args.join(' ');
  const answer = answers[key];
  if (answer === undefined) throw new Error(`unexpected: ${key}`);
  return answer;
};

describe('sourceState', () => {
  it('counts the commits the build is missing', async () => {
    const projectDir = repo();
    const answers = { 'rev-parse --short HEAD': 'abc9999', 'rev-list --count d44a4ec..HEAD': '3' };
    await expect(sourceState({ projectDir, git: git(answers) }, 'd44a4ec')).resolves.toEqual({
      headCommit: 'abc9999',
      commitsBehind: 3
    });
  });

  // A build made from a dirty tree is stamped with a trailing +, which is not a commit git knows.
  it('strips the dirty marker before asking git about the commit', async () => {
    const projectDir = repo();
    const answers = { 'rev-parse --short HEAD': 'abc9999', 'rev-list --count d44a4ec..HEAD': '1' };
    await expect(sourceState({ projectDir, git: git(answers) }, 'd44a4ec+')).resolves.toMatchObject({ commitsBehind: 1 });
  });

  it('is up to date when the build is the checked-out commit', async () => {
    const projectDir = repo();
    await expect(sourceState({ projectDir, git: git({ 'rev-parse --short HEAD': 'd44a4ec' }) }, 'd44a4ec')).resolves.toEqual({
      headCommit: 'd44a4ec',
      commitsBehind: 0
    });
  });

  // Everything a friend's installed copy looks like: no repository, nothing to compare against.
  it('answers nothing where the question does not apply', async () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-norepo-'));
    dirs.push(notARepo);
    await expect(sourceState({ projectDir: notARepo, git: git({}) }, 'd44a4ec')).resolves.toBeNull();

    const projectDir = repo();
    for (const commit of ['', 'unknown', 'dev']) {
      await expect(sourceState({ projectDir, git: git({}) }, commit), commit).resolves.toBeNull();
    }
  });

  it('answers nothing when git does not recognise the build', async () => {
    const projectDir = repo();
    const failing = async (args: string[]): Promise<string> => {
      if (args[0] === 'rev-parse') return 'abc9999';
      throw new Error("fatal: bad revision 'deadbee..HEAD'");
    };
    await expect(sourceState({ projectDir, git: failing }, 'deadbee')).resolves.toBeNull();
  });
});

describe('startRebuild', () => {
  it('refuses when the launcher is not there, rather than pretending it started', () => {
    expect(startRebuild(repo(), 'nothing-here.bat')).toBe(false);
  });
});

describe('bareCommit', () => {
  it('removes the dirty marker and nothing else', () => {
    expect(bareCommit('d44a4ec+')).toBe('d44a4ec');
    expect(bareCommit('d44a4ec')).toBe('d44a4ec');
    expect(bareCommit('')).toBe('');
  });
});
