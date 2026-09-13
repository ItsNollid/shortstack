# ShortStack — where things actually stand

A Windows desktop app for one creator: it watches a folder of finished Shorts, lets you approve
them, and gets them onto your YouTube channel at times you choose. Electron + React + SQLite.

**Read this before trusting anything:** the previous handoff document said the backend was
finished. It was not. What follows is meant to be accurate, including about what is still unknown.

---

## Run it

```bash
npm install
npm run dev            # the app, dev profile, dry-run
npm test               # 548 tests
npm run typecheck      # main + renderer
npm run build          # electron-vite build
npm run preview:ui     # the interface in a browser, with stubbed data, for design work
npm run docs:legal     # regenerate docs/legal/*.md from the text bundled in the app
```

Or double-click, from the project folder:

- **Build and run ShortStack.bat** — rebuilds and starts the packaged app, which uses the real
  profile and the real channel.
- **Run ShortStack (test profile).bat** — the same build against `shortstack-dev`, which cannot
  upload anything.

```bash
```

### Profiles — the safety net

An unpackaged run **always** uses `%APPDATA%\shortstack-dev` and refuses to upload. Touching the
live profile takes **both** `SHORTSTACK_PROFILE=live` and `SHORTSTACK_UPLOAD_MODE=live`. This
exists because a dev instance was previously running against the real profile with a scheduler
that uploaded the same video every hour.

---

## How it is built

```
src/shared/    Vocabulary and rules both sides need. Pure, heavily tested.
src/main/      Everything with a side effect: database, scheduler, YouTube, files, icons.
src/renderer/  React. Talks to main only through the typed contract in shared/ipc.ts.
```

The rule that holds the rest together: **anything that makes a decision is a pure function with
tests, and anything that performs an effect is a thin wrapper around one.** The state machine, the
scheduler's choices, slot allocation, drag-and-drop rules, the publish plan and every piece of
user-facing wording work this way.

### The parts worth knowing

| Where | What it decides |
|---|---|
| `main/domain/queueState.ts` | The state machine. Every lifecycle change goes through `transition()`. |
| `main/scheduler/decide.ts` | What the 30-second tick should do. Returns actions; performs none. |
| `main/scheduler/effects.ts` | Performs them. The retry ladder lives here. |
| `shared/slots.ts` | Which publish slot a day offers. Built as local wall-clock, stored as UTC. |
| `shared/calendarDnd.ts` | Whether a drop is allowed, and why not. |
| `shared/queueActions.ts` | Which bulk actions a selection can take. |
| `shared/consent.ts` | What the approval dialog promises, per upload mode. |
| `shared/presentation.ts` | Every state's label, tone and explanation. One place. |

Several of those have tests that cross-check them **against the state machine itself**, so the UI
cannot offer an action the backend will refuse.

### The invariant that matters most

**A queue item with a `youtube_video_id` or a `remote_tombstone` never uploads again.** Everything
about duplicate protection rests on it. If you change the state machine, that is the property to
keep.

---

## What was wrong, and is now fixed

The original build was audited against its own code, the live database and the official API docs.
The confirmed faults:

- One approval caused an upload **every hour, forever** — the scheduler re-picked rows it had
  already uploaded.
- Pause did not survive a restart, and was overridden at boot.
- Privacy defaults were ignored; everything would have gone out **public**.
- One failing item blocked the entire queue (`LIMIT 1` with no error handling).
- SQL was built from keys supplied by the renderer.
- Uploads were not resumable — a dropped connection restarted a 157 MB file, or duplicated it.
- `useIPC` refetched forever; the AI button did nothing; Analytics never loaded; the Calendar was a
  mock; the tray icon was `createEmpty()`, so it was invisible.
- OAuth listened on all interfaces with no `state` parameter, and dropped refresh tokens.
- No migrations, no tests, no typecheck.

Found later, while building on top:

- The scheduler announced its changes on a channel the renderer did not listen to, so **nothing the
  backend did on its own ever reached the screen**. Now routed through one typed helper, with a
  test that refuses raw channel names.
- The legacy hourly-cron scheduler was still sitting in the tree, fully intact and one import from
  being live. Deleted, along with the plaintext-token auth module and the non-resumable uploader.

---

## The thing that shapes the whole product

**An unaudited Google Cloud project permanently locks every API upload to private.** Not a quota,
not a delay — no appeal, no way to publish it afterwards.

So ShortStack defaults to **assisted mode**: it prepares each video, hands you the exact title,
description, tags, visibility and time, opens Studio, and links the result back automatically by
file name and size. Automatic API uploads exist and work, but cannot be switched on without an
explicit confirmation that your project passed the audit.

`docs/audit/` holds drafted answers for the audit form and a screencast script. `docs/legal/` holds
the hostable policy and terms, generated from the same text the app displays.

---

## Rotation

The channel strategy this app is built for is posting the same video more than once, so each run
reaches people who missed the last one. That shapes more of the design than anything else.

**The invariant survives it.** "Never upload twice" is per *posting*, not per file. One video has
many queue rows; each one uploads exactly once. Accidental duplicates are still refused.

| Fact | Where |
|---|---|
| Which posting is an announcement, which a re-run | `shared/rotation.ts` |
| Whether another posting is due | `shouldRotate` — limit, manual pause, one in flight, minimum gap |
| What a re-run inherits | `createPosting` in `db/rotationRepo.ts` |
| Which times it uses | `decide.ts` — new and rotation draw from separate lists |

Three rules worth not breaking:

1. **A re-run never notifies subscribers.** Decided by `shouldNotifySubscribers`, not by a copied
   field, so an edit cannot undo it.
2. **A re-run starts as pending.** Posting again is still something the user approves.
3. **`published_before` exists for the back catalogue.** Deriving "new" from posting count alone
   would announce every previously published video as though it had never been posted.

There is a minimum gap between postings, fourteen days by default. Re-posting a short a day later
reaches the same people and is the pattern YouTube’s repetitious content rules are aimed at. It can
be switched off; the Settings hint says why it is there.

**Review** (`/review`) is the screen for deciding at volume: one card, single-key actions, and a
cursor that stays put as the list shrinks under it.

---

## Still unverified

Being specific about this, because the last handoff was not.

- **No upload has ever run against a real channel.** The resumable uploader is tested against a
  local mock server covering 308, 404, 5xx, crash-resume and completed-before-crash. It has not
  been tested against Google.
- **Whether an unaudited project may set `publishAt`** on a video uploaded through Studio. If
  YouTube refuses, the item is flagged "set the schedule in Studio" with the exact time.
- **Whether `fileDetails` is returned for private videos**, which is how assisted uploads are
  detected. The paste-the-link fallback exists for when it is not.

Answered since: **Windows does repaint the taskbar button** when `setIcon` is called on an
installed build — confirmed by a person looking at their own taskbar. The channel picture goes
there, and the corner badge now carries what the icon cannot: paused, or needing attention.

Answered since: **Chromium does play H.264 with LPCM audio in a QuickTime container.** Measured
rather than assumed — readyState 4, 1080x1920, 17.7s, no error. Videos play in the app through the
`ss-media://` scheme, and poster frames are drawn from them.

### Suggestions from the local model

The first version sent one sentence containing the file name, which is why its suggestions were
worthless. The prompt now carries the channel's own recent uploads as examples, the video's facts,
and up to three 512px JPEG stills taken from three points in the clip — drawn in the same decode
pass as the list poster, because decoding is the expensive part. `e2e/frames.spec.ts` runs that
against a real file: three stills at about 43KB each.

Frames are only sent to a model that can read them. Ollama reports each model's capabilities, so
that is the answer used; the name check in `shared/aiModels.ts` is the fallback for daemons that do
not report the field, and Settings tells the user which case they are in.

The prompt text was tuned against the installed llama3.2 rather than guessed at. Two things it
fixed: the model was copying hashtags out of an example onto a video they did not describe, and it
returned five tags when asked for ten to twenty until the count was restated in the final line. A
3B text-only model is still the limit here — the frames only start earning their keep with a vision
model installed.

---

## If you are picking this up

1. `npm test` and `npm run typecheck` before and after anything.
2. Lifecycle changes go through `transition()`. Do not write queue state from anywhere else.
3. New user-facing wording goes in `shared/presentation.ts`, not inline.
4. New renderer events go through `broadcast()` in `main/ipc.ts`.
5. The manual approval gate is not a formality — it is the thing standing between a folder of files
   and someone's channel. Leave it alone.
