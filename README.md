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
- **Looks at the video.** Stills from across the clip offer a cover frame from the play rather than
  a menu, say whether the first second shows anything worth staying for, and flag a title that
  promises something the picture does not show.
- **Listens, if you switch it on.** whisper.cpp turns what is said into text on this computer, and
  the titles get written from it. Off by default; the engine and model are downloaded from Settings.
- **Posts to TikTok and Instagram too**, the same way: it makes a copy in the format each one takes,
  hands you the caption, opens their site, and keeps the link to your post. It holds no account with
  either, and each platform is a per-video choice.
- **Fills the calendar in one click**, giving every video without a time the next free one from your
  daily times — shown as a list first, undone from the message, and never an approval.
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

Everything is kept on your computer: the database, your settings, transcripts, and your Google tokens,
which are encrypted with Windows' own secure storage. What it contacts, and nothing else: Google's
YouTube APIs; Ollama on `127.0.0.1`, if you switch suggestions on; GitHub and Hugging Face, only when
you ask it to download listening software; and GitHub Releases, to see whether a newer version exists.
TikTok and Instagram are opened in your browser for you to post — ShortStack sends them nothing itself.
The full text is in [docs/legal](docs/legal), and reachable inside the app at any time.

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
