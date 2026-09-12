# YouTube API Services — Audit and Quota Extension form

Draft answers for <https://support.google.com/youtube/contact/yt_api_form>.
**Review every line before submitting.** Anything in _italics_ needs a value only you have.

---

## The application

**Name** — ShortStack

**What it is** — A desktop application (Windows, Electron) that a single creator runs on their own
computer to queue, approve and schedule their own YouTube Shorts. It is not a service: there is no
ShortStack server, no account, and no multi-tenant component. Each user supplies credentials from
their own Google Cloud project.

**Who uses it** — The owner of the channel, on their own machine. _State here whether you intend to
distribute it to others or use it only yourself._

**Where the data goes** — Nowhere. Queue, settings, tokens and cached channel details live in a
local SQLite database and files under `%APPDATA%\ShortStack`. OAuth tokens are encrypted with the
operating system's secure storage. The only hosts contacted are Google's own APIs, plus an
optional Ollama model running on the same computer.

---

## Why the audit is being requested

Not for quota. Requested so that videos uploaded through the API are not permanently locked to
private visibility. ShortStack's whole purpose is scheduling a channel's own Shorts to publish at
set times, which an unaudited project cannot do.

Until the audit passes, ShortStack defaults to **assisted mode**: it prepares each video and walks
the user through uploading it in YouTube Studio themselves, then links the result back. Automatic
API uploads are switched off and cannot be enabled without an explicit confirmation that the audit
has passed.

---

## API methods used, with estimated daily usage

Estimates for one creator posting up to a handful of Shorts a day.

| Method | Why | Units each | Calls/day | Units/day |
|---|---|---|---|---|
| `videos.insert` | Upload an approved video (automatic mode only) | 1600 | 0–5 | 0–8000 |
| `videos.list` (part=status) | Confirm what YouTube holds before changing it, and check whether a scheduled video went public | 1 | ~40 | ~40 |
| `videos.update` (part=status) | Set or change the publish time and visibility | 50 | 0–10 | 0–500 |
| `channels.list` (snippet, statistics, contentDetails) | Identify the connected channel and refresh its details | 1 | ~2 | ~2 |
| `playlistItems.list` | Find recently uploaded videos, to link a Studio upload back to its queue entry | 1 | ~30 | ~30 |
| `youtubeAnalytics.reports.query` | Show the user their own channel figures | — | ~5 | — |

**Typical day, assisted mode:** well under 200 units.
**Typical day, automatic mode:** 1600–8500 units.

Scopes requested:
`youtube.upload`, `youtube.readonly`, `youtube.force-ssl`, `yt-analytics.readonly`.
`youtube.force-ssl` is needed because `videos.update` accepts no narrower scope; it is used only to
set the publish time and visibility of videos the user approved.

---

## Compliance notes

- **Privacy policy** — _Host `docs/legal/privacy-policy.md` and put the URL here._ Also readable
  inside the app with no network, at Settings → Legal and data.
- **Terms** — _Host `docs/legal/terms.md` and put the URL here._ They state that using ShortStack
  means agreeing to the YouTube Terms of Service.
- **Consent before acting** — Approving a video opens a dialog naming the channel, the visibility
  and the publish time of every video in the selection, and stating what will happen without
  further input. Automatic approval is off by default and its own dialog spells out what changes.
- **Final control** — AI suggestions are applied one field at a time, only when the user presses
  Use this, and are a draft until saved. No value is changed without the user doing it.
- **Record of actions** — History lists everything ShortStack did on the user's behalf, separately
  from what the user did, with timestamps.
- **Revocation and deletion** — Settings → Legal and data → Disconnect and delete YouTube data
  revokes the token immediately and deletes the stored tokens, channel details, cached channel
  picture and analytics. The same page links to the Google account permissions page. Uploaded
  videos keep a local marker so they can never be uploaded a second time.
- **Retention** — Channel details and the channel picture are refreshed on every launch and are
  deleted if they cannot be refreshed for 30 days.
- **Branding** — The name contains no YouTube mark. The interface is inspired by dark-mode creator
  tools but uses ShortStack's own mark and colours, and is never labelled as YouTube Studio. The
  app icon is three stacked bars, deliberately nothing like a play button.

---

## Screencast

See `screencast-script.md`.
