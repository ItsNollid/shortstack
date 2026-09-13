import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LAUNCHER, bareCommit, locateProject, sourceState, startRebuild } from './devUpdates';

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-dev-'));
  dirs.push(dir);
  return dir;
};

/** What the project folder looks like: a repository with the launcher beside it. */
const project = (): string => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, LAUNCHER), '@echo off\r\n');
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const git = (answers: Record<string, string>, seen: string[] = []) => async (args: string[], cwd: string): Promise<string> => {
  seen.push(cwd);
  const key = args.join(' ');
  const answer = answers[key];
  if (answer === undefined) throw new Error(`unexpected: ${key}`);
  return answer;
};

describe('locateProject', () => {
  it('finds the project from the project itself', () => {
    const root = project();
    expect(locateProject(root)).toBe(path.resolve(root));
  });

  // The packaged build runs from dist\win-unpacked\resources\app.asar. Three levels up from there is
  // dist, which is where the old calculation stopped, so the feature never appeared in that build.
  it('finds the project from where the packaged build runs', () => {
    const root = project();
    const packaged = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
    fs.mkdirSync(packaged, { recursive: true });
    expect(locateProject(packaged)).toBe(path.resolve(root));
  });

  // An installed copy on someone else's machine must not adopt a repository that happens to be above it.
  it('does not count a repository without the launcher', () => {
    const repo = tempDir();
    fs.mkdirSync(path.join(repo, '.git'));
    const inside = path.join(repo, 'a', 'b');
    fs.mkdirSync(inside, { recursive: true });
    expect(locateProject(inside)).toBeNull();
  });

  it('gives up after a few levels rather than searching the whole disk', () => {
    const root = project();
    const deep = path.join(root, 'one', 'two', 'three', 'four', 'five', 'six');
    fs.mkdirSync(deep, { recursive: true });
    expect(locateProject(deep)).toBeNull();
  });
});

describe('sourceState', () => {
  it('counts the commits the build is missing', async () => {
    const answers = { 'rev-parse --short HEAD': 'abc9999', 'rev-list --count d44a4ec..HEAD': '3' };
    await expect(sourceState({ projectDir: project(), git: git(answers) }, 'd44a4ec')).resolves.toEqual({
      headCommit: 'abc9999',
      commitsBehind: 3
    });
  });

  it('asks git in the project folder, even when started from inside the packaged build', async () => {
    const root = project();
    const packaged = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
    fs.mkdirSync(packaged, { recursive: true });
    const seen: string[] = [];

    await sourceState({ projectDir: packaged, git: git({ 'rev-parse --short HEAD': 'd44a4ec' }, seen) }, 'd44a4ec');
    expect(seen).toEqual([path.resolve(root)]);
  });

  // A build made from a dirty tree is stamped with a trailing +, which is not a commit git knows.
  it('strips the dirty marker before asking git about the commit', async () => {
    const answers = { 'rev-parse --short HEAD': 'abc9999', 'rev-list --count d44a4ec..HEAD': '1' };
    await expect(sourceState({ projectDir: project(), git: git(answers) }, 'd44a4ec+')).resolves.toMatchObject({
      commitsBehind: 1
    });
  });

  it('is up to date when the build is the checked-out commit', async () => {
    await expect(
      sourceState({ projectDir: project(), git: git({ 'rev-parse --short HEAD': 'd44a4ec' }) }, 'd44a4ec')
    ).resolves.toEqual({ headCommit: 'd44a4ec', commitsBehind: 0 });
  });

  // Everything a friend's installed copy looks like: no project, nothing to compare against.
  it('answers nothing where the question does not apply', async () => {
    await expect(sourceState({ projectDir: tempDir(), git: git({}) }, 'd44a4ec')).resolves.toBeNull();
    for (const commit of ['', 'unknown', 'dev']) {
      await expect(sourceState({ projectDir: project(), git: git({}) }, commit), commit).resolves.toBeNull();
    }
  });

  it('answers nothing when git does not recognise the build', async () => {
    const failing = async (args: string[]): Promise<string> => {
      if (args[0] === 'rev-parse') return 'abc9999';
      throw new Error("fatal: bad revision 'deadbee..HEAD'");
    };
    await expect(sourceState({ projectDir: project(), git: failing }, 'deadbee')).resolves.toBeNull();
  });
});

describe('startRebuild', () => {
  it('refuses when there is no project to rebuild', () => {
    expect(startRebuild(tempDir())).toBe(false);
  });

  it('refuses when the launcher asked for is not there, rather than pretending it started', () => {
    expect(startRebuild(project(), 'nothing-here.bat')).toBe(false);
  });
});

describe('bareCommit', () => {
  it('removes the dirty marker and nothing else', () => {
    expect(bareCommit('d44a4ec+')).toBe('d44a4ec');
    expect(bareCommit('d44a4ec')).toBe('d44a4ec');
    expect(bareCommit('')).toBe('');
  });
});
