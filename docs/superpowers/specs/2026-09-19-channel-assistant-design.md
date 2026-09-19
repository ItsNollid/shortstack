# Channel assistant — design

**Status:** approved in conversation, 2026-09-19. **Scope:** one YouTube channel (the connected one).

## Goal

A chat panel inside ShortStack that answers questions about the channel, a single video, the posting
plan, or why something is stuck — grounded only in what ShortStack's own code has already measured.
It suggests changes as buttons the person presses. It can never approve, schedule or upload anything.

The rule it inherits from the Analytics advice (`src/main/ai/insightPrompt.ts`): **code measures, the
model only phrases.** A small local model is never shown raw numbers or tables, because it produces
confident arithmetic that is wrong, and confident wrong advice about someone's channel is worse than none.

## What it answers

The panel knows where it was opened, and offers questions to match. Free typing is always allowed.

| Opened on | Scope | Suggested questions |
|---|---|---|
| Analytics, or nothing specific | Channel | How's my channel doing? · What should I change? · When should I post? · What's working in my titles? |
| A video not yet published | That video | Is this title good? · Does the first second hold? · What would you change? |
| A published video | That video | How is this one doing? |
| A video that failed or needs attention | That video | Why is this stuck? |
| Calendar or Queue | Plan | What should I post next? · Is my week balanced? |

A short channel summary is included in every scope, so "and how's the channel overall?" works from a video.

## The experience

- **Panel** slides in from the right on every page, opened from the sidebar, from **Ask** buttons on a
  video and on each Analytics finding, or with **Ctrl+K**. (Review's single-key shortcuts ignore
  modifier keys, so nothing clashes.)
- **Scope chip** at the top — "About: round-50-clutch ×". Clearing it widens to the whole channel.
- **Answers stream** as they are written. While a thinking model is still thinking, it says so.
- **Under each answer:**
  - suggested changes as buttons (below);
  - **Based on** — what the answer drew from, e.g. "34 videos over 90 days; time of day: strong";
  - **follow-up questions**, chosen by code from what was just asked.
- **When it does not know**, it says so and offers what would help ("Refresh Analytics").
- **Stop** ends a long answer; what already arrived stays, marked unfinished. **Clear** empties the chat.
- **Memory:** the conversation lasts while the app is open and is never written to disk.

## How an answer is made

1. **Facts (code).** For the scope, code produces finished sentences, each with a short id:
   - *Channel* — the findings Analytics saved, with confidence, and how old they are.
   - *Video* — its state and the reason (from `presentation.ts`); the cover and first-second check; the
     title-vs-screen check; the description check; what was said, if listened to (an excerpt); its title
     kind; file warnings such as "not a Short".
   - *Published video* — its numbers against the channel's usual, computed in code: "about twice your
     usual views", "people watch 12 points less of it than usual", "subscribers per thousand views: above
     usual". These come from the latest Analytics pull held in memory, which a restart clears; with none,
     the answer offers Refresh Analytics instead of comparing.
   - *Plan* — counts by state; the next seven days; empty days; the same game or long video back to back;
     new against re-runs; what Fill the calendar would do.
   - *Stuck* — the attention reason, the last error in plain words, when it will try again.
2. **Answer (model, streamed).** The prompt carries the facts, the last six turns, and the rules: use only
   these facts; never give a number that is not in them; say "not measured" when the facts do not cover
   it; keep it short; propose changes only in the fixed format at the end.
3. **Changes (code checks).** The reply's change block is parsed; only known kinds survive:
   - the existing setting changes in `shared/channelActions.ts` (posting times, title case and suffix,
     description footer, hashtag limit, automatic drafting);
   - for a video in scope, a **title, description or tags draft**.

   Anything else is dropped without comment. There is no kind for approve, schedule or upload.
4. **The person presses it.** Setting changes go through the same confirm-and-apply path Analytics uses
   (`changeFor` → a described `SettingChange`). Video drafts land in the field exactly as today's
   suggestions do: a title replaces; a description or tags can replace, add to the start or add to the
   end (`shared/suggestionMerge.ts`).

## Improvements beyond the conversation

Added because the brief said to improve it where possible. Each is small.

1. **Number check.** Before an answer is shown as final, code lists every number in it with two or more
   digits, a decimal or a percent sign, and looks for each in the facts and the conversation. One found
   in neither is marked in the answer — "47% is not in your data" — rather than silently trusted. Single
   digits pass. This is "code measures" enforced on the way out, not only on the way in.
2. **Warm start.** Opening the panel asks Ollama to load the model in the background, so the first answer
   does not also pay for a cold load.
3. **Stale findings said out loud.** Saved findings gain the date they were made. Past seven days, every
   channel answer says so, with Refresh Analytics beside it. Findings saved before this change have no
   date and count as old.
4. **Ask from where you are.** An Ask button on a video and on each Analytics finding opens the panel
   already scoped, with that finding's "why" question ready.
5. **Screen readers.** A finished answer is announced once, politely — not every streamed word.

## Model

The assistant uses the model chosen in Settings for suggestions. Settings gains one optional control,
**Model for the assistant**, defaulting to *Same as suggestions* (setting `assistant_model`; empty means
the same). It needs no vision, because video reports reach it as text, so a text model will usually
answer faster.

## Units

| Unit | Does | Depends on |
|---|---|---|
| `shared/assistant/facts.ts` | Fact sentences for each scope; pure | insights, presentation, videoReading, titlePromise, queue types |
| `shared/assistant/compare.ts` | A published video against the channel's usual | `insights.median` |
| `shared/assistant/plan.ts` | Plan balance: gaps, runs of one game or long video | queue DTOs, `fillSchedule` |
| `shared/assistant/prompt.ts` | The prompt from facts, history and scope | facts |
| `shared/assistant/reply.ts` | Splits prose from the change block; parses changes; the number check | `channelActions` |
| `shared/assistant/followUps.ts` | Follow-up questions for a scope and the last question | — |
| `main/ai/ollamaChat.ts` | Streaming `/api/chat`: reads NDJSON, separates thinking from content, aborts, warms | settings |
| `main/assistant/service.ts` | Gathers facts from the database for a scope; one request at a time; emits stream events | the above, repos |
| IPC | `assistantAsk(scope, question, history)`, `assistantStop(id)`, `assistantWarm()`; event `assistant:stream` | `shared/ipc.ts` |
| `src/renderer/components/assistant/AssistantPanel.tsx`, `useAssistant.ts` | The panel, chips, streaming view, change buttons | IPC, existing apply paths |

`insight_findings` stays the store for findings. The Brief gains `madeAt`, and `parseBrief` accepts
briefs without it.

## Safety and privacy

- Nothing leaves the computer: it is the same local Ollama as suggestions, and nothing is written to disk.
  The privacy policy needs no change, so `LEGAL_VERSION` does not move.
- The creator's own text in the facts — titles, descriptions, what was said — is quoted and labelled as
  their content, and what was said is cut to an excerpt. A title reading "ignore your instructions" can at
  worst produce an odd sentence: every change still has to be a known kind and still needs a button press.
- The approval gate is untouched. Nothing the assistant can reach approves, schedules or uploads.

## When things go wrong

| Case | What the person sees |
|---|---|
| Ollama not running, no model, model missing | The same plain messages suggestions use, with Retry |
| Timeout | "It took too long", with Retry; the limit matches the advice call |
| Stopped or cut off mid-answer | The text so far, marked unfinished |
| The reply's change block is unreadable | The prose alone, with no buttons |
| No findings saved yet | Channel answers say nothing is measured yet, with Refresh Analytics |
| Published video missing from the last Analytics pull | "Refresh Analytics to compare this one" |

## Testing

- **Facts:** each scope from fixed data — the right sentences; weak findings called weak; "twice your
  usual" correct at its boundaries; excerpts cut to length.
- **Reply:** changes outside the known kinds rejected, including attempts at approve, schedule and upload;
  an unreadable block leaves the prose intact; the number check flags invented numbers and passes ones
  found in the facts.
- **Stream reader:** answers split mid-word and mid-line; thinking before content; an abort mid-stream.
- **Service:** one request at a time; Stop ends it; facts gathered for each scope from a test database.
- **End to end:** the panel against a stand-in model server — open on a video, ask, see a streamed answer,
  press a suggested title and see it land as a draft; and a stuck video's "why" answer.

## Not in this design

- TikTok and Instagram numbers — there is nothing to read until the developer apps exist.
- Keeping conversations after the app closes.
- More than one YouTube channel.
