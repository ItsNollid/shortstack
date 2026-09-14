# ShortStack Privacy Policy

_Last updated 2026-09-13_

## What ShortStack is

ShortStack is a desktop application that you run on your own computer. It helps you queue, approve and schedule short videos for a YouTube channel you control.

ShortStack uses YouTube API Services. By using it you also agree to the YouTube Terms of Service at https://www.youtube.com/t/terms, and Google’s Privacy Policy at https://policies.google.com/privacy applies to Google’s handling of your data.

ShortStack is not affiliated with, endorsed by, or sponsored by YouTube or Google.

## What it accesses

With your permission, ShortStack asks Google for access to: uploading videos to your channel, reading your channel’s videos and details, changing videos it uploaded or that you linked to it, and reading your channel’s analytics.

It reads the video files in the folder you choose, along with their names, sizes and durations.

If you switch on listening, ShortStack also reads the sound of the videos it drafts details for and turns what is said into text with whisper.cpp, on your computer. What was said is kept with the video, on this computer.

## Where your data is kept

Everything ShortStack stores is kept on your computer: a local database file, your video details, your settings, and your Google sign-in tokens, which are encrypted using the operating system’s own secure storage.

There is no ShortStack server. Your data is never sent to the developer or to any third party. The only services ShortStack contacts are Google’s YouTube APIs; an Ollama model running on your own computer, if you switch suggestions on; and, only when you ask it to download listening software, GitHub (github.com) for the whisper.cpp engine and Hugging Face (huggingface.co) for a model. Nothing from your videos is sent with those downloads.

## How long it is kept

Channel details and your channel picture are refreshed while ShortStack is connected. If they cannot be refreshed for 30 days, they are deleted.

Your queue, settings and activity record stay on your computer until you delete them or uninstall the app.

## Removing your data

Settings, then Legal and data, has “Disconnect and delete YouTube data”. It revokes ShortStack’s access with Google straight away and deletes the stored tokens, channel details, channel picture and analytics from this computer.

You can also remove ShortStack’s access at any time from the Google security settings page at https://myaccount.google.com/permissions. If you do, ShortStack deletes the same data the next time it runs, and within 30 days at the latest.

Downloaded listening engines and models can be removed in Settings, under Listening to videos.

## Contact

Questions about this policy can be raised on the ShortStack project page.

---

_This page is generated from the text bundled in the app. Edit `src/shared/legal.ts`._
