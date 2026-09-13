# ShortStack changelog

_Generated from `src/shared/changelog.ts`, which is what the app shows after an update. Edit that._

## 1.1.0 — Suggestions that have seen the video, and drafting that runs on its own

_Released 2026-09-13_

- Suggestions now go to the model with your channel’s own recent uploads as examples, the video’s details, and three stills taken from across the clip — instead of just the file name.
- Models are chosen from a list of what Ollama has installed, marked by whether they can see the video, with a button that loads one and tells you if it will not run.
- A new switch drafts titles, descriptions and tags for new videos automatically. It never writes over details you have edited yourself.
- The calendar marks videos YouTube is holding, so a time it has agreed to is no longer indistinguishable from a plan kept on this computer.
- Reusing the details of a video you published before, from a searchable list of your past uploads.
- Settings shows which build you are running, and the launcher closes the app before rebuilding it.

## 1.0.0 — First working version

_Released 2026-09-12_

- Watches a folder of finished Shorts, and nothing leaves it without your approval.
- Schedules by dragging onto a calendar, with YouTube publishing at the time even when this computer is off.
- Re-posts videos on a rotation without notifying subscribers, so the same video reaches new people.
- Uploads either through YouTube Studio with ShortStack guiding you, or directly once your API audit passes.

**This release changed the privacy policy or terms of use.** ShortStack asks you to agree again before it will run.

- The privacy policy and terms of use were published for the first time.
