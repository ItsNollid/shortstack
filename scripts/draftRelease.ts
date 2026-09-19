// Creates the GitHub draft release for this version before electron-builder uploads to it.
//
// Left to itself, electron-builder uploads the installer and its blockmap at the same time, and each
// upload creates the release when it finds none — so both 1.1.0 and 1.2.0 came out as two drafts, one
// holding only the blockmap. With the draft already there, every upload lands in the same one.
// Run by `npm run release`, with GH_TOKEN set.
import { readFileSync } from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..');
const version = (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string }).version;
const tag = `v${version}`;
const repository = 'ItsNollid/shortstack';
const token = process.env.GH_TOKEN;

async function github(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repository}${pathname}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token ?? ''}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
}

async function main(): Promise<void> {
  if (token === undefined || token === '') throw new Error('Set GH_TOKEN before releasing');

  // Drafts are not reachable by tag, so the list is searched instead.
  const listed = await github('/releases?per_page=30');
  if (!listed.ok) throw new Error(`Could not list releases: ${listed.status} ${await listed.text()}`);
  const releases = (await listed.json()) as Array<{ id: number; tag_name: string; draft: boolean; html_url: string }>;
  const notes = readFileSync(path.join(root, 'docs', 'releases', `${version}.md`), 'utf8');

  const existing = releases.find((release) => release.tag_name === tag);
  if (existing !== undefined) {
    if (!existing.draft) throw new Error(`${tag} is already published. Bump the version before releasing again.`);
    // The notes usually moved on since the draft was made, so they are sent again. The tag goes with them and
    // is not optional: a PATCH carrying only a body clears a draft tag, and electron-builder, finding no
    // release for the version, then makes a second draft and splits the installer across the two.
    const updated = await github(`/releases/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ tag_name: tag, name: `ShortStack ${version}`, body: notes, draft: true })
    });
    if (!updated.ok) throw new Error(`Could not update the draft: ${updated.status} ${await updated.text()}`);
    console.info(`Updated the notes on draft ${tag}: ${existing.html_url}`);
    return;
  }
  const created = await github('/releases', {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, name: `ShortStack ${version}`, body: notes, draft: true })
  });
  if (!created.ok) throw new Error(`Could not create the draft: ${created.status} ${await created.text()}`);
  console.info(`Created draft ${tag}: ${((await created.json()) as { html_url: string }).html_url}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
