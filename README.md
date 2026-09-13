# ShortStack

A Windows desktop app that watches a folder of finished YouTube Shorts, lets you approve them, and
gets them onto your channel at times you choose. Electron, React and SQLite; everything stays on
your computer.

It is built for one particular way of working: post a video, and keep re-posting it on a rotation
so it reaches people who missed it the first time — without notifying your subscribers every time.

## What it does

- **Watches a folder.** New renders appear in a queue. Nothing leaves it without your approval.
- **Schedules by dragging onto a calendar.** YouTube publishes at the time, so your computer can be
  off.
- **Re-posts on a rotation.** Announcements notify subscribers; re-runs do not.
- **Drafts titles, descriptions and tags** with a model running locally through
  [Ollama](https://ollama.com). A model that can see images is shown stills from the video, so it
  can name the game rather than guess from the file name. Nothing is sent anywhere else.
- **Reuses details from videos you published before**, from a searchable list of your uploads.
- **Uploads either way**: through YouTube Studio with ShortStack walking you through it, or
  directly through the API once your Google Cloud project passes YouTube's audit.

## Running it

```bash
npm install
npm run dev          # dev profile, cannot upload anything
npm run verify       # typecheck, tests, build
npm test             # tests only
npx playwright test  # drives the real app
```

Or double-click **Build and run ShortStack.bat**, which closes any running copy, rebuilds, and
starts the packaged app against your real profile.

Unpackaged runs always use a separate `shortstack-dev` profile and can never upload. Going live
needs both `SHORTSTACK_PROFILE=live` and `SHORTSTACK_UPLOAD_MODE=live`.

## Setting it up

You need your own Google Cloud project with the YouTube Data API enabled and an OAuth client of type
Desktop app. ShortStack asks for the `client_secret.json` on first run and keeps it on your
computer; there is no ShortStack server and no shared credentials.

Until that project passes [YouTube's API audit](https://support.google.com/youtube/contact/yt_api_form),
anything uploaded through the API is locked private permanently — which is why assisted upload
through Studio is the default.

## Updating

Built from source on this machine: Settings → Updates says how far the source has moved past your
build, and rebuilds on request. Installed from a release: it checks GitHub, tells you when there is
something newer, and downloads only when you ask. See [docs/releasing.md](docs/releasing.md).

## Privacy

Everything is kept on your computer: the database, your settings, and your Google tokens, which are
encrypted with Windows' own secure storage. The only services it contacts are Google's YouTube APIs
and — only if you switch it on — Ollama on `127.0.0.1`. The full text is in
[docs/legal](docs/legal), and reachable inside the app at any time.

ShortStack is not affiliated with, endorsed by, or sponsored by YouTube or Google.

## Where things are

| Path | What is in it |
|---|---|
| `src/main` | Electron main process: database, scheduler, YouTube, Ollama, updates |
| `src/renderer` | The interface |
| `src/shared` | Pure rules used by both, where most of the tests live |
| `src/main/domain/queueState.ts` | The state machine every lifecycle change goes through |
| `e2e` | Playwright, driving the real application |
| `CLAUDE_HANDOFF.md` | An honest account of what works, what does not, and what is unknown |
